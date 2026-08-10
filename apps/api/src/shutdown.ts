/**
 * Encerramento gracioso (spec §26). Extraído do bootstrap para ser testável de
 * forma determinística (sem depender de sinais reais do SO): fecha os recursos
 * na ordem dada, é idempotente (SIGTERM + SIGINT não rodam duas vezes) e tem um
 * timeout que força a saída se algo travar — melhor forçar do que pendurar o
 * deploy.
 */
export interface Closer {
  name: string;
  close: () => Promise<unknown>;
}

export interface ShutdownDeps {
  closers: Closer[];
  logger: {
    info: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
  };
  /** Injetável para teste; em produção é `process.exit`. */
  onExit: (code: number) => void;
  timeoutMs?: number;
}

export function createGracefulShutdown(deps: ShutdownDeps): (signal: string) => Promise<void> {
  let running = false;
  return async (signal: string) => {
    if (running) return;
    running = true;
    deps.logger.info({ signal }, 'Encerrando...');

    const timer = setTimeout(() => {
      deps.logger.error({}, 'Timeout no shutdown — forçando saída.');
      deps.onExit(1);
    }, deps.timeoutMs ?? 10_000);
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as { unref: () => void }).unref();
    }

    try {
      for (const closer of deps.closers) {
        await closer.close();
      }
      clearTimeout(timer);
      deps.logger.info({}, 'Encerrado com sucesso.');
      deps.onExit(0);
    } catch (err) {
      clearTimeout(timer);
      deps.logger.error({ err }, 'Falha no encerramento gracioso.');
      deps.onExit(1);
    }
  };
}

import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown } from '../shutdown.js';

const silentLogger = { info: () => {}, error: () => {} };

describe('createGracefulShutdown', () => {
  it('fecha todos os recursos na ordem e sai com 0', async () => {
    const order: string[] = [];
    const onExit = vi.fn();
    const shutdown = createGracefulShutdown({
      logger: silentLogger,
      onExit,
      closers: [
        { name: 'http', close: async () => void order.push('http') },
        { name: 'prisma', close: async () => void order.push('prisma') },
        { name: 'redis', close: async () => void order.push('redis') },
      ],
    });

    await shutdown('SIGTERM');

    expect(order).toEqual(['http', 'prisma', 'redis']);
    expect(onExit).toHaveBeenCalledWith(0);
  });

  it('é idempotente: uma segunda chamada não refecha nem re-sai', async () => {
    const onExit = vi.fn();
    const close = vi.fn(async () => {});
    const shutdown = createGracefulShutdown({
      logger: silentLogger,
      onExit,
      closers: [{ name: 'http', close }],
    });

    await shutdown('SIGTERM');
    await shutdown('SIGINT');

    expect(close).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('sai com 1 quando um recurso falha ao fechar', async () => {
    const onExit = vi.fn();
    const shutdown = createGracefulShutdown({
      logger: silentLogger,
      onExit,
      closers: [
        { name: 'http', close: async () => {} },
        {
          name: 'prisma',
          close: async () => {
            throw new Error('db close failed');
          },
        },
      ],
    });

    await shutdown('SIGTERM');

    expect(onExit).toHaveBeenCalledWith(1);
  });

  it('força saída (1) quando o fechamento excede o timeout', async () => {
    vi.useFakeTimers();
    const onExit = vi.fn();
    const shutdown = createGracefulShutdown({
      logger: silentLogger,
      onExit,
      timeoutMs: 50,
      // Nunca resolve: simula um close travado.
      closers: [{ name: 'stuck', close: () => new Promise<void>(() => {}) }],
    });

    void shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(60);

    expect(onExit).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });
});

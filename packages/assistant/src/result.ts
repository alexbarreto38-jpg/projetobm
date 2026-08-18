/**
 * Classificação obrigatória do resultado de toda ação (spec §24). A IA nunca
 * pode dizer que algo aconteceu se o backend não confirmou. Cada resultado de
 * ferramenta carrega um `outcome` explícito; o prompt do sistema instrui o
 * modelo a diferenciar esses estados ao falar com o usuário.
 */
export type ToolOutcome =
  | 'planned' //     preparado, ainda não solicitado ao backend
  | 'requested' //   solicitado; aguardando confirmação da API
  | 'processing' //  em andamento (ex.: disparo enfileirado)
  | 'confirmed' //   o backend/API confirmou o efeito
  | 'failed'; //     falhou — o erro é reportado, nunca escondido (spec §22)

export interface ToolResult<T = unknown> {
  ok: boolean;
  outcome: ToolOutcome;
  /** Dados estruturados para o modelo raciocinar (spec §26). */
  data?: T;
  /** Mensagem legível — em caso de erro, já traduzida (spec §22). */
  message?: string;
  /** Código de erro estável, quando aplicável. */
  errorCode?: string;
}

export function ok<T>(outcome: Exclude<ToolOutcome, 'failed'>, data?: T, message?: string): ToolResult<T> {
  return { ok: true, outcome, data, message };
}

export function fail(message: string, errorCode?: string): ToolResult<never> {
  return { ok: false, outcome: 'failed', message, errorCode };
}

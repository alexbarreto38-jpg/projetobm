/**
 * Erro da API do Infobip, com os campos oficiais preservados para suporte e uma
 * mensagem amigável ao usuário (spec §22, §48). Nunca escondemos o erro técnico;
 * apenas o traduzimos.
 */
export class InfobipApiError extends Error {
  constructor(
    readonly status: number,
    readonly messageId?: string,
    readonly detail?: string,
    readonly raw?: unknown,
  ) {
    super(`Infobip API ${status}${messageId ? ` (${messageId})` : ''}: ${detail ?? ''}`.trim());
    this.name = 'InfobipApiError';
  }

  /** Mensagem em linguagem simples para o assistente repassar (spec §22). */
  toUserMessage(): string {
    if (this.status === 401 || this.status === 403) {
      return 'As credenciais do Infobip foram recusadas. Verifique a chave de API configurada.';
    }
    if (this.status === 429) {
      return 'O Infobip está limitando as requisições no momento. Tente novamente em instantes.';
    }
    if (this.status >= 500) {
      return 'O Infobip está com instabilidade no momento. A operação não foi concluída.';
    }
    return this.detail
      ? `O Infobip recusou a operação: ${this.detail}`
      : 'O Infobip recusou a operação.';
  }
}

/**
 * Erros de aplicação com status HTTP. Nunca expomos stack trace ao cliente
 * (spec §48). Handlers lançam AppError; o error handler central traduz.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Não autenticado.') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Sem permissão.') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Não encontrado.') => new AppError(404, 'NOT_FOUND', message);
export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

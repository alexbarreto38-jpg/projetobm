import { hashPassword } from '@wise/auth';
import type { PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';

/**
 * Recuperação de acesso sem e-mail configurado: redefine a senha de um usuário a
 * partir da variável de ambiente `ADMIN_PASSWORD_RESET`, no formato
 * `email|novaSenha`, durante o boot da API.
 *
 * ⚠️ Uso pontual. Depois de recuperar o acesso, REMOVA a variável do ambiente —
 * ela guarda a senha em texto puro. É idempotente: reexecutar com o mesmo valor
 * apenas reaplica o mesmo hash. Nunca derruba o boot em caso de erro.
 */
export async function maybeResetPasswordFromEnv(prisma: PrismaClient): Promise<void> {
  const raw = process.env.ADMIN_PASSWORD_RESET;
  if (!raw) return;

  const sep = raw.indexOf('|');
  if (sep <= 0) {
    logger.warn('ADMIN_PASSWORD_RESET malformada — use o formato email|novaSenha.');
    return;
  }
  const email = raw.slice(0, sep).trim();
  const password = raw.slice(sep + 1);
  if (!email || !password) {
    logger.warn('ADMIN_PASSWORD_RESET malformada — email ou senha vazios.');
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user) {
      logger.warn({ email }, 'ADMIN_PASSWORD_RESET: usuário não encontrado.');
      return;
    }
    const passwordHash = await hashPassword(password);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    logger.info(
      { email },
      'ADMIN_PASSWORD_RESET: senha redefinida com sucesso. REMOVA a variável do ambiente agora.',
    );
  } catch (err) {
    logger.error({ err }, 'ADMIN_PASSWORD_RESET: falha ao redefinir a senha.');
  }
}

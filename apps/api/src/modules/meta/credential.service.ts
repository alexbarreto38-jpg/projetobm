import type { Prisma, PrismaClient } from '@wise/database';
import type { CredentialVault } from '@wise/meta-provider';

/**
 * CredentialService (spec §8). Cifra tokens no CredentialVault antes de
 * persistir; expõe o texto puro apenas para uso no backend ao montar chamadas
 * à Meta. Nunca retorna o token completo para a interface.
 */
export class CredentialService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly vault: CredentialVault,
  ) {}

  async store(params: {
    organizationId: string;
    plaintextToken: string;
    tokenType?: string;
    scopes?: string[];
    expiresAt?: Date | null;
    tx?: Prisma.TransactionClient;
  }) {
    const client = params.tx ?? this.prisma;
    const encryptedToken = this.vault.encrypt(params.plaintextToken);
    return client.credential.create({
      data: {
        organizationId: params.organizationId,
        provider: 'meta',
        encryptedToken,
        keyVersion: this.vault.keyVersionOf(encryptedToken),
        tokenType: params.tokenType,
        scopes: params.scopes ?? [],
        expiresAt: params.expiresAt ?? null,
        status: 'ACTIVE',
        lastValidatedAt: new Date(),
      },
    });
  }

  /** Decifra o token de uma credencial ativa. Uso exclusivo do backend. */
  async reveal(credentialId: string): Promise<string | null> {
    const cred = await this.prisma.credential.findUnique({ where: { id: credentialId } });
    if (!cred || cred.status !== 'ACTIVE') return null;
    return this.vault.decrypt(cred.encryptedToken);
  }

  async revoke(credentialId: string): Promise<void> {
    await this.prisma.credential.update({
      where: { id: credentialId },
      data: { status: 'REVOKED' },
    });
  }
}

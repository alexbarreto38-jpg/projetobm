import { assertPermission, type AuthContext } from '@wise/auth';
import type { Prisma, PrismaClient } from '@wise/database';
import {
  normalizePhone,
  type CreateContactInput,
  type OptoutInput,
  type RecordConsentInput,
  type CountryCode,
} from '@wise/validation';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { toCsv } from '../../lib/csv.js';

/**
 * ContactService (spec §20, §21, §22). Telefones normalizados para E.164 e
 * deduplicados por (organização, telefone). Consentimento e opt-out são
 * fundamentais para compliance e verificados antes de qualquer envio (§24).
 */
export class ContactService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(ctx: AuthContext, organizationId: string, input: CreateContactInput) {
    assertPermission(ctx, organizationId, 'contact:write');
    const phone = normalizePhone(input.phone, (input.defaultCountry as CountryCode) ?? 'BR');
    if (!phone) throw badRequest('Telefone inválido.');

    const existing = await this.prisma.contact.findUnique({
      where: { organizationId_phone: { organizationId, phone } },
    });
    if (existing) throw conflict('Contato já existe para esta organização.');

    return this.prisma.contact.create({
      data: {
        organizationId,
        phone,
        name: input.name,
        customFields: (input.customFields as Prisma.InputJsonValue) ?? undefined,
        source: input.source,
      },
    });
  }

  async list(ctx: AuthContext, organizationId: string, limit = 50, cursor?: string) {
    assertPermission(ctx, organizationId, 'contact:read');
    const contacts = await this.prisma.contact.findMany({
      where: { organizationId },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        consents: { where: { status: 'GRANTED' }, select: { consentType: true } },
        optouts: { select: { id: true } },
      },
    });
    const nextCursor = contacts.length > limit ? contacts.pop()!.id : null;
    return {
      contacts: contacts.map((c) => ({
        ...c,
        isOptedOut: c.optouts.length > 0,
        consentTypes: c.consents.map((x) => x.consentType),
        consents: undefined,
        optouts: undefined,
      })),
      nextCursor,
    };
  }

  /**
   * Exporta todos os contatos da organização em CSV (spec §40). Somente dados
   * operacionais do próprio tenant; nenhum segredo. Sem paginação — pensado para
   * download pontual pelo painel.
   */
  async exportCsv(ctx: AuthContext, organizationId: string): Promise<string> {
    assertPermission(ctx, organizationId, 'contact:read');
    const contacts = await this.prisma.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        consents: { where: { status: 'GRANTED' }, select: { consentType: true } },
        optouts: { select: { id: true } },
      },
    });
    return toCsv(
      ['phone', 'name', 'consent', 'status', 'created_at'],
      contacts.map((c) => [
        c.phone,
        c.name ?? '',
        c.consents.map((x) => x.consentType).join('|'),
        c.optouts.length > 0 ? 'opted_out' : 'active',
        c.createdAt.toISOString(),
      ]),
    );
  }

  private async requireContact(organizationId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, organizationId },
    });
    if (!contact) throw notFound('Contato não encontrado.');
    return contact;
  }

  // --- consentimento (spec §21) -------------------------------------------
  async recordConsent(
    ctx: AuthContext,
    organizationId: string,
    contactId: string,
    input: RecordConsentInput,
  ) {
    assertPermission(ctx, organizationId, 'contact:write');
    await this.requireContact(organizationId, contactId);
    return this.prisma.contactConsent.create({
      data: {
        organizationId,
        contactId,
        consentType: input.consentType,
        source: input.source,
        evidence: (input.evidence as Prisma.InputJsonValue) ?? undefined,
        status: 'GRANTED',
      },
    });
  }

  // --- opt-out (spec §22) --------------------------------------------------
  async optOut(
    ctx: AuthContext,
    organizationId: string,
    contactId: string,
    input: OptoutInput,
  ) {
    assertPermission(ctx, organizationId, 'contact:write');
    await this.requireContact(organizationId, contactId);
    // Idempotente: um contato só entra uma vez na lista de exclusão.
    return this.prisma.contactOptout.upsert({
      where: { organizationId_contactId: { organizationId, contactId } },
      create: { organizationId, contactId, reason: input.reason, source: input.source },
      update: { reason: input.reason, source: input.source },
    });
  }

  async removeOptOut(ctx: AuthContext, organizationId: string, contactId: string) {
    assertPermission(ctx, organizationId, 'contact:write');
    await this.prisma.contactOptout
      .delete({ where: { organizationId_contactId: { organizationId, contactId } } })
      .catch(() => undefined);
  }
}

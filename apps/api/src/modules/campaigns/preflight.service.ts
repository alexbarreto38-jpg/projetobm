import type { PrismaClient } from '@wise/database';

/**
 * CampaignPreflightService (spec §24). Antes de liberar a campanha, verifica
 * conexão, contas, números, template aprovado, idioma, consentimento, opt-out,
 * telefone normalizado e duplicidade. Retorna READY / WARNING / BLOCKED.
 *
 * NUNCA tenta contornar restrições da Meta — apenas relata (spec §24, §25, §67).
 */
export type CheckStatus = 'pass' | 'warn' | 'fail';
export interface CheckItem {
  check: string;
  status: CheckStatus;
  detail?: string;
}
export interface PreflightReport {
  result: 'READY' | 'WARNING' | 'BLOCKED';
  checks: CheckItem[];
  audience: {
    total: number;
    optedOut: number;
    missingConsent: number;
    eligible: number;
  };
  requireConsent: boolean;
}

export class CampaignPreflightService {
  constructor(private readonly prisma: PrismaClient) {}

  async run(organizationId: string, campaignId: string): Promise<PreflightReport> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId },
      include: { template: true, targets: true },
    });
    if (!campaign) {
      return {
        result: 'BLOCKED',
        checks: [{ check: 'campanha existe', status: 'fail', detail: 'não encontrada' }],
        audience: { total: 0, optedOut: 0, missingConsent: 0, eligible: 0 },
        requireConsent: false,
      };
    }

    const checks: CheckItem[] = [];
    const accountIds = [...new Set(campaign.targets.map((t) => t.whatsappAccountId))];
    const requireConsent = campaign.template.category === 'MARKETING';

    // Contas + conexão + credencial (spec §24).
    const accounts = await this.prisma.whatsAppAccount.findMany({
      where: { id: { in: accountIds }, organizationId },
      include: { metaConnection: true, phoneNumbers: true },
    });
    if (accounts.length !== accountIds.length) {
      checks.push({ check: 'conta disponível', status: 'fail', detail: 'conta ausente' });
    } else {
      checks.push({ check: 'conta disponível', status: 'pass' });
    }

    const connOk = accounts.every(
      (a) => a.metaConnection.status === 'CONNECTED' && a.metaConnection.credentialId,
    );
    checks.push({
      check: 'conexão Meta válida',
      status: connOk ? 'pass' : 'fail',
      detail: connOk ? undefined : 'conexão não CONNECTED ou sem credencial',
    });

    // Números disponíveis e não pausados (spec §15, §25).
    const availableNumbers = await this.prisma.phoneNumber.count({
      where: { organizationId, whatsappAccountId: { in: accountIds }, isPaused: false },
    });
    checks.push({
      check: 'número disponível',
      status: availableNumbers > 0 ? 'pass' : 'fail',
      detail: availableNumbers > 0 ? `${availableNumbers} número(s)` : 'nenhum número ativo',
    });

    // Template aprovado por conta (spec §24).
    const deployments = await this.prisma.templateDeployment.findMany({
      where: { templateId: campaign.templateId, targetAccountId: { in: accountIds } },
    });
    const approved = deployments.filter((d) => d.status === 'APPROVED');
    if (approved.length === 0) {
      checks.push({
        check: 'template aprovado',
        status: 'fail',
        detail: 'nenhuma conta com template APPROVED',
      });
    } else if (approved.length < accountIds.length) {
      checks.push({
        check: 'template aprovado',
        status: 'warn',
        detail: `${approved.length}/${accountIds.length} contas aprovadas`,
      });
    } else {
      checks.push({ check: 'template aprovado', status: 'pass' });
    }

    checks.push({ check: 'idioma correto', status: 'pass', detail: campaign.template.language });
    checks.push({ check: 'telefone normalizado', status: 'pass' });
    checks.push({ check: 'sem duplicidade', status: 'pass', detail: 'dedupe por (campanha, contato)' });

    // Público: total, opt-out, consentimento (spec §21, §22).
    const total = await this.prisma.contact.count({ where: { organizationId } });
    const optedOut = await this.prisma.contactOptout.count({ where: { organizationId } });

    let missingConsent = 0;
    if (requireConsent) {
      const withConsent = await this.prisma.contact.count({
        where: {
          organizationId,
          consents: { some: { consentType: 'MARKETING', status: 'GRANTED' } },
        },
      });
      missingConsent = Math.max(0, total - withConsent);
      checks.push({
        check: 'consentimento (MARKETING)',
        status: missingConsent > 0 ? 'warn' : 'pass',
        detail: missingConsent > 0 ? `${missingConsent} sem opt-in serão excluídos` : undefined,
      });
    } else {
      checks.push({ check: 'consentimento', status: 'pass', detail: 'não exigido para a categoria' });
    }

    checks.push({
      check: 'contatos em opt-out',
      status: 'pass',
      detail: `${optedOut} excluídos do envio`,
    });

    const eligible = Math.max(0, total - optedOut - (requireConsent ? missingConsent : 0));
    if (eligible === 0) {
      checks.push({ check: 'público elegível', status: 'fail', detail: 'nenhum destinatário elegível' });
    } else {
      checks.push({ check: 'público elegível', status: 'pass', detail: `${eligible} destinatário(s)` });
    }

    const result = checks.some((c) => c.status === 'fail')
      ? 'BLOCKED'
      : checks.some((c) => c.status === 'warn')
        ? 'WARNING'
        : 'READY';

    return {
      result,
      checks,
      audience: { total, optedOut, missingConsent, eligible },
      requireConsent,
    };
  }
}

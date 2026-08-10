import { assertPermission, type AuthContext } from '@wise/auth';
import type { Prisma, PrismaClient } from '@wise/database';
import { toCsv } from '../../lib/csv.js';

/**
 * ReportsService (spec §32). Agrega o funil de mensagens (enviadas, entregues,
 * lidas, falhas, pendentes) com filtros por data, conta, número, campanha e
 * template, e calcula as taxas de entrega/leitura/falha.
 */
export interface ReportFilters {
  from?: string;
  to?: string;
  campaignId?: string;
  phoneNumberId?: string;
}

export interface MessageReport {
  counts: {
    total: number;
    queued: number;
    processing: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
  };
  rates: {
    delivery: number; // entregues / (enviadas+entregues+lidas)
    read: number; // lidas / entregues (aprox.)
    failure: number; // falhas / total
  };
}

export class ReportsService {
  constructor(private readonly prisma: PrismaClient) {}

  async messages(
    ctx: AuthContext,
    organizationId: string,
    filters: ReportFilters = {},
  ): Promise<MessageReport> {
    assertPermission(ctx, organizationId, 'report:read');

    const where: Prisma.MessageWhereInput = {
      organizationId,
      ...(filters.campaignId ? { campaignId: filters.campaignId } : {}),
      ...(filters.phoneNumberId ? { phoneNumberId: filters.phoneNumberId } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };

    const grouped = await this.prisma.message.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const by = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
    const counts = {
      queued: by('QUEUED'),
      processing: by('PROCESSING') + by('ACCEPTED'),
      sent: by('SENT'),
      delivered: by('DELIVERED'),
      read: by('READ'),
      failed: by('FAILED'),
      total: 0,
    };
    counts.total =
      counts.queued + counts.processing + counts.sent + counts.delivered + counts.read + counts.failed;

    // Uma mensagem lida também foi entregue/enviada; para taxas usamos o alcance
    // efetivo (enviadas+entregues+lidas) como denominador de entrega.
    const reached = counts.sent + counts.delivered + counts.read;
    const rates = {
      delivery: reached > 0 ? round((counts.delivered + counts.read) / reached) : 0,
      read: counts.delivered + counts.read > 0 ? round(counts.read / (counts.delivered + counts.read)) : 0,
      failure: counts.total > 0 ? round(counts.failed / counts.total) : 0,
    };

    return { counts, rates };
  }

  /** Mesmo relatório de mensagens, serializado como CSV (metric,value). */
  async messagesCsv(
    ctx: AuthContext,
    organizationId: string,
    filters: ReportFilters = {},
  ): Promise<string> {
    const report = await this.messages(ctx, organizationId, filters);
    const rows: [string, number][] = [
      ['total', report.counts.total],
      ['queued', report.counts.queued],
      ['processing', report.counts.processing],
      ['sent', report.counts.sent],
      ['delivered', report.counts.delivered],
      ['read', report.counts.read],
      ['failed', report.counts.failed],
      ['delivery_rate', report.rates.delivery],
      ['read_rate', report.rates.read],
      ['failure_rate', report.rates.failure],
    ];
    return toCsv(['metric', 'value'], rows);
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

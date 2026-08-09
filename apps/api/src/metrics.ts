import type { PrismaClient } from '@wise/database';
import { collectDefaultMetrics, Gauge, Registry } from 'prom-client';

/**
 * Métricas Prometheus (observabilidade de produção). Expõe métricas de processo
 * + alguns indicadores da aplicação atualizados a cada scrape. NÃO inclui dados
 * sensíveis (apenas contagens agregadas).
 */
export function createMetrics(prisma: PrismaClient) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const messagesByStatus = new Gauge({
    name: 'wise_messages_total',
    help: 'Total de mensagens por status interno',
    labelNames: ['status'] as const,
    registers: [registry],
  });
  const openAlerts = new Gauge({
    name: 'wise_open_alerts',
    help: 'Alertas do sistema abertos/reconhecidos',
    registers: [registry],
  });
  const deadLetters = new Gauge({
    name: 'wise_dead_letter_pending',
    help: 'Jobs na dead-letter ainda não resolvidos',
    registers: [registry],
  });

  async function refresh() {
    const [byStatus, alerts, dlq] = await Promise.all([
      prisma.message.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.systemAlert.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
      prisma.deadLetterJob.count({ where: { resolvedAt: null } }),
    ]);
    messagesByStatus.reset();
    for (const g of byStatus) messagesByStatus.set({ status: g.status }, g._count._all);
    openAlerts.set(alerts);
    deadLetters.set(dlq);
  }

  return { registry, refresh };
}

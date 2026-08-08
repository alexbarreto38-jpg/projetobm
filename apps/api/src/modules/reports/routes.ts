import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { AccountHealthService } from '../meta/health.service.js';
import { ReportsService } from './reports.service.js';

interface OrgParams {
  id: string;
}
interface AccountParams {
  id: string;
  accountId: string;
}
interface AlertParams {
  id: string;
  alertId: string;
}
interface ReportQuery {
  from?: string;
  to?: string;
  campaignId?: string;
  phoneNumberId?: string;
}

/**
 * Rotas de observabilidade (spec §29, §32, §36): saúde por conta, relatórios de
 * mensagens e alertas do sistema.
 */
export async function registerReportRoutes(app: FastifyInstance, config: AppConfig) {
  const reports = new ReportsService(config.prisma);
  const health = new AccountHealthService(config.prisma);
  const alerts = new AlertsService(config.prisma);

  app.get<{ Params: OrgParams; Querystring: ReportQuery }>(
    '/organizations/:id/reports/messages',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        report: await reports.messages(ctx, request.params.id, request.query),
      });
    },
  );

  app.get<{ Params: AccountParams }>(
    '/organizations/:id/meta/accounts/:accountId/health',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        health: await health.check(ctx, request.params.id, request.params.accountId),
      });
    },
  );

  app.get<{ Params: OrgParams }>('/organizations/:id/alerts', async (request, reply) => {
    const ctx = app.requireAuth(request);
    return reply.send({ alerts: await alerts.list(ctx, request.params.id) });
  });

  app.post<{ Params: AlertParams }>(
    '/organizations/:id/alerts/:alertId/acknowledge',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        alert: await alerts.setStatus(ctx, request.params.id, request.params.alertId, 'ACKNOWLEDGED'),
      });
    },
  );

  app.post<{ Params: AlertParams }>(
    '/organizations/:id/alerts/:alertId/resolve',
    async (request, reply) => {
      const ctx = app.requireAuth(request);
      return reply.send({
        alert: await alerts.setStatus(ctx, request.params.id, request.params.alertId, 'RESOLVED'),
      });
    },
  );
}

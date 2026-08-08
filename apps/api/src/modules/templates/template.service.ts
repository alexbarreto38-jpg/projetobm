import { assertPermission, type AuthContext } from '@wise/auth';
import type { Prisma, PrismaClient } from '@wise/database';
import type {
  CreateTemplateInput,
  DuplicateTemplateInput,
  UpdateTemplateInput,
} from '@wise/validation';
import { badRequest, conflict, notFound } from '../../lib/errors.js';

/**
 * TemplateService (spec §16). Gere o template MESTRE (rascunho editável). A
 * submissão real por conta acontece via TemplateDeploymentService.
 */
export class TemplateService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(ctx: AuthContext, organizationId: string) {
    assertPermission(ctx, organizationId, 'template:read');
    const templates = await this.prisma.template.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      include: { deployments: { select: { status: true } } },
    });
    // Resumo de implantações por status (Bulk Manager — spec §38, §52).
    return templates.map((t) => ({
      ...t,
      deploymentSummary: summarize(t.deployments.map((d) => d.status)),
      deployments: undefined,
    }));
  }

  async get(ctx: AuthContext, organizationId: string, id: string) {
    assertPermission(ctx, organizationId, 'template:read');
    const template = await this.prisma.template.findFirst({ where: { id, organizationId } });
    if (!template) throw notFound('Template não encontrado.');
    return template;
  }

  async create(ctx: AuthContext, organizationId: string, input: CreateTemplateInput) {
    assertPermission(ctx, organizationId, 'template:write');
    const existing = await this.prisma.template.findFirst({
      where: { organizationId, name: input.name, language: input.language },
    });
    if (existing) throw conflict('Já existe um template com este nome e idioma.');

    const template = await this.prisma.template.create({
      data: {
        organizationId,
        name: input.name,
        language: input.language,
        category: input.category,
        components: input.components as unknown as Prisma.InputJsonValue,
        status: 'DRAFT',
      },
    });
    await this.audit(ctx, organizationId, 'USER_CREATED_TEMPLATE', template.id);
    return template;
  }

  async update(
    ctx: AuthContext,
    organizationId: string,
    id: string,
    input: UpdateTemplateInput,
  ) {
    assertPermission(ctx, organizationId, 'template:write');
    const template = await this.get(ctx, organizationId, id);
    if (template.status !== 'DRAFT') {
      throw badRequest('Apenas templates em rascunho podem ser editados.');
    }
    return this.prisma.template.update({
      where: { id: template.id },
      data: {
        category: input.category ?? template.category,
        components: (input.components ??
          template.components) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async duplicate(
    ctx: AuthContext,
    organizationId: string,
    id: string,
    input: DuplicateTemplateInput,
  ) {
    assertPermission(ctx, organizationId, 'template:write');
    const source = await this.get(ctx, organizationId, id);
    const language = input.language ?? source.language;
    const dup = await this.prisma.template.findFirst({
      where: { organizationId, name: input.name, language },
    });
    if (dup) throw conflict('Já existe um template com este nome e idioma.');

    return this.prisma.template.create({
      data: {
        organizationId,
        name: input.name,
        language,
        category: source.category,
        components: source.components as Prisma.InputJsonValue,
        status: 'DRAFT',
      },
    });
  }

  private async audit(
    ctx: AuthContext,
    organizationId: string,
    action: string,
    entityId: string,
  ) {
    await this.prisma.auditLog.create({
      data: { organizationId, userId: ctx.userId, action, entityType: 'template', entityId },
    });
  }
}

function summarize(statuses: string[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const s of statuses) acc[s] = (acc[s] ?? 0) + 1;
  return acc;
}

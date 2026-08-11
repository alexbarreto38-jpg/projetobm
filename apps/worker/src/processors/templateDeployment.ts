import type { PrismaClient } from '@wise/database';
import { logger } from '@wise/logger';
import { MetaApiError } from '@wise/meta-provider';
import { mapDeploymentStatus, type AccountModel } from '@wise/types';
import type { WorkerMeta } from '../meta.js';

/**
 * Submete um template a uma conta específica (spec §17). Idempotente: se o
 * deployment já tem externalTemplateId, não reenvia. Erros da Meta são
 * preservados (code/subcode/message/fbtrace_id — spec §48, §49) e o deployment
 * fica em ERROR; a aprovação/rejeição final chega depois via webhook (§30).
 */
export interface DeploymentResult {
  status: string;
  skipped: boolean;
}

export async function processTemplateDeployment(
  prisma: PrismaClient,
  meta: WorkerMeta,
  deploymentId: string,
): Promise<DeploymentResult> {
  const deployment = await prisma.templateDeployment.findUnique({
    where: { id: deploymentId },
    include: {
      template: true,
      targetAccount: { include: { metaConnection: true } },
    },
  });
  if (!deployment) throw new Error(`Deployment ${deploymentId} não encontrado.`);

  if (deployment.externalTemplateId) {
    return { status: deployment.status, skipped: true };
  }

  const { template, targetAccount } = deployment;
  const credentialId = targetAccount.metaConnection.credentialId;
  if (!credentialId) {
    await fail(prisma, deploymentId, 'Credencial ausente para a conta.');
    return { status: 'ERROR', skipped: false };
  }

  const credential = await prisma.credential.findUnique({ where: { id: credentialId } });
  if (!credential || credential.status !== 'ACTIVE') {
    await fail(prisma, deploymentId, 'Credencial inválida ou revogada.');
    return { status: 'ERROR', skipped: false };
  }

  const accessToken = meta.vault.decrypt(credential.encryptedToken);
  const adapter = meta.provider.adapterFor(targetAccount.accountModel as AccountModel);

  await prisma.templateDeployment.update({
    where: { id: deploymentId },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
  });

  try {
    const result = await adapter.createTemplate(
      { externalAccountId: targetAccount.externalAccountId, accessToken },
      {
        name: template.name,
        language: template.language,
        category: template.category,
        components: template.components,
        idempotencyKey: deployment.idempotencyKey,
      },
    );

    const mapped = mapDeploymentStatus(result.status ?? 'PENDING') ?? 'PENDING';
    await prisma.templateDeployment.update({
      where: { id: deploymentId },
      data: { externalTemplateId: result.externalTemplateId ?? null, status: mapped },
    });
    logger.info({ deploymentId, status: mapped }, 'Template submetido');
    return { status: mapped, skipped: false };
  } catch (err) {
    if (err instanceof MetaApiError) {
      await prisma.templateDeployment.update({
        where: { id: deploymentId },
        data: {
          status: 'ERROR',
          errorCode: err.metaErrorCode != null ? String(err.metaErrorCode) : null,
          errorSubcode: err.metaErrorSubcode != null ? String(err.metaErrorSubcode) : null,
          errorMessage: err.message,
          fbtraceId: err.fbtraceId ?? null,
        },
      });
      logger.warn({ deploymentId, ...err.toLogObject() }, 'Falha ao submeter template');
      // Erros transitórios devem ser retentados pela fila; permanentes não.
      if (err.retryable) throw err;
      return { status: 'ERROR', skipped: false };
    }
    await fail(prisma, deploymentId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function fail(prisma: PrismaClient, deploymentId: string, message: string) {
  await prisma.templateDeployment.update({
    where: { id: deploymentId },
    data: { status: 'ERROR', errorMessage: message },
  });
}

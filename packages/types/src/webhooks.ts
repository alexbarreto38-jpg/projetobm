/**
 * Mapeamento de estados externos da Meta para estados internos (spec §31).
 * Definidos como literais aqui para manter @wise/types sem dependência do
 * banco; devem coincidir com os enums do Prisma (MessageStatus, DeploymentStatus).
 */
export type InternalMessageStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'ACCEPTED'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED';

/** Campos de webhook conhecidos (legado). Confirmar novos campos do modelo 2026. */
export const WEBHOOK_EVENT_TYPES = {
  messages: 'messages',
  statuses: 'statuses',
  templateStatusUpdate: 'message_template_status_update',
  phoneNumberQualityUpdate: 'phone_number_quality_update',
} as const;

const MESSAGE_STATUS_MAP: Record<string, InternalMessageStatus> = {
  sent: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'FAILED',
};

/** Traduz o status externo de uma mensagem; retorna null se desconhecido. */
export function mapMessageStatus(external: string): InternalMessageStatus | null {
  return MESSAGE_STATUS_MAP[external.toLowerCase()] ?? null;
}

export type InternalDeploymentStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'SUBMITTED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'ERROR';

const DEPLOYMENT_STATUS_MAP: Record<string, InternalDeploymentStatus> = {
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
  PAUSED: 'PAUSED',
  DISABLED: 'DISABLED',
  // Estados de submissão/revisão que a Meta pode reportar:
  IN_APPEAL: 'PENDING',
  PENDING_DELETION: 'DISABLED',
  DELETED: 'DISABLED',
  FLAGGED: 'PAUSED',
};

/** Traduz o status externo de um template; retorna null se desconhecido. */
export function mapDeploymentStatus(external: string): InternalDeploymentStatus | null {
  return DEPLOYMENT_STATUS_MAP[external.toUpperCase()] ?? null;
}

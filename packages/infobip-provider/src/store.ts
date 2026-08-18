/**
 * Estado que o provider Infobip precisa manter fora da API: as listas recebidas
 * (para validar antes do envio — spec §6, §7) e o andamento das campanhas (o
 * Infobip entrega status por webhook, então agregamos aqui — spec §16, §31).
 *
 * As implementações em memória servem a uma instância (MVP). Em produção, troque
 * por Redis/Postgres para persistência e compartilhamento entre réplicas.
 */

export interface StoredList {
  columns: string[];
  rows: Record<string, string>[];
}

export interface ContactListStore {
  get(ref: string): Promise<StoredList | null>;
  set(ref: string, list: StoredList): Promise<void>;
}

export class InMemoryContactListStore implements ContactListStore {
  private readonly map = new Map<string, StoredList>();
  get(ref: string): Promise<StoredList | null> {
    return Promise.resolve(this.map.get(ref) ?? null);
  }
  set(ref: string, list: StoredList): Promise<void> {
    this.map.set(ref, list);
    return Promise.resolve();
  }
}

export type RecipientStatus = 'pending' | 'delivered' | 'failed';

export interface StoredRecipient {
  phone: string;
  messageId: string;
  status: RecipientStatus;
  errorReason?: string;
}

export interface StoredCampaign {
  id: string;
  sender: string;
  templateName: string;
  language: string;
  listRef: string;
  mapping: Record<string, string>;
  status: 'DRAFT' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'PAUSED';
  recipients: StoredRecipient[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CampaignStore {
  get(id: string): Promise<StoredCampaign | null>;
  set(campaign: StoredCampaign): Promise<void>;
  /** Aplica um relatório de entrega a um recipient pelo messageId (spec §31). */
  applyReport(messageId: string, status: RecipientStatus, errorReason?: string): Promise<void>;
}

export class InMemoryCampaignStore implements CampaignStore {
  private readonly map = new Map<string, StoredCampaign>();
  private readonly byMessageId = new Map<string, string>(); // messageId -> campaignId

  get(id: string): Promise<StoredCampaign | null> {
    return Promise.resolve(this.map.get(id) ?? null);
  }
  set(campaign: StoredCampaign): Promise<void> {
    this.map.set(campaign.id, campaign);
    for (const r of campaign.recipients) this.byMessageId.set(r.messageId, campaign.id);
    return Promise.resolve();
  }
  applyReport(messageId: string, status: RecipientStatus, errorReason?: string): Promise<void> {
    const campaignId = this.byMessageId.get(messageId);
    if (!campaignId) return Promise.resolve();
    const campaign = this.map.get(campaignId);
    if (!campaign) return Promise.resolve();
    const recipient = campaign.recipients.find((r) => r.messageId === messageId);
    if (recipient) {
      recipient.status = status;
      recipient.errorReason = errorReason;
    }
    // Campanha finaliza quando não há mais pendentes.
    if (campaign.status === 'RUNNING' && !campaign.recipients.some((r) => r.status === 'pending')) {
      campaign.status = 'COMPLETED';
      campaign.completedAt = new Date().toISOString();
    }
    return Promise.resolve();
  }
}

/** Mapeia o groupName do Infobip para o status interno (spec §31). */
export function mapInfobipStatus(groupName: string | undefined): RecipientStatus {
  switch ((groupName ?? '').toUpperCase()) {
    case 'DELIVERED':
    case 'SEEN':
    case 'READ':
      return 'delivered';
    case 'UNDELIVERABLE':
    case 'REJECTED':
    case 'EXPIRED':
    case 'FAILED':
      return 'failed';
    default:
      return 'pending';
  }
}

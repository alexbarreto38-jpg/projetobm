import type { CampaignStore, ContactListStore, RecipientStatus, StoredCampaign, StoredList } from './store.js';

/**
 * Cliente Redis mínimo do qual os stores dependem. O `ioredis` (usado pela API/
 * worker) satisfaz esta interface estruturalmente — assim o provider não precisa
 * depender do pacote ioredis diretamente.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

const PREFIX = 'wise:infobip';

/**
 * Stores em Redis (spec §5, §16). Substituem os in-memory quando há Redis, para
 * que várias réplicas compartilhem listas e o andamento das campanhas e o estado
 * sobreviva a reinícios.
 */
export class RedisContactListStore implements ContactListStore {
  constructor(
    private readonly redis: RedisLike,
    private readonly ttlNote = 'sem TTL — listas persistem até serem sobrescritas',
  ) {
    void this.ttlNote;
  }

  async get(ref: string): Promise<StoredList | null> {
    const raw = await this.redis.get(`${PREFIX}:list:${ref}`);
    return raw ? (JSON.parse(raw) as StoredList) : null;
  }

  async set(ref: string, list: StoredList): Promise<void> {
    await this.redis.set(`${PREFIX}:list:${ref}`, JSON.stringify(list));
  }
}

export class RedisCampaignStore implements CampaignStore {
  constructor(private readonly redis: RedisLike) {}

  async get(id: string): Promise<StoredCampaign | null> {
    const raw = await this.redis.get(`${PREFIX}:campaign:${id}`);
    return raw ? (JSON.parse(raw) as StoredCampaign) : null;
  }

  async set(campaign: StoredCampaign): Promise<void> {
    // Índice messageId -> campaignId para os relatórios de entrega (spec §31).
    await Promise.all(
      campaign.recipients.map((r) =>
        this.redis.set(`${PREFIX}:msg:${r.messageId}`, campaign.id),
      ),
    );
    // Preserva campos extra anexados (ex.: placeholders) via JSON.
    await this.redis.set(`${PREFIX}:campaign:${campaign.id}`, JSON.stringify(campaign));
  }

  async applyReport(messageId: string, status: RecipientStatus, errorReason?: string): Promise<void> {
    const campaignId = await this.redis.get(`${PREFIX}:msg:${messageId}`);
    if (!campaignId) return;
    const campaign = await this.get(campaignId);
    if (!campaign) return;
    const recipient = campaign.recipients.find((r) => r.messageId === messageId);
    if (!recipient) return;
    recipient.status = status;
    recipient.errorReason = errorReason;
    if (campaign.status === 'RUNNING' && !campaign.recipients.some((r) => r.status === 'pending')) {
      campaign.status = 'COMPLETED';
      campaign.completedAt = new Date().toISOString();
    }
    // Reescreve a campanha; os índices de messageId já existem.
    await this.redis.set(`${PREFIX}:campaign:${campaign.id}`, JSON.stringify(campaign));
  }
}

import { describe, expect, it } from 'vitest';
import { RedisCampaignStore, RedisContactListStore, type RedisLike } from '../redis-store.js';
import type { StoredCampaign } from '../store.js';

/** RedisLike em memória para teste. */
class FakeRedis implements RedisLike {
  map = new Map<string, string>();
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.map.get(key) ?? null);
  }
  set(key: string, value: string): Promise<unknown> {
    this.map.set(key, value);
    return Promise.resolve('OK');
  }
  del(key: string): Promise<unknown> {
    this.map.delete(key);
    return Promise.resolve(1);
  }
}

function campaign(): StoredCampaign {
  return {
    id: 'CAMP-2026-000001',
    sender: '5511999994587',
    templateName: 'confirmacao_pagamento',
    language: 'pt_BR',
    listRef: 'l1',
    mapping: { '1': 'nome' },
    status: 'RUNNING',
    createdAt: new Date().toISOString(),
    recipients: [
      { phone: '+5511977776666', messageId: 'CAMP-2026-000001::+5511977776666', status: 'pending' },
      { phone: '+5511988887777', messageId: 'CAMP-2026-000001::+5511988887777', status: 'pending' },
    ],
  };
}

describe('RedisContactListStore', () => {
  it('faz round-trip da lista', async () => {
    const store = new RedisContactListStore(new FakeRedis());
    await store.set('l1', { columns: ['nome', 'telefone'], rows: [{ nome: 'Ana', telefone: '11' }] });
    const got = await store.get('l1');
    expect(got?.columns).toEqual(['nome', 'telefone']);
    expect(got?.rows).toHaveLength(1);
    expect(await store.get('inexistente')).toBeNull();
  });
});

describe('RedisCampaignStore', () => {
  it('persiste a campanha e aplica relatórios de entrega (spec §31)', async () => {
    const redis = new FakeRedis();
    const store = new RedisCampaignStore(redis);
    await store.set(campaign());

    await store.applyReport('CAMP-2026-000001::+5511977776666', 'delivered');
    let c = await store.get('CAMP-2026-000001');
    expect(c?.recipients.find((r) => r.phone === '+5511977776666')?.status).toBe('delivered');
    expect(c?.status).toBe('RUNNING'); // ainda há 1 pendente

    await store.applyReport('CAMP-2026-000001::+5511988887777', 'failed', 'bloqueado');
    c = await store.get('CAMP-2026-000001');
    expect(c?.status).toBe('COMPLETED'); // sem pendentes → finaliza
    expect(c?.recipients.find((r) => r.phone === '+5511988887777')?.errorReason).toBe('bloqueado');
  });

  it('preserva campos extra (placeholders) via JSON', async () => {
    const redis = new FakeRedis();
    const store = new RedisCampaignStore(redis);
    const withPh = { ...campaign() } as StoredCampaign & { placeholders: Record<string, string[]> };
    withPh.placeholders = { '+5511977776666': ['Ana'] };
    await store.set(withPh);
    const got = (await store.get('CAMP-2026-000001')) as (StoredCampaign & { placeholders?: Record<string, string[]> }) | null;
    expect(got?.placeholders?.['+5511977776666']).toEqual(['Ana']);
  });

  it('ignora relatório de messageId desconhecido', async () => {
    const store = new RedisCampaignStore(new FakeRedis());
    await expect(store.applyReport('desconhecido', 'delivered')).resolves.toBeUndefined();
  });
});

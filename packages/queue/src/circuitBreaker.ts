import type { Redis } from 'ioredis';

/**
 * Circuit breaker por conexão/número (spec §28). Impede milhares de requisições
 * contra uma conta/número problemático.
 *
 *   CLOSED  → tudo passa; falhas consecutivas contam.
 *   OPEN    → tudo é barrado por `openMs`; depois vira HALF_OPEN.
 *   HALF_OPEN → deixa passar sondagens; sucesso fecha, falha reabre.
 *
 * O núcleo é puro (state machine) sobre um `BreakerStore` injetável — em memória
 * para testes, em Redis para estado compartilhado entre workers.
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface BreakerRecord {
  state: CircuitState;
  failures: number;
  openedAt: number;
}

export interface BreakerStore {
  get(key: string): Promise<BreakerRecord | null>;
  set(key: string, record: BreakerRecord): Promise<void>;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // falhas para abrir (default 5)
  openMs?: number; // tempo em OPEN antes de HALF_OPEN (default 60s)
  now?: () => number; // injeção de relógio para testes
}

const DEFAULT: BreakerRecord = { state: 'CLOSED', failures: 0, openedAt: 0 };

export class CircuitBreaker {
  private readonly threshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  constructor(
    private readonly store: BreakerStore,
    opts: CircuitBreakerOptions = {},
  ) {
    this.threshold = opts.failureThreshold ?? 5;
    this.openMs = opts.openMs ?? 60_000;
    this.now = opts.now ?? (() => Date.now());
  }

  async state(key: string): Promise<CircuitState> {
    return (await this.resolve(key)).state;
  }

  /** Pode prosseguir? Faz a transição OPEN→HALF_OPEN quando o tempo expira. */
  async canProceed(key: string): Promise<{ allowed: boolean; state: CircuitState }> {
    const rec = await this.resolve(key);
    if (rec.state === 'OPEN') {
      if (this.now() - rec.openedAt >= this.openMs) {
        const next: BreakerRecord = { ...rec, state: 'HALF_OPEN' };
        await this.store.set(key, next);
        return { allowed: true, state: 'HALF_OPEN' };
      }
      return { allowed: false, state: 'OPEN' };
    }
    return { allowed: true, state: rec.state };
  }

  async recordSuccess(key: string): Promise<void> {
    await this.store.set(key, { state: 'CLOSED', failures: 0, openedAt: 0 });
  }

  async recordFailure(key: string): Promise<void> {
    const rec = await this.resolve(key);
    // Falha em HALF_OPEN reabre imediatamente.
    if (rec.state === 'HALF_OPEN') {
      await this.store.set(key, { state: 'OPEN', failures: rec.failures + 1, openedAt: this.now() });
      return;
    }
    const failures = rec.failures + 1;
    if (failures >= this.threshold) {
      await this.store.set(key, { state: 'OPEN', failures, openedAt: this.now() });
    } else {
      await this.store.set(key, { state: 'CLOSED', failures, openedAt: 0 });
    }
  }

  private async resolve(key: string): Promise<BreakerRecord> {
    return (await this.store.get(key)) ?? { ...DEFAULT };
  }
}

/** Store em memória (testes / instância única). */
export class InMemoryBreakerStore implements BreakerStore {
  private readonly map = new Map<string, BreakerRecord>();
  async get(key: string): Promise<BreakerRecord | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, record: BreakerRecord): Promise<void> {
    this.map.set(key, record);
  }
}

/** Store em Redis (estado compartilhado entre workers). */
export class RedisBreakerStore implements BreakerStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'cb:',
  ) {}

  async get(key: string): Promise<BreakerRecord | null> {
    const raw = await this.redis.hgetall(`${this.prefix}${key}`);
    if (!raw || !raw.state) return null;
    return {
      state: raw.state as CircuitState,
      failures: Number(raw.failures ?? 0),
      openedAt: Number(raw.openedAt ?? 0),
    };
  }

  async set(key: string, record: BreakerRecord): Promise<void> {
    const k = `${this.prefix}${key}`;
    await this.redis.hset(k, {
      state: record.state,
      failures: String(record.failures),
      openedAt: String(record.openedAt),
    });
    // TTL defensivo para não vazar chaves de números inativos.
    await this.redis.expire(k, 60 * 60 * 24);
  }
}

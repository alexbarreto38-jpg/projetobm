import type { Redis } from 'ioredis';

/**
 * RateLimitService (spec §41). Sistema configurável — NÃO hardcode dos limites
 * da Meta. Trabalha por chave (connection/account/number/endpoint) como válvula
 * de segurança para reduzir o processamento; nunca para explorar o limite máximo.
 * Se a Meta sinalizar throttling (429/Retry-After), o chamador deve recuar.
 *
 * Implementado como token-bucket sobre um store injetável (memória p/ testes,
 * Redis p/ estado compartilhado entre workers).
 */
export interface BucketRecord {
  tokens: number;
  updatedAt: number;
}

export interface RateStore {
  get(key: string): Promise<BucketRecord | null>;
  set(key: string, record: BucketRecord, ttlMs: number): Promise<void>;
}

export interface RateLimiterOptions {
  capacity?: number; // tokens máximos (default 60)
  refillPerSec?: number; // reposição por segundo (default 1)
  now?: () => number;
}

export interface TakeResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;

  constructor(
    private readonly store: RateStore,
    opts: RateLimiterOptions = {},
  ) {
    this.capacity = opts.capacity ?? 60;
    this.refillPerMs = (opts.refillPerSec ?? 1) / 1000;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Tenta consumir `cost` tokens. Não bloqueia — retorna se pode prosseguir. */
  async take(key: string, cost = 1): Promise<TakeResult> {
    const now = this.now();
    const rec = (await this.store.get(key)) ?? { tokens: this.capacity, updatedAt: now };

    const elapsed = Math.max(0, now - rec.updatedAt);
    const tokens = Math.min(this.capacity, rec.tokens + elapsed * this.refillPerMs);

    const ttlMs = Math.ceil(this.capacity / this.refillPerMs);
    if (tokens >= cost) {
      await this.store.set(key, { tokens: tokens - cost, updatedAt: now }, ttlMs);
      return { allowed: true, remaining: Math.floor(tokens - cost), retryAfterMs: 0 };
    }
    await this.store.set(key, { tokens, updatedAt: now }, ttlMs);
    const deficit = cost - tokens;
    return { allowed: false, remaining: Math.floor(tokens), retryAfterMs: Math.ceil(deficit / this.refillPerMs) };
  }
}

export class InMemoryRateStore implements RateStore {
  private readonly map = new Map<string, BucketRecord>();
  async get(key: string): Promise<BucketRecord | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, record: BucketRecord): Promise<void> {
    this.map.set(key, record);
  }
}

export class RedisRateStore implements RateStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'rl:',
  ) {}
  async get(key: string): Promise<BucketRecord | null> {
    const raw = await this.redis.hgetall(`${this.prefix}${key}`);
    if (!raw || raw.tokens === undefined) return null;
    return { tokens: Number(raw.tokens), updatedAt: Number(raw.updatedAt ?? 0) };
  }
  async set(key: string, record: BucketRecord, ttlMs: number): Promise<void> {
    const k = `${this.prefix}${key}`;
    await this.redis.hset(k, { tokens: String(record.tokens), updatedAt: String(record.updatedAt) });
    await this.redis.pexpire(k, Math.max(1000, ttlMs));
  }
}

import { describe, expect, it } from 'vitest';
import { InMemoryRateStore, RateLimiter } from '../rateLimiter.js';

describe('RateLimiter (token bucket)', () => {
  it('permite até a capacidade e depois barra', async () => {
    const now = { t: 0 };
    const rl = new RateLimiter(new InMemoryRateStore(), {
      capacity: 3,
      refillPerSec: 1,
      now: () => now.t,
    });
    expect((await rl.take('k')).allowed).toBe(true);
    expect((await rl.take('k')).allowed).toBe(true);
    expect((await rl.take('k')).allowed).toBe(true);
    const denied = await rl.take('k');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it('repõe tokens com o passar do tempo', async () => {
    const now = { t: 0 };
    const rl = new RateLimiter(new InMemoryRateStore(), {
      capacity: 2,
      refillPerSec: 1,
      now: () => now.t,
    });
    await rl.take('k');
    await rl.take('k');
    expect((await rl.take('k')).allowed).toBe(false);

    now.t = 1000; // +1s → +1 token
    expect((await rl.take('k')).allowed).toBe(true);
    expect((await rl.take('k')).allowed).toBe(false);
  });

  it('isola chaves diferentes (por número/conta)', async () => {
    const rl = new RateLimiter(new InMemoryRateStore(), { capacity: 1, refillPerSec: 0.0001 });
    expect((await rl.take('num1')).allowed).toBe(true);
    expect((await rl.take('num2')).allowed).toBe(true);
    expect((await rl.take('num1')).allowed).toBe(false);
  });
});

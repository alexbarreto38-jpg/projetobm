import { describe, expect, it } from 'vitest';
import { CircuitBreaker, InMemoryBreakerStore } from '../circuitBreaker.js';

function makeBreaker(nowRef: { t: number }) {
  return new CircuitBreaker(new InMemoryBreakerStore(), {
    failureThreshold: 3,
    openMs: 1000,
    now: () => nowRef.t,
  });
}

describe('CircuitBreaker', () => {
  it('começa CLOSED e permite passar', async () => {
    const cb = makeBreaker({ t: 0 });
    expect(await cb.state('num1')).toBe('CLOSED');
    expect((await cb.canProceed('num1')).allowed).toBe(true);
  });

  it('abre após N falhas consecutivas e barra as requisições', async () => {
    const now = { t: 0 };
    const cb = makeBreaker(now);
    await cb.recordFailure('num1');
    await cb.recordFailure('num1');
    expect(await cb.state('num1')).toBe('CLOSED');
    await cb.recordFailure('num1'); // 3ª falha → OPEN
    expect(await cb.state('num1')).toBe('OPEN');
    expect((await cb.canProceed('num1')).allowed).toBe(false);
  });

  it('sucesso zera as falhas (mantém CLOSED)', async () => {
    const cb = makeBreaker({ t: 0 });
    await cb.recordFailure('num1');
    await cb.recordFailure('num1');
    await cb.recordSuccess('num1');
    await cb.recordFailure('num1');
    await cb.recordFailure('num1');
    expect(await cb.state('num1')).toBe('CLOSED'); // só 2 desde o reset
  });

  it('transita OPEN → HALF_OPEN após openMs e permite sondagem', async () => {
    const now = { t: 0 };
    const cb = makeBreaker(now);
    for (let i = 0; i < 3; i += 1) await cb.recordFailure('num1');
    expect((await cb.canProceed('num1')).allowed).toBe(false);

    now.t = 1000; // passou o openMs
    const probe = await cb.canProceed('num1');
    expect(probe.allowed).toBe(true);
    expect(probe.state).toBe('HALF_OPEN');
  });

  it('HALF_OPEN: sucesso fecha, falha reabre', async () => {
    const now = { t: 0 };
    const cb = makeBreaker(now);
    for (let i = 0; i < 3; i += 1) await cb.recordFailure('num1');
    now.t = 1000;
    await cb.canProceed('num1'); // → HALF_OPEN

    await cb.recordSuccess('num1');
    expect(await cb.state('num1')).toBe('CLOSED');

    // reabre e vai para HALF_OPEN de novo
    const now2 = { t: 0 };
    const cb2 = makeBreaker(now2);
    for (let i = 0; i < 3; i += 1) await cb2.recordFailure('n');
    now2.t = 1000;
    await cb2.canProceed('n'); // HALF_OPEN
    await cb2.recordFailure('n'); // falha na sondagem → OPEN
    expect(await cb2.state('n')).toBe('OPEN');
  });
});

import type { NormalizedInbound } from '@wise/infobip-provider';
import { describe, expect, it } from 'vitest';
import { InProcessInboundQueue } from '../inbound-queue.js';

function msg(id: string): NormalizedInbound {
  return { from: 'a', to: 'b', messageId: id, kind: 'text', text: id };
}

function until(cond: () => boolean, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe('InProcessInboundQueue (spec §3, §23)', () => {
  it('processa todas as mensagens em ordem, em segundo plano', async () => {
    const seen: string[] = [];
    const queue = new InProcessInboundQueue(async (m) => {
      seen.push(m.messageId);
    });
    queue.enqueue(msg('1'));
    queue.enqueue(msg('2'));
    queue.enqueue(msg('3'));
    await until(() => seen.length === 3);
    expect(seen).toEqual(['1', '2', '3']);
    expect(queue.size()).toBe(0);
  });

  it('um erro no processador não interrompe a fila', async () => {
    const seen: string[] = [];
    const queue = new InProcessInboundQueue(async (m) => {
      if (m.messageId === '2') throw new Error('falha proposital');
      seen.push(m.messageId);
    });
    queue.enqueue(msg('1'));
    queue.enqueue(msg('2'));
    queue.enqueue(msg('3'));
    await until(() => seen.length === 2);
    expect(seen).toEqual(['1', '3']);
  });

  it('aplica backpressure: descarta acima do maxDepth', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const seen: string[] = [];
    const queue = new InProcessInboundQueue(async (m) => {
      seen.push(m.messageId);
      await gate;
    }, 2);

    queue.enqueue(msg('A')); // sai da fila e fica processando (bloqueado no gate)
    queue.enqueue(msg('B')); // fila: [B]
    queue.enqueue(msg('C')); // fila: [B, C] (cheia)
    queue.enqueue(msg('D')); // descartada (>= maxDepth)
    expect(queue.size()).toBe(2);

    release();
    await until(() => queue.size() === 0 && seen.length === 3);
    expect(seen).toEqual(['A', 'B', 'C']);
    expect(seen).not.toContain('D');
  });
});

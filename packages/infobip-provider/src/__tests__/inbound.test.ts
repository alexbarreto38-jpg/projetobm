import { describe, expect, it } from 'vitest';
import { normalizeInbound } from '../inbound.js';

describe('normalizeInbound (spec §3)', () => {
  it('classifica texto, áudio, arquivo e outros', () => {
    const out = normalizeInbound({
      results: [
        { from: '5511a', to: '5511b', messageId: 'm1', message: { type: 'TEXT', text: 'olá' }, contact: { name: 'Ana' } },
        { from: '5511a', to: '5511b', messageId: 'm2', message: { type: 'AUDIO', url: 'https://m/a.ogg' } },
        { from: '5511a', to: '5511b', messageId: 'm3', message: { type: 'DOCUMENT', url: 'https://m/l.csv', caption: 'lista' } },
        { from: '5511a', to: '5511b', messageId: 'm4', message: { type: 'LOCATION' } },
      ],
    });
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ kind: 'text', text: 'olá', contactName: 'Ana' });
    expect(out[1]).toMatchObject({ kind: 'audio', mediaUrl: 'https://m/a.ogg' });
    expect(out[2]).toMatchObject({ kind: 'file', mediaUrl: 'https://m/l.csv', text: 'lista' });
    expect(out[3]).toMatchObject({ kind: 'other' });
  });

  it('tolera payload vazio', () => {
    expect(normalizeInbound({})).toEqual([]);
  });

  it('trata respostas de botão como texto', () => {
    const out = normalizeInbound({
      results: [{ from: 'a', to: 'b', messageId: 'm', message: { type: 'INTERACTIVE_BUTTON_REPLY', text: 'Sim' } }],
    });
    expect(out[0]!.kind).toBe('text');
    expect(out[0]!.text).toBe('Sim');
  });
});

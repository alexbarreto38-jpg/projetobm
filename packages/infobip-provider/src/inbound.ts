import type { InfobipInboundResult, InfobipInboundWebhook } from './types.js';

/** Tipo lógico de uma mensagem recebida (spec §3). */
export type InboundKind = 'text' | 'audio' | 'file' | 'other';

export interface NormalizedInbound {
  from: string;
  to: string;
  messageId: string;
  kind: InboundKind;
  /** Texto (mensagem de texto ou legenda de mídia). */
  text?: string;
  /** URL da mídia a baixar (áudio/arquivo). */
  mediaUrl?: string;
  contactName?: string;
}

/**
 * Normaliza o payload do webhook de entrada do Infobip em uma lista estável
 * (spec §3). O canal decide o que fazer com cada tipo (texto → direto; áudio →
 * transcrever; arquivo → encaminhar à importação).
 */
export function normalizeInbound(payload: InfobipInboundWebhook): NormalizedInbound[] {
  return (payload.results ?? []).map(normalizeOne);
}

function normalizeOne(result: InfobipInboundResult): NormalizedInbound {
  const type = (result.message.type ?? '').toUpperCase();
  const base = {
    from: result.from,
    to: result.to,
    messageId: result.messageId,
    contactName: result.contact?.name,
  };
  if (type === 'TEXT' || type === 'BUTTON' || type.includes('REPLY')) {
    return { ...base, kind: 'text', text: result.message.text ?? '' };
  }
  if (type === 'AUDIO' || type === 'VOICE') {
    return { ...base, kind: 'audio', mediaUrl: result.message.url, text: result.message.caption };
  }
  if (type === 'DOCUMENT' || type === 'IMAGE' || type === 'VIDEO') {
    return { ...base, kind: 'file', mediaUrl: result.message.url, text: result.message.caption };
  }
  return { ...base, kind: 'other', text: result.message.text };
}

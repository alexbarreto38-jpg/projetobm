import { describe, expect, it } from 'vitest';
import { HttpTranscriber, UnavailableTranscriber } from '../transcription.js';

describe('transcrição de áudio (spec §3)', () => {
  it('UnavailableTranscriber falha explicitamente, não inventa (spec §24)', async () => {
    await expect(new UnavailableTranscriber().transcribe()).rejects.toThrow(/não está configurada/);
  });

  it('HttpTranscriber envia multipart e retorna o texto', async () => {
    let seenUrl = '';
    let authHeader: string | undefined;
    const transcriber = new HttpTranscriber({
      url: 'https://stt.local/audio/transcriptions',
      apiKey: 'secret',
      model: 'whisper-1',
      fetchImpl: (async (url: string, init: RequestInit) => {
        seenUrl = String(url);
        authHeader = (init.headers as Record<string, string> | undefined)?.authorization;
        return { ok: true, status: 200, json: async () => ({ text: 'dois mil envios', language: 'pt' }) } as Response;
      }) as unknown as typeof fetch,
    });
    const result = await transcriber.transcribe({
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/ogg',
    });
    expect(seenUrl).toContain('/audio/transcriptions');
    expect(authHeader).toBe('Bearer secret');
    expect(result.text).toBe('dois mil envios');
  });

  it('HttpTranscriber propaga erro do provedor (spec §22)', async () => {
    const transcriber = new HttpTranscriber({
      url: 'https://stt.local/x',
      fetchImpl: (async () => ({ ok: false, status: 500, text: async () => 'boom' }) as Response) as unknown as typeof fetch,
    });
    await expect(
      transcriber.transcribe({ data: new Uint8Array([1]), mimeType: 'audio/ogg' }),
    ).rejects.toThrow(/Falha na transcrição/);
  });
});

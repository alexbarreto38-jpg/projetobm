/**
 * Transcrição de áudio (spec §3). O assistente aceita áudio pelo WhatsApp; o
 * áudio é recebido, transcrito e só então interpretado. A implementação real
 * (provedor de STT) é injetada — o "cérebro" só depende desta interface.
 */
export interface AudioInput {
  /** Bytes do áudio (ex.: ogg/opus do WhatsApp) ou uma URL para baixar. */
  data?: Uint8Array;
  url?: string;
  mimeType: string;
}

export interface Transcription {
  text: string;
  language?: string;
}

export interface Transcriber {
  transcribe(audio: AudioInput): Promise<Transcription>;
}

/**
 * Transcriber inerte, útil em ambientes sem STT configurado: falha de forma
 * explícita em vez de "inventar" uma transcrição (spec §24). Troque por um
 * provedor real (ex.: Whisper) na fiação da API.
 */
export class UnavailableTranscriber implements Transcriber {
  transcribe(): Promise<Transcription> {
    return Promise.reject(
      new Error('Transcrição de áudio não está configurada nesta instância.'),
    );
  }
}

/**
 * Transcriber HTTP compatível com o endpoint `/audio/transcriptions` (multipart)
 * adotado por provedores de STT (ex.: Whisper self-hosted ou serviços
 * compatíveis). Usa `fetch`/`FormData`/`Blob` do Node ≥ 18 — sem SDK. A chave
 * vive só no backend (spec §46).
 */
export interface HttpTranscriberConfig {
  /** URL completa do endpoint de transcrição. */
  url: string;
  apiKey?: string;
  model?: string;
  language?: string;
  fetchImpl?: typeof fetch;
}

export class HttpTranscriber implements Transcriber {
  constructor(private readonly config: HttpTranscriberConfig) {}

  async transcribe(audio: AudioInput): Promise<Transcription> {
    if (!audio.data) {
      throw new Error('HttpTranscriber requer os bytes do áudio (audio.data).');
    }
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const form = new FormData();
    // Copia para um ArrayBuffer "puro" para satisfazer o tipo do BlobPart.
    const buffer = audio.data.slice().buffer;
    form.append('file', new Blob([buffer], { type: audio.mimeType }), 'audio');
    if (this.config.model) form.append('model', this.config.model);
    if (this.config.language) form.append('language', this.config.language);

    const res = await fetchImpl(this.config.url, {
      method: 'POST',
      headers: this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : undefined,
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Falha na transcrição (${res.status}): ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as { text?: string; language?: string };
    if (typeof json.text !== 'string') throw new Error('Resposta de transcrição sem campo "text".');
    return { text: json.text, language: json.language ?? this.config.language };
  }
}

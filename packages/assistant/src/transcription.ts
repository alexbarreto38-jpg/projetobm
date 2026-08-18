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

/**
 * Tipos das respostas da API do Infobip usadas neste provider. Cobrem o
 * subconjunto necessário ao Módulo 1: saldo, templates de WhatsApp e envio de
 * mensagens de template. Os nomes dos campos espelham a API oficial do Infobip.
 */

export interface InfobipBalance {
  balance: number;
  currency: string;
}

export interface InfobipTemplateStructureBody {
  text?: string;
}
export interface InfobipTemplateStructure {
  header?: { format?: string; text?: string };
  body?: InfobipTemplateStructureBody;
  footer?: { text?: string };
  buttons?: unknown[];
  type?: string;
}
export interface InfobipTemplate {
  id?: string;
  name: string;
  language: string;
  status: string; // APPROVED | PENDING | REJECTED | DISABLED | PAUSED ...
  category: string; // UTILITY | MARKETING | AUTHENTICATION
  structure: InfobipTemplateStructure;
}
export interface InfobipTemplatesResponse {
  templates: InfobipTemplate[];
}

/** Uma mensagem de template no envio em lote (spec §54: messageId = idempotência). */
export interface InfobipOutboundTemplateMessage {
  from: string;
  to: string;
  messageId: string;
  content: {
    templateName: string;
    templateData: {
      body: { placeholders: string[] };
    };
    language: string;
  };
}

export interface InfobipSendStatus {
  groupId?: number;
  groupName?: string; // PENDING | DELIVERED | REJECTED | UNDELIVERABLE | EXPIRED ...
  id?: number;
  name?: string;
  description?: string;
}
export interface InfobipSentMessage {
  to: string;
  messageId: string;
  status: InfobipSendStatus;
}
export interface InfobipSendResponse {
  messages: InfobipSentMessage[];
}

/**
 * Relatório de entrega (spec §16, §31). Chega por webhook do Infobip ou pode ser
 * puxado. Só usamos o essencial para agregar o andamento da campanha.
 */
export interface InfobipDeliveryReport {
  messageId: string;
  to?: string;
  status: InfobipSendStatus;
  error?: { id?: number; name?: string; description?: string; groupName?: string };
}

/**
 * Mensagem recebida (MO) via webhook do WhatsApp (spec §3). O `message.type`
 * varia (TEXT, AUDIO, VOICE, DOCUMENT, IMAGE, ...); mídias trazem `url`.
 */
export interface InfobipInboundMessage {
  type: string;
  text?: string;
  url?: string;
  caption?: string;
}
export interface InfobipInboundResult {
  from: string; // telefone do usuário
  to: string; // número de negócio que recebeu
  messageId: string;
  receivedAt?: string;
  message: InfobipInboundMessage;
  contact?: { name?: string };
}
export interface InfobipInboundWebhook {
  results?: InfobipInboundResult[];
  messageCount?: number;
}

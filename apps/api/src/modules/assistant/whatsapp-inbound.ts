import { normalizeInbound, type NormalizedInbound } from '@wise/infobip-provider';
import { logger } from '@wise/logger';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../app.js';
import { getAssistantService } from './factory.js';
import type { InfobipAssistantModule } from './infobip.js';
import { InProcessInboundQueue } from './inbound-queue.js';

/**
 * Canal de entrada do WhatsApp via Infobip (spec §3, §29). Recebe mensagens do
 * usuário (texto, áudio, arquivo), identifica quem é (spec §19), transcreve o
 * áudio quando necessário, encaminha ao assistente e responde de volta pelo
 * WhatsApp. Fica FORA do contexto autenticado — quem chama é o Infobip; proteja
 * por token (INFOBIP_WEBHOOK_TOKEN) e/ou IP allowlist na rede.
 *
 * O processamento é síncrono no MVP. Em produção, enfileire o processamento e
 * responda 200 imediatamente para não segurar o webhook.
 */
export function registerInfobipInboundRoutes(app: FastifyInstance, config: AppConfig): void {
  const module = config.infobipAssistant;
  const service = getAssistantService(config);
  if (!module || !service) return;

  // Dedupe de mensagens recebidas (spec §23): o Infobip pode reentregar. Com
  // Redis, é compartilhado entre réplicas; sem Redis, em memória por réplica.
  const processed = new Set<string>();
  const isNew = async (messageId: string): Promise<boolean> => {
    if (module.dedupe) return module.dedupe(messageId);
    if (processed.has(messageId)) return false;
    processed.add(messageId);
    return true;
  };
  const token = config.infobipWebhookToken;

  // Processamento assíncrono: o webhook responde 200 na hora e a fila drena em
  // segundo plano (transcrição + LLM + resposta). Evita timeout/reentrega (§23).
  const queue = new InProcessInboundQueue(async (inbound) => {
    try {
      await handleInbound(module, service, inbound);
    } catch (error) {
      logger.error({ err: error, from: inbound.from }, 'Falha ao processar mensagem de entrada.');
      await safeReply(module, inbound, 'Tive um problema ao processar sua mensagem. Pode tentar de novo?');
    }
  });

  app.post('/webhooks/infobip/whatsapp/inbound', async (request, reply) => {
    if (token && request.headers['x-infobip-token'] !== token) {
      return reply.status(401).send({ error: { code: 'UNAUTHORIZED' } });
    }
    const messages = normalizeInbound(request.body as Parameters<typeof normalizeInbound>[0]);
    let queued = 0;
    for (const inbound of messages) {
      if (!(await isNew(inbound.messageId))) continue;
      queue.enqueue(inbound);
      queued++;
    }
    // Ack imediato — o processamento continua em segundo plano.
    return reply.send({ received: messages.length, queued });
  });
}

async function handleInbound(
  module: InfobipAssistantModule,
  service: ReturnType<typeof getAssistantService>,
  inbound: NormalizedInbound,
): Promise<void> {
  if (!service) return;

  // Identidade (spec §19). Sem autorização, nada é executado.
  const auth = module.resolveUser(inbound.from);
  if (!auth) {
    await safeReply(module, inbound, 'Este número não está autorizado a usar o assistente.');
    return;
  }
  const organizationId = Object.keys(auth.memberships)[0];
  if (!organizationId) {
    await safeReply(module, inbound, 'Seu usuário não está vinculado a uma organização.');
    return;
  }

  const text = await resolveText(module, inbound);
  if (text === null) return; // já respondeu (ex.: tipo não suportado)

  const result = await service.handleMessage(auth, organizationId, text);
  await safeReply(module, inbound, result.reply || 'Ok.');
}

/**
 * Converte a mensagem recebida em texto para o assistente (spec §3): texto
 * direto; áudio → transcrição; arquivo CSV → vira lista referenciável.
 * Retorna null quando já respondeu ao usuário (tipo não suportado/erro tratado).
 */
async function resolveText(
  module: InfobipAssistantModule,
  inbound: NormalizedInbound,
): Promise<string | null> {
  if (inbound.kind === 'text') {
    return inbound.text ?? '';
  }

  if (inbound.kind === 'audio') {
    if (!inbound.mediaUrl) return inbound.text ?? '';
    try {
      const media = await module.client.downloadMedia(inbound.mediaUrl);
      const { text } = await module.transcriber.transcribe({
        data: media.data,
        mimeType: media.contentType,
      });
      return text;
    } catch (error) {
      logger.warn({ err: error }, 'Transcrição de áudio falhou.');
      await safeReply(
        module,
        inbound,
        'Não consegui transcrever o áudio. Pode enviar por texto, por favor?',
      );
      return null;
    }
  }

  if (inbound.kind === 'file') {
    if (!inbound.mediaUrl) return null;
    const csv = await tryLoadCsvAsList(module, inbound);
    if (csv) return csv;
    await safeReply(
      module,
      inbound,
      'Recebi um arquivo, mas por aqui só consigo processar listas em CSV. Envie um CSV com uma coluna de telefone.',
    );
    return null;
  }

  await safeReply(module, inbound, 'Consigo entender texto, áudio e listas em CSV. Como posso ajudar?');
  return null;
}

/**
 * Se o arquivo for CSV, faz o parse e o registra no ContactListStore, devolvendo
 * um texto de sistema que informa a referência ao assistente (spec §6). Assim o
 * assistente pode chamar attach_contact_list com essa referência.
 */
async function tryLoadCsvAsList(
  module: InfobipAssistantModule,
  inbound: NormalizedInbound,
): Promise<string | null> {
  const media = await module.client.downloadMedia(inbound.mediaUrl!);
  const isCsv =
    media.contentType.includes('csv') ||
    media.contentType.includes('text/plain') ||
    /^[^\n,;]+[,;].*\n/.test(new TextDecoder().decode(media.data.slice(0, 200)));
  if (!isCsv) return null;

  const parsed = parseCsv(new TextDecoder().decode(media.data));
  if (parsed.rows.length === 0) return null;

  const ref = `wa-${inbound.messageId}`;
  await module.lists.set(ref, parsed);
  return (
    `[Sistema] O usuário enviou uma lista de contatos por arquivo. ` +
    `Referência da lista: ${ref}. Colunas: ${parsed.columns.join(', ')}. ` +
    `Total de linhas: ${parsed.rows.length}. ` +
    `Use esta referência com a ferramenta attach_contact_list para validar e anexar à campanha.`
  );
}

/** Parser CSV mínimo (cabeçalho + linhas; detecta separador , ; ou tab). */
function parseCsv(content: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };
  const sep = detectSeparator(lines[0]!);
  const columns = splitLine(lines[0]!, sep);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]!, sep);
    const row: Record<string, string> = {};
    columns.forEach((col, idx) => {
      row[col] = (cells[idx] ?? '').trim();
    });
    rows.push(row);
  }
  return { columns, rows };
}

function detectSeparator(header: string): string {
  const counts: Record<string, number> = {
    ',': (header.match(/,/g) ?? []).length,
    ';': (header.match(/;/g) ?? []).length,
    '\t': (header.match(/\t/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
}

function splitLine(line: string, sep: string): string[] {
  return line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
}

async function safeReply(
  module: InfobipAssistantModule,
  inbound: NormalizedInbound,
  text: string,
): Promise<void> {
  try {
    // Responde do número de negócio que recebeu para o telefone do usuário.
    await module.client.sendTextMessage({ from: inbound.to, to: inbound.from, text });
  } catch (error) {
    logger.error({ err: error, to: inbound.from }, 'Falha ao responder pelo WhatsApp.');
  }
}

/**
 * Simula webhooks de status da Meta (delivered/read) para as mensagens já
 * enviadas — assim os relatórios do painel ganham vida em dev/demo, sem a Meta
 * real. Assina os eventos como a Meta faria (X-Hub-Signature-256).
 *
 *   pnpm --filter @wise/api simulate:webhooks
 *
 * Requer: DATABASE_URL, META_APP_SECRET e a API no ar (API_INTERNAL_URL ou
 * http://localhost:3001). A WABA de cada mensagem é usada como entry.id.
 */
import { createHmac } from 'node:crypto';
import { prisma } from '@wise/database';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
const APP_SECRET = process.env.META_APP_SECRET ?? 'mock-app-secret';

async function post(payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex');
  const res = await fetch(`${API}/api/webhooks/meta/whatsapp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body,
  });
  return res.status;
}

function statusPayload(wamid: string, status: string, recipient: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_DEMO',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              statuses: [
                { id: wamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: recipient },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function main() {
  const messages = await prisma.message.findMany({
    where: { status: 'SENT', externalMessageId: { not: null } },
    include: { contact: true },
    take: 500,
  });
  if (messages.length === 0) {
    console.log('Nenhuma mensagem SENT para simular. Envie uma campanha primeiro.');
    return;
  }

  let ok = 0;
  for (const m of messages) {
    const recipient = m.contact?.phone ?? '000';
    // delivered e depois read — a dedupe do webhook usa o hash do corpo, então
    // cada evento distinto é aceito.
    const s1 = await post(statusPayload(m.externalMessageId!, 'delivered', recipient));
    const s2 = await post(statusPayload(m.externalMessageId!, 'read', recipient));
    if (s1 === 200 && s2 === 200) ok += 1;
  }
  console.log(`Webhooks simulados para ${ok}/${messages.length} mensagens. Aguarde o worker processar.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

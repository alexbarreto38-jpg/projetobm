import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { MetaMockServer, type MockWaba } from '@wise/meta-provider';
import { logger } from '@wise/logger';

/**
 * Servidor HTTP que expõe o MetaMockServer (spec §61) como se fosse a Graph API.
 * Aponte `META_GRAPH_BASE_URL=http://localhost:4000` na API/worker para rodar o
 * produto inteiro localmente, sem o app real da Meta.
 *
 * NÃO é a Meta oficial — é apenas um simulador para desenvolvimento/testes.
 */
const PORT = Number(process.env.MOCK_META_PORT ?? 4000);

// WABA de demonstração com dois números.
const DEMO_WABAS: MockWaba[] = [
  {
    id: process.env.MOCK_WABA_ID ?? 'WABA_DEMO',
    name: 'Empresa Demo',
    currency: 'BRL',
    timezone_id: 'America/Sao_Paulo',
    account_review_status: 'APPROVED',
    phone_numbers: [
      { id: 'PN_DEMO_1', display_phone_number: '+55 11 90000-0001', verified_name: 'Empresa Demo', quality_rating: 'GREEN', status: 'CONNECTED' },
      { id: 'PN_DEMO_2', display_phone_number: '+55 11 90000-0002', verified_name: 'Empresa Demo', quality_rating: 'GREEN', status: 'CONNECTED' },
    ],
  },
];

const mock = new MetaMockServer({ wabas: DEMO_WABAS, exchangedToken: 'MOCK_EMBEDDED_TOKEN' });

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', mock: true }));
      return;
    }
    const body = req.method && !['GET', 'HEAD'].includes(req.method) ? await readBody(req) : undefined;
    const url = `http://localhost:${PORT}${req.url ?? '/'}`;
    const response = await mock.fetch(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body,
    });
    const text = await response.text();
    res.writeHead(response.status, { 'content-type': 'application/json' });
    res.end(text);
    logger.info({ method: req.method, path: req.url, status: response.status }, 'mock-meta');
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: err instanceof Error ? err.message : 'mock error' } }));
  }
});

server.listen(PORT, () => {
  logger.info({ port: PORT, wabas: DEMO_WABAS.map((w) => w.id) }, 'MetaMockServer HTTP iniciado');
});

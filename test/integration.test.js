import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { MetaClient } from '../src/metaClient.js';
import { uploadTemplateToBMs } from '../src/templates.js';
import { dispatchInBatches } from '../src/dispatch.js';

// Sobe um servidor que imita a Graph API da Meta e registra o que recebeu.
function startMockGraph() {
  const received = [];
  let rateLimitHits = 0;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};
      received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: parsed });

      // POST .../{waba}/message_templates  -> criação de template
      if (req.url.includes('/message_templates')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: '99999', status: 'PENDING', category: parsed.category }));
        return;
      }

      // POST .../{phone}/messages -> envio; devolve 429 uma vez pra testar retry
      if (req.url.includes('/messages')) {
        if (parsed.to === '5511000000001' && rateLimitHits < 1) {
          rateLimitHits++;
          res.writeHead(429, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'rate limit', code: 4 } }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ messages: [{ id: 'wamid.TEST' }] }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: { message: 'not found', code: 100 } }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        received,
        getRateLimitHits: () => rateLimitHits,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

test('integração: upload de template em massa fala com a API e reporta sucesso', async () => {
  const mock = await startMockGraph();
  try {
    const bms = [
      { name: 'BM A', token: 'tok_a', wabaId: 'waba_a', phoneId: 'p_a' },
      { name: 'BM B', token: 'tok_b', wabaId: 'waba_b', phoneId: 'p_b' },
    ];
    // injeta a base do mock em cada cliente
    process.env.META_GRAPH_BASE = mock.base;
    const results = await uploadTemplateToBMs(
      bms,
      { name: 't1', language: 'pt_BR', category: 'MARKETING', components: [] },
      { concurrency: 2 }
    );

    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.ok));
    assert.equal(results[0].templateId, '99999');
    assert.equal(results[0].status, 'PENDING');

    // conferiu que cada BM usou seu próprio token
    const tmplCalls = mock.received.filter((r) => r.url.includes('/message_templates'));
    assert.equal(tmplCalls.length, 2);
    const auths = tmplCalls.map((c) => c.auth).sort();
    assert.deepEqual(auths, ['Bearer tok_a', 'Bearer tok_b']);
  } finally {
    delete process.env.META_GRAPH_BASE;
    await mock.close();
  }
});

test('integração: dispatch em lotes envia mensagens e faz retry em 429', async () => {
  const mock = await startMockGraph();
  try {
    process.env.META_GRAPH_BASE = mock.base;
    const bms = Array.from({ length: 5 }, (_, i) => ({
      name: `BM ${i}`,
      token: `tok_${i}`,
      wabaId: `waba_${i}`,
      phoneId: `phone_${i}`,
    }));
    const recipients = [
      { phone: '5511000000001', vars: { body1: 'Maria' } }, // este recebe 429 uma vez
      { phone: '5511000000002', vars: { body1: 'João' } },
    ];

    const results = await dispatchInBatches(bms, {
      templateName: 'promo',
      languageCode: 'pt_BR',
      recipients,
      batchSize: 2, // força múltiplos lotes (2 + 2 + 1)
      bmConcurrency: 2,
      recipientConcurrency: 2,
    });

    // 5 BMs x 2 destinatários = 10 envios com sucesso
    assert.equal(results.length, 5);
    const totalSent = results.reduce((a, r) => a + r.sent, 0);
    assert.equal(totalSent, 10);
    assert.ok(results.every((r) => r.failed === 0));

    // o 429 foi retentado (bateu uma vez e depois passou)
    assert.equal(mock.getRateLimitHits(), 1);

    // corpo enviado tem o formato de template com variável
    const msg = mock.received.find((r) => r.url.includes('/messages') && r.body.to);
    assert.equal(msg.body.type, 'template');
    assert.equal(msg.body.template.name, 'promo');
    assert.equal(msg.body.template.language.code, 'pt_BR');
  } finally {
    delete process.env.META_GRAPH_BASE;
    await mock.close();
  }
});

test('integração: baseDelayMs baixo mantém o teste rápido', async () => {
  // sanidade: cliente aceita base custom via construtor também
  const c = new MetaClient({ token: 'x', base: 'http://example.invalid', baseDelayMs: 1, maxRetries: 0 });
  assert.equal(c.base, 'http://example.invalid');
});

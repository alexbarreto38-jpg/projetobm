# Webhooks

Endpoint interno: `POST /api/webhooks/meta/whatsapp` (+ `GET` para handshake).

## Verificação (spec §30)

1. **Handshake `GET`:** a Meta envia `hub.mode=subscribe`, `hub.verify_token`,
   `hub.challenge`. Respondemos o `challenge` **apenas** se o token bater com
   `META_WEBHOOK_VERIFY_TOKEN`. → `verifyWebhookChallenge()`.
2. **`POST`:** validar a assinatura `X-Hub-Signature-256: sha256=<hmac>`,
   calculada com o **App Secret** sobre o **corpo bruto**.
   → `verifyWebhookSignature()`. (Requer acesso ao raw body no route handler.)

## Processamento (spec §30, §31, §51)

Nunca processar lógica pesada na chamada do webhook. Fluxo:

```
Meta → endpoint
  → verificar assinatura
  → deduplicar (dedupeKey) + persistir evento bruto (webhook_events, rawPayload)
  → responder 200 rapidamente
  → enfileirar (fila webhook-processing)
  → worker processa → atualiza Message / MessageEvent
```

- **Dedupe** (spec §19): `dedupeKey` único em `webhook_events`.
- **Raw preservado** (spec §31): `rawPayload` nunca é sobrescrito.
- **Webhook como source de eventos** (spec §51): preferir webhook a polling para
  status de mensagens.

## Implementação atual (Fase 4)

- **Endpoint** `apps/api` (`WebhookIngestService`): `GET/POST /api/webhooks/meta/whatsapp`.
  - `GET`: handshake — retorna `hub.challenge` só se `hub.verify_token` bater com
    `META_WEBHOOK_VERIFY_TOKEN`; senão 403.
  - `POST`: valida `X-Hub-Signature-256` sobre o **corpo bruto** (content-type
    parser dedicado, isolado do parser JSON das demais rotas); assinatura
    inválida → 401 e nada é persistido.
- **Dedupe**: `dedupeKey = sha256(corpo bruto)` com unique em `webhook_events`;
  redelivery idêntica retorna `{deduped:true}` sem novo registro.
- **Fila**: após persistir, enfileira em `webhook-processing` (BullMQ) via um
  `WebhookEnqueuer` injetável (fake em testes). Resposta rápida (200).
- **Worker** `apps/worker` (`processWebhookEvent`): lê o evento, aplica
  `statuses[]` → `Message`/`MessageEvent` (mapeando estados externos→internos,
  raw preservado) e `message_template_status_update` → `TemplateDeployment`.
  Idempotente: evento já `PROCESSED` não reprocessa.

> Testado contra Postgres real (processamento) e **round-trip real de BullMQ +
> Redis** (enqueue → worker → PROCESSED), além de handshake/assinatura/dedupe na
> ingestão.

## Campos de interesse (legado)

- `messages` (mensagens recebidas), `statuses` (sent/delivered/read/failed),
  `message_template_status_update`, `phone_number_quality_update`.
  Confirmar a lista atual e novos campos do modelo 2026 na doc oficial.

**Reação a `phone_number_quality_update` (spec §25).** Quando a Meta sinaliza
`FLAGGED`, o processador **pausa** o número (`isPaused = true`) e abre um alerta
CRÍTICO (`PHONE_QUALITY_FLAGGED`). A plataforma **não** redireciona envios nem
tenta contornar a restrição. Recuperação (`UNFLAGGED`) **não** reativa
automaticamente — religar é decisão do operador.

## Ver também
- [`messages.md`](./messages.md) — eventos de status que chegam por webhook
- [`templates.md`](./templates.md) — updates de status de template
- [`error-handling.md`](./error-handling.md) — preservação dos payloads oficiais

---

Last verified against Meta documentation: 2026-08-08 (resultados de busca;
páginas oficiais bloqueadas pelo proxy — reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION`.
Sources:
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks

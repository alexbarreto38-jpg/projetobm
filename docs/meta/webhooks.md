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

## Campos de interesse (legado)

- `messages` (mensagens recebidas), `statuses` (sent/delivered/read/failed),
  `message_template_status_update`, `phone_number_quality_update`.
  Confirmar a lista atual e novos campos do modelo 2026 na doc oficial.

---

Last verified against Meta documentation: 2026-08-08 (resultados de busca;
páginas oficiais bloqueadas pelo proxy — reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION`.
Sources:
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks

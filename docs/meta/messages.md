# Mensagens

## Envio (legado)

- `POST /{phone-number-id}/messages` com `messaging_product: "whatsapp"`,
  `to`, `type: "template"`, `template: { name, language, components }`.
- Retorna `messages[0].id` (**wamid**) → guardado em `Message.externalMessageId`.
- Cada mensagem tem `idempotencyKey` (spec §19): worker reiniciado não duplica.

## Estados internos (spec §31)

`QUEUED → PROCESSING → ACCEPTED → SENT → DELIVERED → READ` / `FAILED`.

Estados **externos** da Meta (via webhook `statuses`: `sent`, `delivered`,
`read`, `failed`) são **mapeados** para os internos. O `rawPayload` do evento
nunca é sobrescrito (`message_events`).

## Não fazer

- Não fazer loop bruto de envio dentro do request HTTP (spec §18) → fila
  `message-send` + workers.
- Não fazer polling de status quando há webhook correspondente (spec §51).
- Antes de gerar qualquer mensagem: verificar **opt-out** (spec §22) e
  **consentimento** quando exigido (spec §21).

## Compliance de roteamento (spec §25)

O `CampaignRouter` distribui envio entre números **autorizados** da organização.
Nunca implementar lógica cujo fim seja contornar messaging limits, quality
restrictions, bloqueios ou enforcement. Número restrito → **pausar** aquele
número e mostrar "Envio interrompido devido a restrição da plataforma". Não
redirecionar para escapar da restrição.

---

Last verified against Meta documentation: 2026-08-08 (resultados de busca;
páginas oficiais bloqueadas pelo proxy — reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION`.
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api
- https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/

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

## Implementação atual (Fases 7–8)

- **Campanha** (`apps/api`): `CampaignService` (criar/listar/iniciar/pausar/cancelar)
  + `CampaignPreflightService` (§24) que retorna `READY/WARNING/BLOCKED` checando
  conexão, conta, número, template aprovado, idioma, consentimento, opt-out e
  público elegível. `BLOCKED` nunca inicia; `WARNING` exige confirmação.
- **Processamento** (`apps/worker` `processCampaign` = CampaignRouter): resolve o
  público elegível (exclui opt-out; MARKETING exige opt-in), distribui os
  destinatários entre os números **não pausados** das contas com deployment
  APPROVED (round-robin), registra por destinatário qual ativo envia (§53), aplica
  `dedupeKey` (§54) e gera `Message` (QUEUED) idempotente, enfileirando o envio.
- **Envio** (`apps/worker` `processMessageSend`): salvaguardas antes de enviar
  (opt-out §22, número pausado §25); envia via `adapter.sendMessage`, grava o
  `wamid` + `SENT`. Em restrição da plataforma (`ACCOUNT_STATE`) **pausa o número**
  e cria alerta — nunca redireciona (§25). Idempotente por mensagem; transitórios
  retentam pela fila (§27). Delivered/read/failed chegam por webhook (Fase 4).

## Compliance de roteamento (spec §25)

O `CampaignRouter` distribui envio entre números **autorizados** da organização.
Nunca implementar lógica cujo fim seja contornar messaging limits, quality
restrictions, bloqueios ou enforcement. Número restrito → **pausar** aquele
número e mostrar "Envio interrompido devido a restrição da plataforma". Não
redirecionar para escapar da restrição.

## Ver também
- [`templates.md`](./templates.md) — o template que embasa o envio
- [`webhooks.md`](./webhooks.md) — eventos de entrega/leitura/falha
- [`error-handling.md`](./error-handling.md) — mapeamento de erros de envio

---

Last verified against Meta documentation: 2026-08-08 (resultados de busca;
páginas oficiais bloqueadas pelo proxy — reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION`.
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/message-api
- https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages/

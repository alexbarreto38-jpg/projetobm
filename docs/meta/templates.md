# Templates

## Componentes

`name`, `language`, `category` (`MARKETING | UTILITY | AUTHENTICATION`),
`components` (header, body, footer, buttons, variables). A terminologia de
categoria deve acompanhar a oficial vigente da Meta (spec §21).

## Estados (verificados)

- `PENDING` — em revisão (até ~48h).
- `APPROVED` — aprovado; pode ser enviado.
- `REJECTED` — rejeitado na revisão.
- `PAUSED` — pausado por feedback negativo recorrente / baixa leitura; não pode
  ser enviado.
- `DISABLED` — desabilitado por feedback negativo repetido / violação de
  política; não pode ser enviado.

Nosso enum `DeploymentStatus` acrescenta estados **internos** de orquestração
(`DRAFT, QUEUED, SUBMITTED, ERROR`) além dos oficiais. Mapear a resposta da API
para o enum **confirmando os estados oficiais** antes (spec §17).

## Replicação (Bulk Template Manager — spec §17, §52)

Criar `cobranca_v1` e replicar em N contas **não é uma operação única**. Cada
implantação vira uma linha em `template_deployments`, com resultado individual:

```
Cliente A → APPROVED
Cliente B → PENDING
Cliente C → REJECTED
Cliente D → ERROR
```

Cada deployment tem `idempotencyKey` (spec §19) e preserva
`errorCode/errorSubcode/errorMessage/fbtraceId` da Meta (spec §48, §49). A
replicação roda via fila `meta-template-deployment` + workers — nunca em loop
bruto dentro do request HTTP (spec §18).

## Edges (legado — confirmar na doc)

- `GET  /{waba-id}/message_templates`
- `POST /{waba-id}/message_templates`

---

Last verified against Meta documentation: 2026-08-08 (resultados de busca;
páginas oficiais bloqueadas pelo proxy — reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION`.
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview

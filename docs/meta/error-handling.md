# Tratamento de erros da Meta

## Preservar o que a Meta envia (spec §48, §49)

Nunca inventar erros. Preservar sempre:

- `error.code`
- `error.error_subcode`
- `error.message`
- `error.fbtrace_id`

Implementado em `MetaApiError` (`@wise/meta-provider`), construído por
`metaErrorFromResponse(httpStatus, body, headers)`.

## Estrutura interna do erro

| Campo | Origem |
|-------|--------|
| `category` | classificação **nossa** (AUTH, RATE_LIMIT, VALIDATION, PERMISSION, ACCOUNT_STATE, TRANSIENT, UNKNOWN) |
| `httpStatus` | status HTTP |
| `metaErrorCode` / `metaErrorSubcode` | oficiais da Meta |
| `fbtraceId` | oficial da Meta |
| `retryable` | derivado da categoria |
| `retryAfterMs` | header `Retry-After` (spec §27) |
| `raw` | payload original preservado |

## Mensagem ao usuário (spec §48)

Nunca mostrar stack trace. `toUserMessage()` gera texto amigável, ex.:

> "Não foi possível criar o template na Conta 03. A Meta informou que a conta não
> possui a permissão necessária (código Meta 200)."

## Retry vs. permanente (spec §27)

- **Transitório** (timeout, 5xx, indisponibilidade, throttling quando oficialmente
  apropriado): backoff exponencial + jitter (1, 2, 4, 8 min...), respeitando
  `Retry-After`.
- **Permanente** (token inválido, template rejeitado, número inválido, permissão
  insuficiente, conta bloqueada): **não** retentar.

> A classificação por `code`/`subcode` deve ser ampliada conferindo a doc oficial
> de error codes antes de produção.

---

Last verified against Meta documentation: 2026-08-08 (resultados de busca;
páginas oficiais bloqueadas pelo proxy — reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION`.
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes
- https://developers.facebook.com/docs/graph-api/guides/error-handling

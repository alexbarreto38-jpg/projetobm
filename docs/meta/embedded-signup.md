# Embedded Signup

Onboarding oficial da Meta. **Nunca** pedir que clientes enviem tokens
manualmente quando o fluxo oficial permite onboarding adequado (spec §7).

> ⚠️ **Versão:** Embedded Signup **v2 será descontinuado em 15/10/2026**.
> Integrar contra a versão atual (**v4**). Confirmar detalhes na doc oficial.

## Fluxo (spec §7)

```
Usuário → "Conectar WhatsApp" (apps/web)
  → Embedded Signup oficial da Meta (Facebook Login for Business, popup)
  → Usuário autoriza os ativos
  → Callback seguro (apps/api)
  → Backend troca o code por token (server-side; App Secret nunca no browser)
  → Descobre Business / contas / números autorizados
  → Salva ativos (meta_connections, whatsapp_accounts, phone_numbers)
  → Assina webhooks necessários (subscribed_apps)
  → Executa health check (AccountHealthService)
```

## Peças

- **Config do Facebook Login for Business** (`META_CONFIG_ID`) define quais
  permissões pedir e quais dados coletar.
- **Frontend** carrega o SDK oficial e abre o fluxo com o `config_id`. Recebe um
  `code` (token exchange server-side) — nunca um token de longa duração.
- **Backend** (`/api/meta/embedded-signup/callback`):
  1. troca o `code` por token via Graph API (server-side);
  2. cria/atualiza `Credential` (cifrada no `CredentialVault`);
  3. cria/atualiza `MetaConnection` (status `CONNECTED`);
  4. dispara sincronização inicial (fila `account-sync`);
  5. assina webhooks;
  6. roda health check.

## Segurança

- App Secret e tokens **apenas no backend** (spec §8, §46).
- `state`/CSRF no início do fluxo; validar na volta.
- Toda troca de token é server-side.

---

Last verified against Meta documentation: 2026-08-08 (resultados de busca;
páginas oficiais bloqueadas pelo proxy — reconferir na implementação).
Graph API version: configurável via `META_GRAPH_VERSION`.
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/

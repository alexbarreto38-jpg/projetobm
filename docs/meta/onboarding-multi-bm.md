# Onboarding de vários Business Managers (BMs)

Esta é a pergunta operacional central de um SaaS multi-tenant: **o que se
configura uma vez e o que acontece a cada novo cliente/BM?**

Resumo em uma linha: **o App Meta se configura UMA vez; cada BM novo entra só
pelo Embedded Signup, sem tocar em nenhuma configuração.**

> ⚠️ Nomes de menus/telas e detalhes de permissões mudam com frequência.
> Confirme na doc oficial atual (spec §66) antes de produção. Este ambiente não
> acessa `developers.facebook.com`.

## Uma vez só (o App = o app *da plataforma*)

O "Wise API Manager" é **um único Meta App** (tipo Business), o seu app de
_Tech Provider / Solution Partner_. Configurado **uma vez na vida**:

| Item | Onde | Variável |
|------|------|----------|
| App ID | App settings → Basic | `META_APP_ID` |
| App Secret | App settings → Basic (secreto, só backend) | `META_APP_SECRET` |
| Configuration ID (Facebook Login for Business / Embedded Signup) | Config do FLB | `META_CONFIG_ID` |
| Verify token do webhook (você inventa) | WhatsApp → Configuration → Webhooks | `META_WEBHOOK_VERIFY_TOKEN` |
| Callback URL do webhook | idem | (aponta para a API) |
| Permissões + **App Review** para ficar _Live_ | App Review | — |

Detalhes de criação: veja [`setup-app.md`](./setup-app.md). Essas variáveis vão
nos secrets do deploy **uma vez** e ficam centralizadas no `MetaProvider`
(spec §3, §5) — nunca espalhadas pelo código.

## A cada BM novo (100% runtime, zero config manual)

O cliente clica em **Conectar WhatsApp** → abre o **Embedded Signup** oficial,
movido pelo seu `META_CONFIG_ID`. O fluxo já implementado faz o resto:

1. O popup devolve um `code`.
2. `connectFromCode` → `oauth.exchangeCode` troca o `code` por um token e
   **guarda 1 token por WABA cifrado no `CredentialVault`** (spec §8). O token
   de um cliente **nunca** serve para outro — isolamento por organização
   (spec §10).
3. `subscribeWebhooks` assina a WABA do cliente no **seu** app via
   `POST /{waba-id}/subscribed_apps` — para você receber mensagens/status
   daquele cliente.
4. Descoberta de ativos: números, templates e estado sincronizados; a conta
   aparece no painel.

> **N Business Managers = 1 app + N tokens** (um por conexão). Não há App ID,
> App Secret nem verify token "por cliente".

Referência do fluxo: [`embedded-signup.md`](./embedded-signup.md) e
[`webhooks.md`](./webhooks.md).

## O que É por cliente — mas NÃO é config do seu app

Duas coisas dependem de cada cliente/BM e **não** exigem reconfigurar a
plataforma:

- **App em modo _Live_:** enquanto o App Review não passar, só BMs com papel no
  seu app (usuários de teste/desenvolvimento) conseguem concluir o Embedded
  Signup. Depois de _Live_, qualquer BM conecta. Isso é um marco **único** do
  seu app, não um passo por cliente.
- **Verificação de negócio e _messaging limits_:** são definidos pela Meta
  **por BM / por número**. Cada cliente resolve a verificação do próprio
  negócio para subir de tier. A plataforma **não** tenta contornar limites,
  qualidade ou bloqueios; número restrito é **pausado**, nunca redirecionado
  (spec §25).

## Checklist de deploy (uma vez)

- [ ] Criar o Meta App e preencher `META_APP_ID` / `META_APP_SECRET`.
- [ ] Criar a configuração do Embedded Signup e preencher `META_CONFIG_ID`.
- [ ] Definir `META_WEBHOOK_VERIFY_TOKEN` e a Callback URL apontando para a API.
- [ ] Solicitar permissões e passar o **App Review** (app _Live_).
- [ ] Confirmar `META_GRAPH_VERSION` no changelog oficial e remover a base do
      mock (deixar `https://graph.facebook.com`).

Feito isso, cada BM novo é **só** o botão **Conectar WhatsApp** — nada de
mexer em credenciais de novo.

---

Last verified against Meta documentation: 2026-08-10 (fluxo descrito conforme a
implementação; caminhos de menu e nomes de permissão são referência — confirmar
na doc oficial atual, spec §66).
Graph API version: ver `META_GRAPH_VERSION` (.env.example)
Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/
- https://developers.facebook.com/docs/whatsapp/embedded-signup/
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started/

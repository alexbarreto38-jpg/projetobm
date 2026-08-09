# Wise API Manager — Visão de Arquitetura

> Plataforma SaaS multi-tenant para gestão de múltiplas contas do WhatsApp
> Business Platform usando **exclusivamente** APIs e fluxos oficiais da Meta.

## Princípios inegociáveis (spec §78)

Ordem de prioridade: **segurança → conformidade Meta → estabilidade →
idempotência → rastreabilidade → escalabilidade → experiência → velocidade.**
Os seis primeiros nunca são sacrificados por velocidade.

- **Somente API oficial.** Nada de API não oficial, automação de navegador,
  scraping do Business Manager ou qualquer mecanismo para contornar limites,
  restrições ou enforcement da Meta (spec §67).
- **Camada MetaProvider única.** Toda chamada à Graph API passa por
  `@wise/meta-provider`. Nenhuma URL `graph.facebook.com/vXX.X` espalhada pelo
  código (spec §3, §5, §68).
- **Multi-tenant com isolamento total.** Toda tabela operacional carrega
  `organization_id`; autorização é aplicada no backend, nunca só no frontend
  (spec §10).
- **Meta é source of truth.** Guardamos sempre o ID oficial da Meta ao lado da
  representação interna; sincronizamos periodicamente (spec §50).

## Monorepo (spec §69)

```
apps/
  api/       Fastify + TS — auth, organizations, RBAC, conexão Meta, webhooks    ✅
  web/       Next.js (App Router) + Tailwind — painel BFF (login, dashboard, telas)  ✅
  worker/    BullMQ workers — webhook-processing, meta-template-deployment, contact-import,
             campaign-processing, message-send                                             ✅
packages/
  database/       Prisma schema + client + migrations (@wise/database)      ✅
  meta-provider/  Camada Meta: MetaGraphClient, adapters, CredentialVault (@wise/meta-provider)  ✅
  config/         Env validado por Zod (@wise/config)                       ✅
  types/          RBAC, capabilities, tipos compartilhados (@wise/types)    ✅
  logger/         Logs estruturados com redação de segredos (@wise/logger)  ✅
  auth/           Sessão (JWT), hashing (scrypt), guards RBAC (@wise/auth)  ✅
  validation/     Schemas Zod compartilhados (@wise/validation)             ✅
  queue/          Filas/jobs BullMQ + conexão Redis (@wise/queue)           ✅
docs/
  architecture/   este documento
  meta/           documentação verificada contra a Meta (§65)
```

### Autenticação (Fase 1)

`apps/api` (Fastify) é a autoridade de sessão: emite um **JWT em cookie
HttpOnly/SameSite/Secure** (spec §47), senhas com **scrypt** (`@wise/auth`).
Papéis/permissões são resolvidos do banco a cada request — o token só
identifica o usuário (§10). Rotas: `/api/auth/{signup,login,logout,me}` e
`/api/organizations` (CRUD + membros) com isolamento por tenant e RBAC. O painel
`apps/web` consumirá esta API (Auth.js no cliente é uma opção da próxima fase).

Gerenciado por **pnpm workspaces + Turborepo**. Todo código é TypeScript.

## Camada Meta (o coração)

```
MetaProvider
├── graph/MetaGraphClient      Todas as requisições HTTP à Graph API (versão centralizada)
├── credentials/CredentialVault Cifragem AES-256-GCM de tokens (spec §8)
├── errors/MetaApiError         Preserva code/subcode/message/fbtrace_id (spec §48, §49)
├── webhooks/verify             Handshake + assinatura X-Hub-Signature-256 (spec §30)
└── adapters/
    ├── WhatsAppAccountAdapter  Interface: listPhoneNumbers, listTemplates,
    │                           createTemplate, sendMessage, subscribeWebhooks, getHealth
    ├── LegacyWabaAdapter       Modelo GA atual (WABA)
    └── NewAccountModelAdapter  Modelo 2026 (em transição — pontos de extensão)
```

O resto do sistema conversa com o `MetaProvider` e nunca sabe qual modelo de
conta está por trás (spec §59).

## Estratégia Legacy vs. Novo Modelo (2026)

Ver `docs/meta/account-model-2026.md`. Resumo:

- `WhatsAppAccount.accountModel ∈ { LEGACY, NEW_MODEL, UNKNOWN }`.
- `resolveAdapter(model)` escolhe o adapter. `UNKNOWN` → Legacy (seguro/GA).
- **Capability detection** (`AccountCapabilities`) tem precedência sobre feature
  flags. A UI se adapta ao que a conta realmente suporta (spec §58).
- Tabelas `phone_accounts` e `messaging_accounts` já existem para o novo modelo,
  sem tornar `legacy_waba_id` obrigatório (permite migração — spec §12).

## Confiabilidade (Fases 4–8)

- **Filas** (spec §26): `meta-template-deployment`, `campaign-processing`,
  `message-send`, `webhook-processing`, `account-sync`, `dead-letter`.
- **Idempotência** (spec §19): `idempotencyKey` único em deployments, campanhas e
  mensagens; `dedupeKey` em webhooks e destinatários.
- **Retry** (spec §27): backoff exponencial + jitter para erros transitórios;
  respeita `Retry-After`; erros permanentes não são retentados.
- **Circuit breaker** (spec §28) por conexão/número — `CircuitBreaker` em
  `@wise/queue` (CLOSED→OPEN→HALF_OPEN) com estado compartilhado em Redis;
  integrado ao envio (`message-send`).
- **Rate control** configurável (spec §41) — `RateLimiter` (token-bucket) em
  `@wise/queue` com store em Redis, por número; válvula de segurança, nunca para
  maximizar limites.
- **Dead-letter queue** (spec §56): jobs que esgotam as tentativas são gravados
  em `dead_letter_jobs` (motivo/conta/data); retry manual re-executa o job (o
  processador re-valida) — sem "reenviar tudo" cego.
- **Sincronização periódica** (spec §50): agendador enfileira `account-sync` para
  todas as contas conectadas; o worker re-busca dados/números da Meta (source of
  truth) e faz upsert.

## Observabilidade (Fase 9)

- **Relatórios** (`ReportsService`, §32): funil de mensagens (enviadas/entregues/
  lidas/falhas/pendentes) + taxas, com filtros por data/campanha/número.
- **Health check** (`AccountHealthService`, §29): conexão, permissão, conta,
  número, webhook e templates por conta.
- **Alertas** (`AlertsService`, §36): lista/reconhece/resolve alertas do sistema
  (ex.: número restrito criado pelo envio ao pausar um número).
- Telas de Relatórios e Alertas no painel consomem esses endpoints.

## Plano por fases (spec §70)

| Fase | Entrega | Status |
|------|---------|--------|
| 1 | Monorepo, Prisma, config, RBAC, Auth, Organizations | 🟢 backend + painel web |
| 2 | MetaGraphClient, CredentialVault, MetaConnection, Embedded Signup | 🟢 conexão + descoberta prontas (testado via mock) |
| 3 | Sincronização: Business, contas, números | 🟢 sync por conta + agendador periódico (§50) |
| 4 | Webhooks: endpoint, storage, fila de processamento | 🟢 endpoint + fila + worker prontos |
| 5 | Templates, deployments, Bulk Template Manager | 🟢 CRUD + replicação + submissão prontos |
| 6 | Contatos, import CSV, opt-in/opt-out | 🟢 CRUD + consentimento + opt-out + import por streaming |
| 7 | Campanhas, Preflight, CampaignRouter | 🟢 CRUD + preflight + roteamento + geração de mensagens |
| 8 | Fila de mensagens, workers, retry, idempotência, breaker | 🟢 envio + idempotência + retry + circuit breaker (Redis) |
| 9 | Relatórios, dashboard, auditoria, alertas | 🟢 relatórios + health check + alertas (API + painel) |
| 10 | Novo account model 2026 conforme disponibilidade oficial | ⚪ |

## Conformidade & observabilidade adicionais

- **LGPD (§44):** `LgpdService` — exportação de dados pessoais/operacionais (sem
  segredos), exclusão total da organização (cascade, com confirmação por slug) e
  purga por retenção. Endpoints `/data-export`, `/data-purge`, `DELETE /data`.
- **Sentry (§43):** `initSentry`/`captureException` em `@wise/logger`, ativados
  por `SENTRY_DSN`, com `beforeSend` que redige tokens/segredos recursivamente.
  Integrado no bootstrap e nas falhas de api/worker.
- **E2E (Playwright):** `apps/web/e2e` — smoke do login e do fluxo
  registro→dashboard→criar template. Roda via `pnpm test:e2e` contra a stack
  (usa o Chromium pré-instalado; `PW_CHROMIUM_PATH`), fora do `pnpm test` unitário.

## Observabilidade & hardening (produção)

- **Métricas Prometheus:** a API expõe `GET /metrics` (processo + gauges de
  mensagens por status, alertas abertos e dead-letter pendente), opcionalmente
  protegido por `METRICS_TOKEN`.
- **Rate limit de credenciais:** `/api/auth/{login,signup}` com limite estrito
  (10/min) além do global — anti brute-force (spec §47).
- **Cabeçalhos de segurança no painel:** CSP, `X-Frame-Options: DENY`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e HSTS em
  produção (spec §47).

## Critério de "pronto" (spec §76)

Uma feature só está pronta com: frontend · backend · validação · autorização ·
banco · tratamento de erro · loading · empty state · logs · teste · documentação.

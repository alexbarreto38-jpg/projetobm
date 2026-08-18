# Wise API Manager

Plataforma **SaaS multi-tenant** para gestão de múltiplas contas do **WhatsApp
Business Platform**, usando **exclusivamente** APIs e fluxos **oficiais da Meta**.

> Segurança, conformidade com a Meta e rastreabilidade vêm antes de velocidade
> (spec §78). Nada de API não oficial, scraping ou automação de navegador.

## Status

**Fase 1 — fundação + backend** (este estágio):

- ✅ Monorepo pnpm + Turborepo, TypeScript estrito
- ✅ Schema Prisma multi-tenant completo + migração inicial (spec §9)
- ✅ Camada Meta base: `MetaGraphClient`, `CredentialVault`, `MetaApiError`,
  verificação de webhook, `Legacy`/`New` account adapters (spec §3, §5, §8, §59)
- ✅ `@wise/config`, `@wise/types` (RBAC + capabilities), `@wise/logger`
  (redação de segredos), `@wise/validation` (Zod)
- ✅ `@wise/auth`: sessão JWT (cookie HttpOnly/SameSite/Secure), hashing scrypt,
  guards RBAC + isolamento por tenant (spec §10, §34, §47)
- ✅ `apps/api` (Fastify): `/api/auth/{signup,login,logout,me}` e
  `/api/organizations` (CRUD + membros) com autorização no backend
- ✅ **Conexão Meta (Fase 2):** Embedded Signup (callback server-side), troca de
  code→token, `CredentialVault` ligado ao banco, descoberta e persistência de
  WABA + números, assinatura de webhooks, health check — idempotente
- ✅ **MetaMockServer** (spec §61) para simular a Graph API em testes
- ✅ **Webhooks (Fase 4):** endpoint `/api/webhooks/meta/whatsapp` (handshake +
  verificação de assinatura sobre corpo bruto), dedupe, persistência do evento
  bruto e enfileiramento; `@wise/queue` (BullMQ) + `apps/worker` processando
  status de mensagens e templates
- ✅ **Templates + Bulk Manager (Fase 5):** CRUD de template mestre, replicação
  idempotente em N contas via fila `meta-template-deployment`, worker que submete
  à Meta (preservando erros) e acompanhamento individual de status
- ✅ **Contatos (Fase 6):** CRUD com normalização E.164 (libphonenumber-js) e
  dedupe por (org, telefone), consentimento/opt-in, opt-out, e **import de CSV
  em background por streaming/batches** com contadores de progresso
  (importados/duplicados/inválidos/opt-out)
- ✅ **Campanhas + envio (Fases 7–8):** criação com alvos, `CampaignPreflightService`
  (READY/WARNING/BLOCKED — §24), `CampaignRouter` que distribui destinatários entre
  números autorizados e não pausados (registrando qual ativo envia cada mensagem,
  §53) com chave de duplicidade (§54), e workers de geração e envio de mensagens
  (idempotentes; pausa o número em restrição da plataforma, §25)
- ✅ **Robustez operacional:** `RateLimiter` (token-bucket/Redis) por número (§41),
  **dead-letter queue** com retry manual que re-valida (§56), e **sincronização
  periódica** de contas (`account-sync`, §50) — Meta como source of truth
- ✅ **LGPD (§44):** exportação de dados, exclusão total da organização (com
  confirmação por slug) e retenção/minimização — com telas em Configurações
- ✅ **Sentry (§43):** integração opcional (api/worker) ativada por DSN, com
  redação recursiva de tokens/segredos antes do envio
- ✅ **Painel completo:** páginas de Dead-letter (reprocessar/descartar),
  Diagnóstico por conta (health 🟢/🔴) e Dados/LGPD
- ✅ **124 testes** (unit + integração contra Postgres/Redis reais) **+ 2 E2E
  Playwright** (login e registro→dashboard→criar template) rodando de verdade
  contra a stack: vault, webhook, erros Meta, auth, RBAC, isolamento, conexão
  Meta, webhooks, templates, telefone, contatos/import, campanhas/preflight,
  roteamento, envio, breaker, rate limit, relatórios, health, alertas,
  dead-letter, sync, LGPD e redação Sentry
- ✅ CI (serviços Postgres + Redis, migrate, lint, typecheck, test, build)

- ✅ **Painel `apps/web`** (Next.js App Router + Tailwind, tema preto/branco/amarelo):
  login/registro (BFF — token só no servidor, cookie HttpOnly same-origin),
  middleware de sessão, layout com sidebar, dashboard com cards. **Operável via
  Server Actions**: conectar conta Meta (token/System User; botão Embedded Signup
  para produção), criar template + **Bulk Manager** (replicar em N contas com
  status por conta), **wizard de campanha** (criar → preflight com checklist
  🟢/🟡/🔴 → iniciar/pausar/cancelar), criar/importar contatos (CSV) e opt-out,
  além de Relatórios, Alertas (reconhecer/resolver) e Configurações

- ✅ **Assistente conversacional (Módulo 1):** `@wise/assistant` — o "cérebro"
  que interpreta pedidos em linguagem natural e os transforma em ações reais via
  ferramentas do backend, com máquina de estados de campanha (rascunho →
  preparado → aguardando aprovação → aprovado → executando → finalizado),
  **prévia obrigatória**, **confirmação explícita** atrelada ao hash da
  configuração, limites de segurança (2ª aprovação/bloqueio), permissões por
  ferramenta e a regra "nunca inventar resultado" (`outcome`). Rotas
  `/organizations/:id/assistant/messages` (habilitadas por `ANTHROPIC_API_KEY`);
  adaptador `PrismaAssistantBackend` liga ao `CampaignService`/Meta. Capacidades
  que a Meta não expõe (saldo/custo/recarga) são reportadas honestamente como
  não suportadas (spec §11, §24). Detalhes em
  [`docs/architecture/assistant.md`](docs/architecture/assistant.md). **29 testes.**
- ✅ **Provider Infobip do assistente (`@wise/infobip-provider`):** o MESMO
  cérebro rodando sobre o Infobip — cliente tipado (saldo, templates, envio de
  template em lote), `InfobipAssistantBackend` (validação de lista E.164 +
  dedupe, envio idempotente por `messageId`, acompanhamento por relatórios de
  entrega). A API escolhe Meta ou Infobip por configuração (`INFOBIP_*`); o
  Infobip **expõe saldo** (§11 funciona). Rotas de ingestão de lista e webhook
  de entrega. **9 testes.**
- ✅ **Observabilidade + resiliência (Fase 9 + §28):** `CircuitBreaker` por número
  (CLOSED→OPEN→HALF_OPEN, estado em Redis) integrado ao envio; `ReportsService`
  (funil + taxas, §32), `AccountHealthService` (§29) e `AlertsService` (§36) com
  endpoints e telas de Relatórios/Alertas no painel

Fluxo mínimo de produção (§72) coberto de ponta a ponta contra mock: conectar →
descobrir → template → replicar → aprovar → importar contatos → campanha →
preflight → fila → envio → webhook, com métricas, health e alertas. **108 testes**
verdes. Próximo (opcional): wizard de campanha e Bulk Manager no painel, rate
control (§41), Sentry (§43) e o novo account model 2026 quando GA (Fase 10).

## Stack

Next.js · React · TypeScript · Tailwind · shadcn/ui · Node.js · PostgreSQL ·
Prisma · Redis · BullMQ · Auth.js.

## Estrutura

```
apps/     web (Next.js) · api (Node) · worker (BullMQ)   ← Fases seguintes
packages/ database · meta-provider · infobip-provider · assistant · config · types · logger
docs/     architecture/ · meta/ (verificada contra a Meta)
```

Detalhes em [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Começando

### Mais rápido — Docker (roda tudo contra o simulador da Meta)

```bash
docker compose up --build
docker compose exec api pnpm --filter @wise/api seed:demo   # dados de demonstração
```

Acesse **http://localhost:3000** e entre com **demo@demo.com / demo12345678** —
já vem com conta Meta conectada (mock), números, template aprovado e contatos.
Detalhes e a opção manual em [`docs/local-dev.md`](docs/local-dev.md). O
simulador (`apps/mock-meta`) permite rodar o fluxo inteiro **sem o app real da
Meta**; para ligar na Meta de verdade, veja
[`docs/meta/setup-app.md`](docs/meta/setup-app.md).

### Manual

Pré-requisitos: Node ≥ 20, pnpm 9, PostgreSQL e Redis (locais ou gerenciados).

```bash
# 1. Dependências
pnpm install

# 2. Variáveis de ambiente
cp .env.example .env
#   Gere segredos:
#   openssl rand -base64 32   # AUTH_SECRET
#   openssl rand -base64 32   # ENCRYPTION_KEY (32 bytes)
#   Preencha META_APP_ID, META_APP_SECRET, META_CONFIG_ID, etc.

# 3. Banco (Prisma)
pnpm db:generate
pnpm db:migrate          # aplica migrations em dev
pnpm --filter @wise/database db:seed   # organização raiz "Wise"

# 4. Qualidade
pnpm typecheck
pnpm test
```

## Meta / Graph API

O versionamento é **centralizado** (spec §5): `META_GRAPH_BASE_URL` +
`META_GRAPH_VERSION`. Nenhuma URL `graph.facebook.com/vXX.X` espalhada pelo
código. Toda chamada passa por `@wise/meta-provider`.

> ⚠️ Confirme a versão GA atual da Graph API no
> [changelog oficial](https://developers.facebook.com/docs/graph-api/changelog)
> e ajuste `META_GRAPH_VERSION` antes de produção. Ver
> [`docs/meta/`](docs/meta/) para a documentação verificada de cada integração.

## Segurança

- Tokens cifrados em repouso (AES-256-GCM) via `CredentialVault`; nunca em texto
  puro nem no frontend (spec §8, §46).
- Segredos só no backend/worker; `.env` nunca é commitado.
- Logs com redação automática de tokens/segredos (spec §42, §43).
- RBAC aplicado no backend; isolamento por `organization_id` (spec §10, §34).

## Conformidade

Este produto **não** implementa evasão de limites, rotação para contornar
bloqueios, mascaramento de origem, bypass de enforcement, scraping ou API não
oficial (spec §67). Recursos que conflitem com políticas oficiais não são
implementados silenciosamente.

## Licença

Proprietário / privado.

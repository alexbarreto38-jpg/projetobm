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
- ✅ **61 testes** (unitários + integração contra Postgres real + round-trip real
  de BullMQ/Redis): vault, webhook, erros Meta, senha, sessão, autorização,
  isolamento multi-tenant, RBAC, conexão Meta, ingestão/dedupe e processamento
  de webhook
- ✅ CI (serviços Postgres + Redis, migrate, lint, typecheck, test, build)

Próximo: `apps/web` (painel Next.js) consumindo a API; templates + Bulk Manager;
contatos; campanhas + preflight; envio (`docs/architecture/overview.md`).

## Stack

Next.js · React · TypeScript · Tailwind · shadcn/ui · Node.js · PostgreSQL ·
Prisma · Redis · BullMQ · Auth.js.

## Estrutura

```
apps/     web (Next.js) · api (Node) · worker (BullMQ)   ← Fases seguintes
packages/ database · meta-provider · config · types · logger  ← neste commit
docs/     architecture/ · meta/ (verificada contra a Meta)
```

Detalhes em [`docs/architecture/overview.md`](docs/architecture/overview.md).

## Começando

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

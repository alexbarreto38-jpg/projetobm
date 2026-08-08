# Desenvolvimento local

Duas formas de rodar tudo — **com Docker** (mais simples) ou **manual**. Ambas
usam o **mock-meta** (simulador da Graph API), então funcionam de ponta a ponta
**sem o app real da Meta**.

## Opção A — Docker (recomendado)

```bash
docker compose up --build
# em outro terminal, popular dados de demonstração (uma vez):
docker compose exec api pnpm --filter @wise/api seed:demo
```

Acesse **http://localhost:3000** e entre com:

- **demo@demo.com** / **demo12345678**

Já vem com uma conta Meta conectada (via mock), 2 números, um template aprovado
e 5 contatos com consentimento — dá para criar e iniciar uma campanha na hora.

Serviços: `postgres` · `redis` · `mock-meta` (4000) · `api` (3001) · `worker` ·
`web` (3000).

## Opção B — Manual

Pré-requisitos: Node ≥ 20, pnpm 9, e Postgres + Redis acessíveis.

```bash
pnpm install
cp .env.example .env    # ajuste DATABASE_URL / REDIS_URL

# Aponte a Graph API para o mock local:
export META_GRAPH_BASE_URL=http://localhost:4000
export META_GRAPH_VERSION=v23.0
export META_APP_ID=mock-app-id
export META_APP_SECRET=mock-app-secret
export META_WEBHOOK_VERIFY_TOKEN=dev-verify
export ENCRYPTION_KEY="$(openssl rand -base64 32)"
export AUTH_SECRET="$(openssl rand -base64 32)"
export COOKIE_SECURE=false        # sessões por HTTP em dev

# Banco
pnpm db:generate && pnpm db:migrate

# Suba cada processo (terminais separados):
pnpm --filter @wise/mock-meta start   # simulador da Meta (porta 4000)
pnpm --filter @wise/api start         # API (porta 3001)
pnpm --filter @wise/worker start      # workers (precisa de REDIS_URL)
pnpm --filter @wise/web dev           # painel (porta 3000)

# Dados de demonstração
ENCRYPTION_KEY=$ENCRYPTION_KEY pnpm --filter @wise/api seed:demo
```

## Rodando os testes

```bash
pnpm test          # unit + integração (precisa de Postgres/Redis)
pnpm --filter @wise/web test:e2e   # E2E Playwright (precisa da stack no ar)
```

Para os testes que tocam banco, exporte `DATABASE_URL` (e `REDIS_URL` para os de
fila). O E2E usa o Chromium pré-instalado — aponte `PW_CHROMIUM_PATH` se
necessário.

## Do mock para a Meta real

Quando você tiver o app na Meta (ver `docs/meta/setup-app.md`), basta trocar as
variáveis `META_*` e remover o `META_GRAPH_BASE_URL` do mock (deixando o padrão
`https://graph.facebook.com`). O código não muda — tudo passa pela
`@wise/meta-provider`.

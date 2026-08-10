# Deploy em produção

Arquitetura sugerida (spec §2): **web na Vercel**, **api + worker** em
Railway/Render/VPS, **Postgres** e **Redis** gerenciados.

> Antes de produção: confirme os endpoints/permissões na doc oficial da Meta
> (spec §66), tenha o app aprovado no App Review e ajuste `META_GRAPH_VERSION`
> para a versão GA atual. Ver `docs/meta/setup-app.md`.

## 1. Bancos gerenciados
- **PostgreSQL** (ex.: Neon, Supabase, Railway, Render). Guarde a `DATABASE_URL`.
- **Redis** (ex.: Upstash, Railway, Render). Guarde a `REDIS_URL`.

## 2. API + Workers (Render — blueprint pronto)
O `render.yaml` na raiz define `wise-api` (web service Docker) e `wise-worker`
(worker Docker), além de Postgres e Redis.

1. No Render: **New → Blueprint**, aponte para o repositório.
2. Preencha os segredos `sync: false`: `ENCRYPTION_KEY` (`openssl rand -base64
   32`), `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`,
   `META_WEBHOOK_VERIFY_TOKEN`, `META_REDIRECT_URI`.
3. A API roda `prisma migrate deploy` no start. Health checks:
   - `/health` — **liveness**: 200 se o processo está de pé (não toca em
     dependências). Bom para reiniciar processos travados.
   - `/ready` — **readiness**: verifica Postgres (e Redis, se configurado). 200
     quando tudo up, 503 se alguma dependência falha. O `render.yaml` usa
     `/ready` como `healthCheckPath` para não rotear tráfego antes de o serviço
     conseguir servir de fato.

Alternativas (Railway/VPS): use a mesma imagem do `Dockerfile`, com os comandos:
- API: `pnpm --filter @wise/database db:deploy && pnpm --filter @wise/api start`
- Worker: `pnpm --filter @wise/worker start`

## 3. Painel web (Vercel)
1. Importe o repositório na Vercel; **Root Directory** = `apps/web`
   (o `vercel.json` já ajusta build/install para o monorepo pnpm).
2. Variável de ambiente: **`API_URL`** = URL pública da API (ex.:
   `https://wise-api.onrender.com`). É lida em runtime (server-side); o token
   nunca vai ao browser.
3. Em produção, os cookies são `Secure` por padrão (HTTPS) — não defina
   `COOKIE_SECURE`.

## 4. Webhooks da Meta
Aponte o webhook do app da Meta para:
`https://SUA_API/api/webhooks/meta/whatsapp` com o `META_WEBHOOK_VERIFY_TOKEN`.

## 5. Checklist de variáveis (produção)

| Serviço | Variáveis |
|---------|-----------|
| API | `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `META_GRAPH_VERSION`, `META_WEBHOOK_VERIFY_TOKEN`, `META_REDIRECT_URI` |
| Worker | `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` |
| Web | `API_URL` |

Nunca comite segredos. Rotação de `ENCRYPTION_KEY` é suportada via
`ENCRYPTION_KEY_PREVIOUS` (o CredentialVault decifra credenciais antigas).

> **Validação no boot (fail-fast).** A API e o worker validam o ambiente ao
> subir (`@wise/validation`): se algo estiver ausente ou malformado, o processo
> **recusa iniciar** e imprime **todos** os problemas de uma vez — ex.:
> `AUTH_SECRET: ausente ou muito curto`, `ENCRYPTION_KEY: deve ser base64 de 32
> bytes`, `META_GRAPH_VERSION: formato esperado vXX.X`. As credenciais Meta são
> opcionais, mas se **uma** peça do trio (`META_APP_ID`, `META_APP_SECRET`,
> `ENCRYPTION_KEY`) estiver presente, o trio inteiro passa a ser exigido —
> evita subir com metade da configuração. No Render, isso aparece nos logs do
> serviço e o deploy falha o health check em vez de subir quebrado.

## 6. Deploy automático (GitHub Actions)
O workflow `.github/workflows/deploy.yml` dispara o deploy ao dar push na `main`.
Basta colar **dois secrets** no GitHub (Settings → Secrets and variables →
Actions):

- `RENDER_DEPLOY_HOOK_URL` — Render → serviço → Settings → **Deploy Hook**.
- `VERCEL_DEPLOY_HOOK_URL` — Vercel → projeto → Settings → Git → **Deploy Hooks**.

Sem os secrets, o workflow apenas registra que não há hooks e não falha. Render e
Vercel também podem fazer auto-deploy nativo por Git — o workflow é só um gatilho
explícito/opcional.

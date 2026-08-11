# Imagem única do monorepo. O serviço é escolhido pelo `command` no compose.
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# OpenSSL é exigido pelos engines do Prisma. Instalar ANTES do `db:generate`
# garante que o binário correto (debian-openssl-3.x) seja detectado e embutido
# no client — sem isso o Prisma cai no engine 1.1.x e falha em runtime.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Instala dependências (camada cacheável).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

# Gera o Prisma Client e compila o painel web.
RUN pnpm --filter @wise/database db:generate
RUN pnpm --filter @wise/web build

EXPOSE 3000 3001 4000
# Sem CMD padrão: cada serviço define o próprio `command` no docker-compose.

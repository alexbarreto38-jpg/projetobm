#!/bin/sh
# Inicia o worker de processamento de filas (BullMQ).
# Mesmo motivo do start-api.sh: script simples evita o embaralhamento de aspas
# do dockerCommand no Render (exit 127).
set -e
exec pnpm --filter @wise/worker start

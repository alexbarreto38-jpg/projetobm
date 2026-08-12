#!/bin/sh
# Sobe o painel web (Next.js). `next start` (sem -p) honra a variável PORT
# injetada pela plataforma (Render); localmente, sem PORT, cai no padrão 3000.
set -e
exec pnpm --filter @wise/web start

#!/bin/sh
# Sobe a API: aplica as migrações do Prisma e inicia o servidor.
#
# Fica num arquivo (em vez de `sh -c "... && ..."` direto no dockerCommand)
# porque o Render reinterpreta o comando e as aspas aninhadas faziam a linha
# INTEIRA virar um único "comando não encontrado" (exit 127). Um script simples
# roda sem ambiguidade em qualquer orquestrador (Render, docker-compose, etc.).
#
# `exec` substitui o shell pelo processo Node, para o SIGTERM do redeploy chegar
# ao processo e disparar o encerramento gracioso (drenar conexões em voo).
set -e
pnpm --filter @wise/database db:deploy
exec pnpm --filter @wise/api start

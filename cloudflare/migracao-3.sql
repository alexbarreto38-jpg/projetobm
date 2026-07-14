-- Migração 3 — Ponto WISE
-- Cria a tabela de configuração e o código de liberação do aparelho da empresa.
-- Rodar UMA vez no banco que já está no ar:
--   npx wrangler d1 execute ponto-wise --remote --file=migracao-3.sql
-- É seguro rodar de novo (não apaga nada).

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
INSERT OR IGNORE INTO config (chave, valor) VALUES ('aparelho_codigo', '4321');

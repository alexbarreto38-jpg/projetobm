-- Migração 2 — Ponto WISE
-- Adiciona os campos de saída, salário, carga do mês e compensação.
-- Rodar UMA vez no banco que já está no ar:
--   npx wrangler d1 execute ponto-wise --remote --file=migracao-2.sql
-- (Se alguma coluna já existir, o comando acusa erro nela — pode ignorar,
--  é só sinal de que aquela parte já foi aplicada.)

ALTER TABLE funcionarios ADD COLUMN hora_saida TEXT NOT NULL DEFAULT '18:00';
ALTER TABLE funcionarios ADD COLUMN salario    REAL NOT NULL DEFAULT 0;
ALTER TABLE funcionarios ADD COLUMN horas_mes  REAL NOT NULL DEFAULT 220;
ALTER TABLE registros    ADD COLUMN compensar  INTEGER NOT NULL DEFAULT 0;

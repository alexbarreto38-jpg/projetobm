-- Esquema do banco D1 (Cloudflare) — Ponto WISE
CREATE TABLE IF NOT EXISTS funcionarios (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT NOT NULL,
  pin          TEXT NOT NULL UNIQUE,
  ativo        INTEGER NOT NULL DEFAULT 1,
  papel        TEXT NOT NULL DEFAULT 'colaborador',
  hora_entrada TEXT NOT NULL DEFAULT '08:00',
  hora_saida   TEXT NOT NULL DEFAULT '18:00',
  almoco_min   INTEGER NOT NULL DEFAULT 60,
  cafe_min     INTEGER NOT NULL DEFAULT 15,
  salario      REAL NOT NULL DEFAULT 0,
  horas_mes    REAL NOT NULL DEFAULT 220
);

CREATE TABLE IF NOT EXISTS registros (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id     INTEGER NOT NULL,
  dia                TEXT NOT NULL,
  horario            TEXT NOT NULL,
  tipo               TEXT NOT NULL,
  foto               TEXT,
  abonado            INTEGER NOT NULL DEFAULT 0,
  compensar          INTEGER NOT NULL DEFAULT 0,
  motivo             TEXT,
  contestacao        TEXT,
  contestacao_status TEXT
);
CREATE INDEX IF NOT EXISTS idx_reg_func_dia ON registros (funcionario_id, dia);

CREATE TABLE IF NOT EXISTS justificativas (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  dia            TEXT NOT NULL,
  texto          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pendente'
);
CREATE INDEX IF NOT EXISTS idx_just_func_dia ON justificativas (funcionario_id, dia);

CREATE TABLE IF NOT EXISTS notificacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  horario        TEXT NOT NULL,
  mensagem       TEXT NOT NULL
);

-- Configurações gerais (chave/valor)
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
-- Código para liberar o aparelho da empresa a bater ponto (troque no painel)
INSERT OR IGNORE INTO config (chave, valor) VALUES ('aparelho_codigo', '4321');

-- Gestor inicial (troque o PIN depois no painel)
INSERT OR IGNORE INTO funcionarios (id, nome, pin, papel, ativo)
VALUES (1, 'Alex', '1000', 'gestor', 1);

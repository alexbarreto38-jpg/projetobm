// Carrega a lista de BMs/WABAs e o template a partir de arquivos.

import fs from 'node:fs';
import path from 'node:path';
import { parseCSV } from './csv.js';

// Cada BM é uma linha no CSV com, no mínimo:
//   name        -> apelido para logs (opcional)
//   token       -> access token com permissão no WABA
//   waba_id     -> WhatsApp Business Account ID (para templates)
//   phone_id    -> Phone Number ID (para envio de mensagens)
// Campos extras são ignorados.
export function loadBMs(filePath) {
  const abs = path.resolve(filePath);
  const text = fs.readFileSync(abs, 'utf8');
  const rows = parseCSV(text);

  const bms = [];
  const errors = [];
  rows.forEach((row, idx) => {
    const bm = {
      name: row.name || row.waba_id || `bm-${idx + 1}`,
      token: row.token,
      wabaId: row.waba_id,
      phoneId: row.phone_id,
    };
    if (!bm.token) {
      errors.push(`Linha ${idx + 2}: coluna "token" ausente`);
      return;
    }
    bms.push(bm);
  });

  if (bms.length === 0) {
    throw new Error(
      `Nenhuma BM válida em ${abs}. ${errors.join('; ') || 'Arquivo vazio?'}`
    );
  }
  if (errors.length) {
    errors.forEach((e) => console.warn(`AVISO: ${e}`));
  }
  return bms;
}

// Carrega a definição de um template (JSON no formato da Graph API).
export function loadTemplate(filePath) {
  const abs = path.resolve(filePath);
  const template = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!template.name) throw new Error('Template sem "name"');
  if (!template.language) throw new Error('Template sem "language"');
  if (!template.category) throw new Error('Template sem "category"');
  if (!Array.isArray(template.components)) {
    throw new Error('Template sem "components" (array)');
  }
  return template;
}

// Carrega destinatários de um CSV com, no mínimo, a coluna "phone".
// Colunas extras viram variáveis disponíveis para os componentes.
export function loadRecipients(filePath) {
  const abs = path.resolve(filePath);
  const text = fs.readFileSync(abs, 'utf8');
  const rows = parseCSV(text);
  const recipients = rows
    .map((r) => ({ phone: r.phone || r.telefone || r.to, vars: r }))
    .filter((r) => r.phone);
  if (recipients.length === 0) {
    throw new Error(`Nenhum destinatário válido em ${abs} (esperado coluna "phone")`);
  }
  return recipients;
}

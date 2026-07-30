// Parser e serializador CSV mínimos, sem dependências.
// Suporta aspas duplas, vírgulas dentro de campos e quebras de linha escapadas.

export function parseCSV(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else if (c === '\r') {
      // ignora CR; o LF cuida da quebra de linha
    } else {
      field += c;
    }
  }
  // último campo/linha, se o arquivo não terminar com \n
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // remove linhas totalmente vazias
  const cleaned = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (cleaned.length === 0) return [];

  const header = cleaned[0].map((h) => h.trim());
  return cleaned.slice(1).map((r) => {
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = (r[idx] ?? '').trim();
    });
    return obj;
  });
}

export function toCSV(records, columns) {
  if (records.length === 0) return (columns ?? []).join(',') + '\n';
  const cols = columns ?? Object.keys(records[0]);
  const escape = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [cols.join(',')];
  for (const rec of records) {
    lines.push(cols.map((c) => escape(rec[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

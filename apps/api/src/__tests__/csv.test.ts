import { describe, expect, it } from 'vitest';
import { CSV_BOM, toCsv } from '../lib/csv.js';

describe('toCsv', () => {
  it('gera cabeçalho + linhas com CRLF e BOM', () => {
    const csv = toCsv(['a', 'b'], [['1', '2']]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toBe(`${CSV_BOM}a,b\r\n1,2`);
  });

  it('escapa vírgulas, aspas e quebras de linha (RFC 4180)', () => {
    const csv = toCsv(['x'], [['a,b'], ['diz "oi"'], ['linha1\nlinha2']]);
    expect(csv).toContain('"a,b"');
    expect(csv).toContain('"diz ""oi"""');
    expect(csv).toContain('"linha1\nlinha2"');
  });

  it('neutraliza fórmulas (CSV injection)', () => {
    const csv = toCsv(['f'], [['=SUM(A1:A2)'], ['+1'], ['@cmd'], ['-2']]);
    expect(csv).toContain("'=SUM(A1:A2)");
    expect(csv).toContain("'+1");
    expect(csv).toContain("'@cmd");
    expect(csv).toContain("'-2");
  });

  it('trata null/undefined como célula vazia', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 0]])).toBe(`${CSV_BOM}a,b,c\r\n,,0`);
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, toCSV } from '../src/csv.js';
import { chunk, mapWithConcurrency } from '../src/batch.js';
import { buildComponents } from '../src/dispatch.js';

test('parseCSV lê cabeçalho e linhas', () => {
  const rows = parseCSV('name,token\nA,111\nB,222\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { name: 'A', token: '111' });
});

test('parseCSV respeita aspas com vírgula', () => {
  const rows = parseCSV('name,note\n"Loja, 1","oi, tudo bem"\n');
  assert.equal(rows[0].name, 'Loja, 1');
  assert.equal(rows[0].note, 'oi, tudo bem');
});

test('toCSV escapa campos com vírgula/aspas', () => {
  const csv = toCSV([{ a: 'x,y', b: 'a"b' }], ['a', 'b']);
  assert.match(csv, /"x,y"/);
  assert.match(csv, /"a""b"/);
});

test('chunk divide em lotes de 250', () => {
  const arr = Array.from({ length: 600 }, (_, i) => i);
  const c = chunk(arr, 250);
  assert.equal(c.length, 3);
  assert.equal(c[0].length, 250);
  assert.equal(c[2].length, 100);
});

test('mapWithConcurrency captura sucesso e erro sem rejeitar', async () => {
  const items = [1, 2, 3, 4];
  const res = await mapWithConcurrency(items, 2, async (n) => {
    if (n === 3) throw new Error('falhou 3');
    return n * 10;
  });
  assert.equal(res[0].value, 10);
  assert.equal(res[2].status, 'rejected');
  assert.match(res[2].reason.message, /falhou 3/);
});

test('buildComponents monta parâmetros do body em ordem', () => {
  const comp = buildComponents({ body1: 'Maria', body2: 'SP' });
  assert.deepEqual(comp, [
    { type: 'body', parameters: [
      { type: 'text', text: 'Maria' },
      { type: 'text', text: 'SP' },
    ] },
  ]);
});

test('buildComponents retorna undefined sem variáveis', () => {
  assert.equal(buildComponents({ phone: '5511' }), undefined);
});

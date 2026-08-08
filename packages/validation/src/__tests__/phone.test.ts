import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../phone.js';

describe('normalizePhone', () => {
  it('normaliza número BR nacional para E.164', () => {
    expect(normalizePhone('(11) 99000-0001', 'BR')).toBe('+5511990000001');
    expect(normalizePhone('11990000001', 'BR')).toBe('+5511990000001');
  });

  it('aceita número já em formato internacional', () => {
    expect(normalizePhone('+55 11 99000-0001')).toBe('+5511990000001');
  });

  it('retorna null para número inválido', () => {
    expect(normalizePhone('123', 'BR')).toBeNull();
    expect(normalizePhone('', 'BR')).toBeNull();
    expect(normalizePhone('abcdef', 'BR')).toBeNull();
  });

  it('normaliza número de outro país quando o country é informado', () => {
    expect(normalizePhone('(202) 555-0100', 'US')).toBe('+12025550100');
  });
});

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from '../jsonschema.js';

describe('zodToJsonSchema', () => {
  it('converte objeto com opcionais, enum, array e record', () => {
    const schema = z.object({
      name: z.string().describe('nome'),
      count: z.number(),
      kind: z.enum(['a', 'b']),
      tags: z.array(z.string()),
      mapping: z.record(z.string()),
      note: z.string().optional(),
      flag: z.boolean().default(false),
    });
    const js = zodToJsonSchema(schema);
    expect(js.type).toBe('object');
    expect(js.properties?.name?.description).toBe('nome');
    expect(js.properties?.kind?.enum).toEqual(['a', 'b']);
    expect(js.properties?.tags?.type).toBe('array');
    expect(js.properties?.tags?.items?.type).toBe('string');
    // required exclui optional e default.
    expect(js.required).toContain('name');
    expect(js.required).toContain('count');
    expect(js.required).not.toContain('note');
    expect(js.required).not.toContain('flag');
  });

  it('literal true vira boolean e nullable é tratado', () => {
    const schema = z.object({
      confirm: z.literal(true),
      when: z.string().datetime().nullable().optional(),
    });
    const js = zodToJsonSchema(schema);
    expect(js.properties?.confirm).toBeDefined();
    expect(js.required).not.toContain('when');
  });
});

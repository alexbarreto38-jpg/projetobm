import { z } from 'zod';

/**
 * Conversor mínimo Zod → JSON Schema, cobrindo apenas o subconjunto usado pelas
 * ferramentas do assistente (object/string/number/boolean/array/enum + optional/
 * nullable/default/describe). Evita mais uma dependência e mantém uma única
 * fonte de verdade: o schema Zod valida em runtime e descreve a ferramenta ao
 * modelo (spec §2, §26).
 */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  additionalProperties?: boolean | JsonSchema;
}

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = schema._def as { description?: string };
  const base = convert(schema);
  if (def.description && !base.description) base.description = def.description;
  return base;
}

function convert(schema: z.ZodTypeAny): JsonSchema {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return convert(schema._def.innerType as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
    return convert(schema._def.innerType as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema._def.shape() as Record<string, z.ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = withDescription(value, convert(value));
      if (!isOptional(value)) required.push(key);
    }
    const out: JsonSchema = { type: 'object', properties, additionalProperties: false };
    if (required.length > 0) out.required = required;
    return out;
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: convert(schema._def.type as z.ZodTypeAny) };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: [...(schema._def.values as string[])] };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodLiteral) {
    const value = schema._def.value as unknown;
    const t = typeof value;
    if (t === 'string') return { type: 'string', enum: [value as string] };
    if (t === 'number') return { type: 'number' };
    if (t === 'boolean') return { type: 'boolean' };
    return {};
  }
  if (schema instanceof z.ZodRecord) {
    return { type: 'object', additionalProperties: convert(schema._def.valueType as z.ZodTypeAny) };
  }
  // Fallback conservador: aceita qualquer coisa.
  return {};
}

function isOptional(schema: z.ZodTypeAny): boolean {
  return (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodDefault ||
    (schema instanceof z.ZodNullable && isOptional(schema._def.innerType as z.ZodTypeAny))
  );
}

function withDescription(schema: z.ZodTypeAny, out: JsonSchema): JsonSchema {
  const def = schema._def as { description?: string };
  if (def.description) out.description = def.description;
  return out;
}

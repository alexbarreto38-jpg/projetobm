/**
 * @wise/assistant — o "cérebro" conversacional do Módulo 1 (spec §1, §2, §25).
 *
 * Interpreta pedidos em linguagem natural e os transforma em ações reais por
 * meio de ferramentas expostas pelo backend, com uma máquina de estados de
 * campanha, guardrails de permissão/limites e confirmação obrigatória para
 * operações sensíveis. O pacote é desacoplado de Prisma e do provedor de LLM:
 * a API fia as implementações reais.
 */
export * from './states.js';
export * from './session.js';
export * from './ids.js';
export * from './policy.js';
export * from './result.js';
export * from './render.js';
export * from './backend.js';
export * from './tools.js';
export * from './dispatcher.js';
export * from './jsonschema.js';
export * from './llm.js';
export * from './systemPrompt.js';
export * from './orchestrator.js';
export * from './transcription.js';
export * from './anthropic.js';

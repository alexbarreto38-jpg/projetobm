import type { JsonSchema } from './jsonschema.js';

/**
 * Interface de LLM agnóstica de provedor. O orquestrador depende apenas disto
 * (spec §25): em produção usa-se o adaptador Anthropic (`anthropic.ts`); em
 * testes, um fake determinístico. Os blocos espelham o formato de "tool use"
 * para manter o adaptador fino.
 */
export interface LlmToolDef {
  name: string;
  description: string;
  input_schema: JsonSchema;
}

export interface TextBlock {
  type: 'text';
  text: string;
}
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}
export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface LlmRequest {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDef[];
}

export interface LlmResponse {
  content: (TextBlock | ToolUseBlock)[];
  stopReason: string; // 'end_turn' | 'tool_use' | 'max_tokens' | ...
}

export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
}

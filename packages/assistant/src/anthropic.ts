import type {
  LlmClient,
  LlmMessage,
  LlmRequest,
  LlmResponse,
  TextBlock,
  ToolUseBlock,
} from './llm.js';

/**
 * Adaptador do LlmClient para a API de Mensagens da Anthropic (spec §25). Usa
 * `fetch` (Node ≥ 18) para não acrescentar dependência de SDK e manter o pacote
 * do assistente leve. A chave de API vive só no backend (nunca no frontend).
 */
export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

export class AnthropicClient implements LlmClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'claude-sonnet-5';
    this.maxTokens = config.maxTokens ?? 2048;
    this.baseUrl = (config.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const body = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: req.system,
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      })),
      messages: req.messages.map(toAnthropicMessage),
    };

    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      content: AnthropicContentBlock[];
      stop_reason: string;
    };

    const content = json.content
      .map((b): TextBlock | ToolUseBlock | null => {
        if (b.type === 'text' && typeof b.text === 'string') {
          return { type: 'text', text: b.text };
        }
        if (b.type === 'tool_use' && b.id && b.name) {
          return { type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} };
        }
        return null;
      })
      .filter((b): b is TextBlock | ToolUseBlock => b !== null);

    return { content, stopReason: json.stop_reason };
  }
}

function toAnthropicMessage(message: LlmMessage): { role: string; content: unknown } {
  return { role: message.role, content: message.content };
}

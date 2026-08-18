import { z } from 'zod';
import { fail, type ToolResult } from './result.js';
import {
  ToolPreconditionError,
  TOOLS_BY_NAME,
  type ToolDefinition,
  type ToolExecContext,
  type ToolExecResult,
} from './tools.js';

/**
 * Dispatcher de ferramentas. É a "camada de regras e permissões" (spec §2, §19):
 * antes de executar qualquer ferramenta, valida a permissão do usuário e o
 * formato dos argumentos. A IA nunca contorna isto — um usuário sem autorização
 * não envia "mesmo assim" (spec §19). Erros técnicos são traduzidos, nunca
 * escondidos (spec §22).
 */
export interface DispatchOutput {
  toolName: string;
  result: ToolResult;
  draft?: ToolExecResult['draft'];
}

export async function dispatchTool(
  exec: ToolExecContext,
  toolName: string,
  rawInput: unknown,
): Promise<DispatchOutput> {
  const tool = TOOLS_BY_NAME.get(toolName) as ToolDefinition<unknown> | undefined;
  if (!tool) {
    return { toolName, result: fail(`Ferramenta desconhecida: ${toolName}.`, 'UNKNOWN_TOOL') };
  }

  // 1) Permissão (spec §19). Registrada na auditoria quando negada.
  if (!exec.ctx.hasPermission(tool.requiredPermission)) {
    await safeAudit(exec, {
      action: 'ASSISTANT_TOOL_DENIED',
      metadata: { tool: toolName, requiredPermission: tool.requiredPermission },
    });
    return {
      toolName,
      result: fail(
        `Você não tem permissão para "${toolName}" (requer ${tool.requiredPermission}). Não é possível prosseguir mesmo com insistência.`,
        'PERMISSION_DENIED',
      ),
    };
  }

  // 2) Validação de argumentos.
  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      toolName,
      result: fail(
        `Argumentos inválidos para ${toolName}: ${formatZodError(parsed.error)}.`,
        'INVALID_ARGUMENTS',
      ),
    };
  }

  // 3) Execução com tradução de erros (spec §22).
  try {
    const out = await tool.execute(exec, parsed.data);
    return { toolName, result: out.result, draft: out.draft };
  } catch (error) {
    if (error instanceof ToolPreconditionError) {
      return { toolName, result: fail(error.message, 'PRECONDITION_FAILED') };
    }
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    return {
      toolName,
      result: fail(`Não consegui concluir "${toolName}": ${message}`, 'BACKEND_ERROR'),
    };
  }
}

async function safeAudit(exec: ToolExecContext, entry: Parameters<typeof exec.backend.audit>[1]) {
  try {
    await exec.backend.audit(exec.ctx, entry);
  } catch {
    // Auditoria é best-effort; nunca deve derrubar o fluxo do usuário.
  }
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`)
    .join('; ');
}

/**
 * Renderiza o corpo de um template substituindo `{{n}}` pelo valor da coluna
 * mapeada, usando uma linha de exemplo (spec §10, §13). Placeholders sem
 * mapeamento/valor ficam explícitos como `[{{n}}]` para que a prévia não
 * esconda que algo está faltando (spec §24 — nunca inventar).
 */
export function renderTemplateSample(
  body: string,
  variableMapping: Record<string, string>,
  sampleRow: Record<string, string> | undefined,
): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    const column = variableMapping[key];
    if (column && sampleRow && sampleRow[column] !== undefined) {
      return sampleRow[column];
    }
    return `[{{${key}}}]`;
  });
}

/** Variáveis do template ainda sem mapeamento (spec §10). */
export function unmappedVariables(
  variables: string[],
  mapping: Record<string, string>,
): string[] {
  return variables.filter((v) => !mapping[v]);
}

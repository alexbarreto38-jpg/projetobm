import type { PrismaClient } from '@wise/database';

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // remove diacríticos combinados (acentos)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'org'
  );
}

/** Garante unicidade do slug adicionando sufixo numérico quando necessário. */
export async function uniqueSlug(prisma: PrismaClient, base: string): Promise<string> {
  let candidate = base;
  let n = 1;
  // Limite defensivo para evitar loop infinito.
  while (n < 1000) {
    const exists = await prisma.organization.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

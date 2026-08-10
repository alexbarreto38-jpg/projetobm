'use client';

import { useCallback, useState, useTransition } from 'react';

interface Page<T> {
  items: T[];
  nextCursor?: string | null;
}

/**
 * Paginação incremental "Carregar mais" no cliente. Alternativa à paginação por
 * URL: acumula itens em memória chamando um Server Action que devolve a próxima
 * página. Genérico e reutilizável por qualquer lista com cursor.
 */
export function useLoadMore<T>(
  initialItems: T[],
  initialCursor: string | null | undefined,
  fetchPage: (cursor: string) => Promise<Page<T>>,
) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor ?? null);
  const [pending, startTransition] = useTransition();

  const loadMore = useCallback(() => {
    if (!cursor) return;
    const current = cursor;
    startTransition(async () => {
      const page = await fetchPage(current);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor ?? null);
    });
  }, [cursor, fetchPage]);

  return { items, hasMore: cursor !== null, pending, loadMore };
}

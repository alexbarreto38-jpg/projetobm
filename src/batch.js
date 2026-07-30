// Utilitários de lote e concorrência.

// Divide um array em pedaços de tamanho `size`.
export function chunk(arr, size) {
  if (size <= 0) throw new Error('chunk size deve ser > 0');
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// Executa `worker(item, index)` sobre `items` com no máximo `concurrency`
// tarefas simultâneas. Nunca rejeita: cada resultado vem como
// { status: 'fulfilled', value } ou { status: 'rejected', reason }.
export async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        const value = await worker(items[i], i);
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, runner));
  return results;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

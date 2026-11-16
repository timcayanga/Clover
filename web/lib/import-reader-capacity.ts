// Each process owns its reader slots. The reserved slot is handed directly
// to the next waiter so a new caller cannot overtake the queue.
export function createImportReaderCapacity(limit: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(work: (waitMs: number) => Promise<T>): Promise<T> {
    const queuedAt = performance.now();
    if (active < limit) active++;
    else await new Promise<void>(resolve => waiting.push(resolve));
    try {
      return await work(performance.now() - queuedAt);
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

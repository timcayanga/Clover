/** Snapshot the successfully decoded logos together. Late requests never swap a visible tile. */
export async function loadFinverseBankLogos<T>(
  urls: readonly string[],
  load: (url: string) => Promise<T>,
  timeoutMs = 2500,
): Promise<ReadonlyMap<string, T>> {
  const loaded = new Map<string, T>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); });
  const batch = Promise.all([...new Set(urls)].map(async (url) => {
    try {
      loaded.set(url, await load(url));
    } catch {
      // A failed image uses the same fallback as a timed-out image.
    }
  }));
  try {
    await Promise.race([batch, timeout]);
    return new Map(loaded);
  } finally {
    clearTimeout(timer);
  }
}

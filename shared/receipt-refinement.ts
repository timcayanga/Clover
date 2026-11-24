// A completed draft can be available even if the original response is delayed.
export async function finishReceiptRead<T extends {refining?: boolean}>(
  refine: (signal: AbortSignal) => Promise<T>,
  readStatus: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  intervalMs = 15000,
): Promise<T> {
  const requests = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => { clearTimeout(timer); requests.abort(); };
  signal.addEventListener("abort", abort);
  if (signal.aborted) abort();
  try {
    const cached = new Promise<T>(resolve => {
      const check = async () => {
        if (requests.signal.aborted) return;
        const draft = await readStatus(requests.signal).catch(() => null);
        if (draft && !draft.refining) resolve(draft);
        else if (!requests.signal.aborted) timer = setTimeout(check, intervalMs);
      };
      timer = setTimeout(check, intervalMs);
    });
    const original = refine(requests.signal).catch(async error => {
      if (!requests.signal.aborted) {
        const draft = await readStatus(requests.signal).catch(() => null);
        if (draft && !draft.refining) return draft;
      }
      throw error;
    });
    return await Promise.race([original,cached]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    abort();
  }
}

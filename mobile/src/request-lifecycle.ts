/** A canceled view/request is not a lost session or an offline network failure. */
export class RequestCancelledError extends Error {
  reason: "app_background" | "session_closed" | "user_abort";
  constructor(reason: "app_background" | "session_closed" | "user_abort" = "user_abort") {
    super("Request canceled."); this.reason = reason; this.name = "AbortError";
  }
}
export class RequestTimeoutError extends Error {
  constructor() { super("The connection timed out. Check your connection and try again."); }
}
/** Abort must settle even if a native fetch or response body ignores its signal. */
export async function boundedRequest<T>(work: (signal: AbortSignal) => Promise<T>, options: { signal?: AbortSignal | null; timeoutMs: number }): Promise<T> {
  const controller = new AbortController();
  let rejectAbort!: (error: Error) => void;
  const cancelled = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const abort = () => {
    controller.abort();
    rejectAbort(options.signal?.reason instanceof RequestCancelledError ? options.signal.reason : new RequestCancelledError());
  };
  const timer = setTimeout(() => { controller.abort(); rejectAbort(new RequestTimeoutError()); }, options.timeoutMs);
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    if (options.signal?.aborted) abort();
    return await Promise.race([cancelled, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new RequestCancelledError();
      return work(controller.signal);
    })]);
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}

/** Per signed-in Session only. No data survives a user switch. */
export class BootstrapRequests {
  private pending: Promise<unknown> | null = null;
  private controller: AbortController | null = null;
  read<T>(load: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.pending) return this.pending as Promise<T>;
    const controller = new AbortController(); this.controller = controller;
    const task = Promise.resolve().then(() => load(controller.signal)).finally(() => {
      if (this.pending === task) { this.pending = null; this.controller = null; }
    });
    this.pending = task; return task;
  }
  cancel(reason: RequestCancelledError["reason"]) {
    this.controller?.abort(new RequestCancelledError(reason));
    this.pending = null; this.controller = null;
  }
}

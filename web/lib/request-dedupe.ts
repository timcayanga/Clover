type JsonValue = unknown;

type FetchJsonOnceParams = {
  key: string;
  route: string;
  workspaceId?: string | null;
  input: RequestInfo | URL;
  init?: RequestInit;
  detail?: string | null;
  timeoutMs?: number | null;
  cacheTtlMs?: number | null;
};

type FetchJsonOnceResult<T> = {
  ok: boolean;
  status: number;
  json: T | null;
};

type RequestBreadcrumb = {
  route: string;
  key: string;
  workspaceId: string | null;
  detail: string | null;
  stage: "start" | "deduped" | "done" | "error";
  status: number | null;
  at: number;
};

declare global {
  interface Window {
    __cloverRequestDebug?: RequestBreadcrumb[];
  }
}

const inFlightJsonRequests = new Map<string, Promise<FetchJsonOnceResult<JsonValue>>>();
const resolvedJsonRequests = new Map<string, { expiresAt: number; value: FetchJsonOnceResult<JsonValue> }>();
const RESOLVED_JSON_REQUEST_CACHE_LIMIT = 64;

const pruneResolvedJsonRequestCache = (now = Date.now()) => {
  for (const [key, entry] of resolvedJsonRequests) {
    if (entry.expiresAt <= now) resolvedJsonRequests.delete(key);
  }

  while (resolvedJsonRequests.size >= RESOLVED_JSON_REQUEST_CACHE_LIMIT) {
    const oldestKey = resolvedJsonRequests.keys().next().value as string | undefined;
    if (!oldestKey) break;
    resolvedJsonRequests.delete(oldestKey);
  }
};

export const clearJsonRequestCache = (keyPrefix?: string) => {
  if (!keyPrefix) {
    resolvedJsonRequests.clear();
    return;
  }

  for (const key of resolvedJsonRequests.keys()) {
    if (key.startsWith(keyPrefix)) resolvedJsonRequests.delete(key);
  }
};

const pushBreadcrumb = (breadcrumb: RequestBreadcrumb) => {
  if (typeof window === "undefined") {
    return;
  }

  const nextLog = [...(window.__cloverRequestDebug ?? []), breadcrumb].slice(-200);
  window.__cloverRequestDebug = nextLog;
};

export const fetchJsonOnce = async <T>(params: FetchJsonOnceParams): Promise<FetchJsonOnceResult<T>> => {
  const cached = resolvedJsonRequests.get(params.key);
  if (cached && cached.expiresAt > Date.now()) {
    // Refresh insertion order so the bounded map behaves like a small LRU.
    resolvedJsonRequests.delete(params.key);
    resolvedJsonRequests.set(params.key, cached);
    return cached.value as FetchJsonOnceResult<T>;
  }
  if (cached) resolvedJsonRequests.delete(params.key);

  const existing = inFlightJsonRequests.get(params.key);
  if (existing) {
    pushBreadcrumb({
      route: params.route,
      key: params.key,
      workspaceId: params.workspaceId ?? null,
      detail: params.detail ?? null,
      stage: "deduped",
      status: null,
      at: Date.now(),
    });
    if (params.timeoutMs && params.timeoutMs > 0) {
      return Promise.race([
        existing as Promise<FetchJsonOnceResult<T>>,
        new Promise<FetchJsonOnceResult<T>>((_, reject) => {
          setTimeout(() => reject(new Error(`Timed out loading ${params.route}`)), params.timeoutMs ?? 0);
        }),
      ]);
    }
    return existing as Promise<FetchJsonOnceResult<T>>;
  }

  const promise = (async (): Promise<FetchJsonOnceResult<T>> => {
    pushBreadcrumb({
      route: params.route,
      key: params.key,
      workspaceId: params.workspaceId ?? null,
      detail: params.detail ?? null,
      stage: "start",
      status: null,
      at: Date.now(),
    });

    const controller = params.timeoutMs && params.timeoutMs > 0 ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => {
          controller.abort();
        }, params.timeoutMs ?? 0)
      : null;

    try {
      const response = await fetch(params.input, {
        cache: "no-store",
        ...params.init,
        signal: controller?.signal ?? params.init?.signal,
      });
      const json = (await response.json().catch(() => null)) as T | null;
      pushBreadcrumb({
        route: params.route,
        key: params.key,
        workspaceId: params.workspaceId ?? null,
        detail: params.detail ?? null,
        stage: "done",
        status: response.status,
        at: Date.now(),
      });
      const result = {
        ok: response.ok,
        status: response.status,
        json,
      };
      if (response.ok && params.cacheTtlMs && params.cacheTtlMs > 0) {
        pruneResolvedJsonRequestCache();
        resolvedJsonRequests.set(params.key, {
          expiresAt: Date.now() + params.cacheTtlMs,
          value: result,
        });
      }
      return result;
    } catch {
      pushBreadcrumb({
        route: params.route,
        key: params.key,
        workspaceId: params.workspaceId ?? null,
        detail: params.detail ?? null,
        stage: "error",
        status: null,
        at: Date.now(),
      });
      throw new Error(`Unable to load ${params.route}`);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      inFlightJsonRequests.delete(params.key);
    }
  })();

  inFlightJsonRequests.set(params.key, promise as Promise<FetchJsonOnceResult<JsonValue>>);
  return promise;
};

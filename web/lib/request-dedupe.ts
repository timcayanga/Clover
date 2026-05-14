type JsonValue = unknown;

type FetchJsonOnceParams = {
  key: string;
  route: string;
  workspaceId?: string | null;
  input: RequestInfo | URL;
  init?: RequestInit;
  detail?: string | null;
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

const pushBreadcrumb = (breadcrumb: RequestBreadcrumb) => {
  if (typeof window === "undefined") {
    return;
  }

  const nextLog = [...(window.__cloverRequestDebug ?? []), breadcrumb].slice(-200);
  window.__cloverRequestDebug = nextLog;
};

export const fetchJsonOnce = async <T>(params: FetchJsonOnceParams): Promise<FetchJsonOnceResult<T>> => {
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

    try {
      const response = await fetch(params.input, {
        cache: "no-store",
        ...params.init,
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
      return {
        ok: response.ok,
        status: response.status,
        json,
      };
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
      inFlightJsonRequests.delete(params.key);
    }
  })();

  inFlightJsonRequests.set(params.key, promise as Promise<FetchJsonOnceResult<JsonValue>>);
  return promise;
};

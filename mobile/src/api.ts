import { apiBase } from "./api-base";
export { apiBase } from "./api-base";
import { beginTelemetry, requestTelemetry, telemetry, newTelemetryId, getTelemetryHeaders } from "../../shared/analytics";
export class NetworkError extends Error {}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: { current?: Record<string, unknown> },
  ) {
    super(message);
  }
}
export async function apiRequest<T>(
  token: string,
  path: string,
  options: RequestInit = {},
  format: "json" | "text" = "json",
): Promise<T> {
  const operation_id = newTelemetryId();
  const started = Date.now();
  const description = requestTelemetry(path, options.method);
  const finish = description ? beginTelemetry((options.method ?? "GET").toUpperCase() === "GET" ? "data_load" : "flow", { ...description, operation_id }) : () => {};
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, {once:true});
  const timer = setTimeout(
    () => controller.abort(),
    path.includes("/process") || path.startsWith("finverse/") || path.startsWith("uploads/") ||
      path.startsWith("split-bill-receipts/") ||
      path.startsWith("adviser/chat")
      ? 120000
      : 25000,
  );
  try {
    const url = new URL(`${apiBase()}/api/mobile/v1/${path}`);
    if (!url.pathname.startsWith("/api/mobile/v1/"))
      throw new Error("Invalid mobile API path.");
    const headers = new Headers(options.headers);
    for (const [key, value] of Object.entries(getTelemetryHeaders())) headers.set(key, value);
    headers.set("x-clover-operation-id", operation_id);
    headers.set("Authorization", `Bearer ${token}`);
    if (typeof options.body === "string")
      headers.set("Content-Type", "application/json");
    const response = await fetch(url.toString(), {
      ...options,
      headers,
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    }).catch((e: Error) => {
      throw new NetworkError(e.message || "Connection unavailable.");
    });
    if (response.ok && format === "text") {
      if (!response.headers.get("content-type")?.includes("text/csv"))
        throw new Error("Unexpected export format.");
      const text = await response.text();
      finish("completed", { status: response.status });
      return text as T;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        data?.error ?? "Clover could not complete the request.",
        response.status,
        data,
      );
    if (!data)
      throw new Error("Clover returned an unexpected response. Please retry.");
    finish("completed", { status: response.status });
    if (description && (options.method ?? "GET").toUpperCase() === "GET") telemetry("data_ready", { ...description, duration_ms: Date.now() - started, timing_boundary: "response_body_consumed" });
    return data as T;
  } catch (error) {
    finish(options.signal?.aborted ? "canceled" : "failed", { status: error instanceof ApiError ? error.status : 0, reason: options.signal?.aborted ? "user_abort" : controller.signal.aborted ? "timeout" : error instanceof ApiError ? "http" : "network_or_response" });
    if (controller.signal.aborted)
      throw new NetworkError(
        path.includes("/process")
          ? "The connection timed out. Check the import status before trying the upload again."
          : "The connection timed out. Check your connection and try again.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}

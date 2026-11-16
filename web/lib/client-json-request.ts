"use client";
import { beginTelemetry, safeRoute } from "../../shared/analytics";

export class ClientJsonRequestError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ClientJsonRequestError";
    this.status = status;
  }
}

export const postJsonWithXhr = <TResponse>(
  url: string,
  payload: unknown,
  options?: { timeoutMs?: number }
) =>
  new Promise<TResponse>((resolve, reject) => {
    const finish = beginTelemetry("flow", { operation: `POST ${safeRoute(url)}`, phase: "request", timing_boundary: "response_body" });
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.withCredentials = true;
    request.timeout = options?.timeoutMs ?? 15_000;
    request.setRequestHeader("Content-Type", "application/json");

    request.onload = () => {
      let responsePayload: (TResponse & { error?: string }) | null = null;
      try {
        responsePayload = request.responseText
          ? JSON.parse(request.responseText) as TResponse & { error?: string }
          : null;
      } catch {
        responsePayload = null;
      }

      finish(request.status >= 200 && request.status < 300 ? "completed" : "failed", { status: request.status });
      if (request.status < 200 || request.status >= 300) {
        reject(new ClientJsonRequestError(responsePayload?.error || "Request failed", request.status));
        return;
      }

      resolve((responsePayload ?? {}) as TResponse);
    };
    request.onerror = () => { finish("failed", { reason: "network" }); reject(new ClientJsonRequestError("The connection was interrupted.")); };
    request.ontimeout = () => { finish("failed", { reason: "timeout" }); reject(new ClientJsonRequestError("The request took too long. Please try again.")); };
    request.onabort = () => { finish("canceled"); reject(new ClientJsonRequestError("The request was cancelled.")); };
    request.send(JSON.stringify(payload));
  });

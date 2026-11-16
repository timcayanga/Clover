"use client";
import { beginTelemetry, newTelemetryId, requestTelemetry, safeRoute, setTelemetrySink, telemetry, type TelemetrySink } from "../../shared/analytics";
/** Observe only Clover requests; never inspect bodies, query values or response data. */
export function installBrowserTelemetry(sink: TelemetrySink) {
  setTelemetrySink(sink);
  const original = window.fetch;
  const wrapped: typeof fetch = async (input, init) => {
    let details: ReturnType<typeof requestTelemetry> = null;
    try {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      if (url.origin === window.location.origin && url.pathname.startsWith("/api/"))
        details = requestTelemetry(url.pathname, init?.method ?? (input instanceof Request ? input.method : "GET"));
    } catch { /* Preserve fetch's own validation. */ }
    if (!details) return original(input, init);
    const operation_id = newTelemetryId();
    const started = performance.now();
    const finish = beginTelemetry(details.method === "GET" ? "data_load" : "flow", { ...details, operation_id, route: safeRoute(window.location.pathname), timing_boundary: "response_headers" });
    try {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("x-clover-operation-id", operation_id);
      const response = await original(input, { ...init, headers });
      finish(response.ok ? "completed" : "failed", { status: response.status });
      if (details.method === "GET" && response.ok) {
        for (const method of ["json", "text"] as const) {
          const consume = response[method].bind(response);
          response[method] = async () => {
            const data = await consume();
            telemetry("data_ready", { ...details, operation_id, route: safeRoute(window.location.pathname), duration_ms: Math.round(performance.now() - started), timing_boundary: "response_body_consumed" });
            return data;
          };
        }
      }
      return response;
    } catch (error) {
      const canceled = error instanceof Error && error.name === "AbortError";
      finish(canceled ? "canceled" : "failed", { reason: canceled ? "aborted" : "network" });
      throw error;
    }
  };
  window.fetch = wrapped;
  const dialogs = new Map<Element, string>();
  const inspect = () => {
    for (const [dialog, route] of dialogs) if (!dialog.isConnected || !dialog.getClientRects().length) {
      telemetry("form_closed", { route, phase: "dialog", outcome: "closed", completion_inferred: false });
      dialogs.delete(dialog);
    }
    for (const dialog of document.querySelectorAll("dialog[open],[role='dialog']")) {
      if (!dialogs.has(dialog) && dialog.getClientRects().length) {
        const route = safeRoute(window.location.pathname);
        dialogs.set(dialog, route);
        telemetry("form_opened", { route, phase: "dialog" });
      }
    }
  };
  const pickerFlows = new Map<HTMLInputElement, ReturnType<typeof beginTelemetry>>();
  const onInput = (event: Event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
    if (event.type === "click") {
      pickerFlows.get(input)?.("canceled", { reason: "reopened" });
      pickerFlows.set(input, beginTelemetry("input", { input_method: input.capture ? "camera" : "file", route: safeRoute(window.location.pathname) }));
    } else {
      pickerFlows.get(input)?.(event.type === "cancel" || !input.files?.length ? "canceled" : "completed");
      pickerFlows.delete(input);
    }
  };
  for (const event of ["click", "change", "cancel"]) document.addEventListener(event, onInput, true);
  let scheduled = false;
  const observer = new MutationObserver(records => {
    const selector = "dialog,[role=dialog]";
    const relevant = records.some(record => record.type === "attributes" ? record.target instanceof Element && record.target.matches(selector) : [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element && (node.matches(selector) || node.querySelector(selector))));
    if (!relevant) return;
    if (!scheduled) { scheduled = true; queueMicrotask(() => { scheduled = false; inspect(); }); } });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "hidden", "aria-hidden"] });
  inspect();
  return () => { if (window.fetch === wrapped) window.fetch = original; observer.disconnect(); for (const event of ["click", "change", "cancel"]) document.removeEventListener(event, onInput, true); pickerFlows.clear(); dialogs.clear(); setTelemetrySink(() => {}); };
}

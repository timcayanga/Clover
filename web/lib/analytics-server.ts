import { headers } from "next/headers";
import { after } from "next/server";
import { browserContext } from "../../shared/analytics";
import { capturePostHogServerEvent as capture, type AnalyticsEventName, type AnalyticsProperties } from "./analytics";
export async function capturePostHogServerEvent(event: AnalyticsEventName, distinctId: string, properties: AnalyticsProperties = {}) {
  let context: AnalyticsProperties = { event_source: "server", platform: "server" };
  try {
    const h = await headers();
    const operationId = h.get("x-clover-operation-id");
    if (operationId && /^[a-z0-9-]{8,80}$/.test(operationId)) context.operation_id = operationId;
    const platform = h.get("x-clover-platform");
    const browser = browserContext(h.get("user-agent") ?? "");
    if (browser.browser !== "unknown") context = { ...context, ...browser };
    if (platform === "ios" || platform === "android") {
      context.platform = platform;
      context.os = platform === "ios" ? "iOS" : "Android";
      context.browser = null;
      for (const field of ["device-type", "device-model", "os-version", "app-version", "app-build"])
        context[field.replaceAll("-", "_")] = h.get(`x-clover-${field}`)?.slice(0, 80) ?? null;
    }
  } catch { /* Workers have no request; keep explicit server attribution. */ }
  const send = () => capture(event, distinctId, { ...context, ...properties });
  try { after(send); } catch { await send(); }
}

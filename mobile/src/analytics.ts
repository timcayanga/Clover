import { normalizePlanAnalytics } from "../../shared/plan-analytics";
import PostHog from "posthog-react-native";
import * as Application from "expo-application";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiBase } from "./api-base";
import { setTelemetrySink, setTelemetryHeaderProvider, clearPendingTelemetry, type TelemetryProperties } from "../../shared/analytics";
let client: PostHog | undefined;
let desiredUser: string | null = null;
let identifiedUser: string | null = null;
let environment = "local";
let epoch: TelemetryProperties = {};
let planProperties: TelemetryProperties = {};
export function updateNativePlanAnalytics(properties: TelemetryProperties) {
  planProperties = properties;
  if (client && identifiedUser) client.identify(`${environment}:${identifiedUser}`, compact(properties));
}
let initializing: Promise<boolean> | undefined;
export function deviceContext(): TelemetryProperties {
  return {
    platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "mobile_web",
    device_type: Device.deviceType === Device.DeviceType.TABLET ? "tablet" : "mobile",
    device_model: Device.modelName ?? "unknown",
    os: Device.osName ?? Platform.OS,
    os_version: Device.osVersion ?? String(Platform.Version ?? "unknown"),
    app_version: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "unknown",
    app_build: Application.nativeBuildVersion ?? "development",
    is_simulator: !Device.isDevice,
  };
}
export function analyticsHeaders() {
  const context = deviceContext();
  return Object.fromEntries(Object.entries(context).filter(([key]) => ["platform", "device_type", "device_model", "os_version", "app_version", "app_build"].includes(key)).map(([key, value]) => [`x-clover-${key.replaceAll("_", "-")}`, String(value).replace(/[^\x20-\x7e]/g, "").slice(0, 80)]));
}
setTelemetryHeaderProvider(analyticsHeaders);
function compact(properties: TelemetryProperties) { return Object.fromEntries(Object.entries(properties).filter((entry): entry is [string, string | number | boolean | null] => entry[1] !== undefined)); }
export function identifyNativeAnalytics(userId: string | null) {
  if (desiredUser && desiredUser !== userId && !client) clearPendingTelemetry();
  if (desiredUser !== userId) planProperties = {};
  desiredUser = userId;
  if (!client || identifiedUser === userId) return;
  try {
    // Queued events keep the identity captured at creation; reset prevents cross-account attribution.
    if (identifiedUser) client.reset();
    if (userId) client.identify(`${environment}:${userId}`, compact(planProperties));
    identifiedUser = userId;
  } catch { /* Non-blocking. */ }
}
export function flushNativeAnalytics() { void client?.flush().catch(() => {}); }
export async function initializeNativeAnalytics() {
  if (client) return true;
  if (initializing) return initializing;
  initializing = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${apiBase()}/api/analytics/config`, { signal: controller.signal });
      if (!response.ok) return false;
      const config = await response.json();
      if (typeof config.key !== "string" || !config.key || typeof config.host !== "string" || !config.host.startsWith("https://")) return false;
      environment = ["production", "staging", "local"].includes(config.environment) ? config.environment : "local";
      epoch = Object.fromEntries(["analytics_epoch", "release_stage", "beta_started_at"].filter(key => typeof config.epoch?.[key] === "string").map(key => [key, config.epoch[key]]));
      const candidate = new PostHog(config.key, {
        host: config.host,
        persistence: Platform.OS === "web" ? "memory" : "file",
        captureAppLifecycleEvents: false,
        enableSessionReplay: false,
        preloadFeatureFlags: false,
        disableRemoteFeatureFlags: true,
        flushAt: 20,
        flushInterval: 15000,
        maxQueueSize: 500,
        before_send: event => {
          // Drop URLs/deep links and device names; models/versions are sufficient.
          if (!event?.properties) return event;
          for (const key of ["url", "$current_url", "$referrer", "$device_name", "$initial_url"]) delete event.properties[key];
          return event;
        },
      });
      await candidate.ready();
      candidate.reset();
      client = candidate;
      identifiedUser = null;
      client.register({ ...epoch, ...deviceContext(), analytics_environment: environment, event_source: "native", analytics_schema_version: 2 });
      identifyNativeAnalytics(desiredUser);
      setTelemetrySink((event, properties) => client?.capture(event, compact({ ...epoch, ...deviceContext(), analytics_environment: environment, event_source: "native", analytics_schema_version: 2, ...planProperties, ...normalizePlanAnalytics(properties) })));
      client.capture("session_started", compact(deviceContext()));
      return true;
    } catch { return false; }
    finally { clearTimeout(timer); initializing = undefined; }
  })();
  return initializing;
}

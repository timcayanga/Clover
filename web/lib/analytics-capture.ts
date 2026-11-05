// Also supports standalone Node workers and regression scripts outside Next's RSC loader.
if (typeof window !== "undefined") throw new Error("Server analytics cannot run in a browser.");
import { PostHog } from "posthog-node";
import { normalizePlanAnalytics } from "../../shared/plan-analytics";
import { getPostHogConfig, getAnalyticsEnvironment, getAnalyticsEpochProperties, scopeAnalyticsDistinctId, type AnalyticsEventName, type AnalyticsProperties } from "./analytics";

/** Official server SDK supplies truthful library provenance; never impersonate a browser UA. */
export async function capturePostHogServerEvent(event: AnalyticsEventName, distinctId: string, properties: AnalyticsProperties = {}) {
  const { key, host } = getPostHogConfig();
  if (!key) return;
  const client = new PostHog(key, { host, flushInterval: 0, fetchRetryCount: 0, requestTimeout: 5000, disableGeoip: true, disableRemoteFeatureFlags: true });
  const normalized = normalizePlanAnalytics(properties);
  const { analytics_audience, analytics_excluded, analytics_audience_version, ...planPersonProperties } = normalized;
  const knownAudience = typeof analytics_excluded === "boolean" && analytics_audience !== "unknown"
    ? { analytics_audience, analytics_excluded, analytics_audience_version } : {};
  let failed = false;
  client.on("error", () => { failed = true; });
  try {
    await client.captureImmediate({
      event, distinctId: scopeAnalyticsDistinctId(distinctId),
      properties: {
        ...getAnalyticsEpochProperties(), ...normalized,
        analytics_environment: getAnalyticsEnvironment(), event_source: "server", analytics_transport: "posthog_node", analytics_schema_version: 3,
        $set: { ...(event === "plan_changed" ? planPersonProperties : {}), ...knownAudience },
      },
    });
  } catch { failed = true; }
  finally {
    await client.shutdown(1000).catch(() => { failed = true; });
    if (failed) console.warn("[analytics] delivery_failed", { event });
  }
}

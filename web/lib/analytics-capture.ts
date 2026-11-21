// Also supports standalone Node workers and regression scripts outside Next's RSC loader.
if (typeof window !== "undefined") throw new Error("Server analytics cannot run in a browser.");
import { createHash } from "node:crypto";
import { PostHog } from "posthog-node";
import { normalizePlanAnalytics } from "../../shared/plan-analytics";
import { getPostHogConfig, getAnalyticsEnvironment, getAnalyticsEpochProperties, scopeAnalyticsDistinctId, type AnalyticsEventName, type AnalyticsProperties } from "./analytics";

/** Official server SDK supplies truthful library provenance; never impersonate a browser UA. */
export async function capturePostHogServerEvent(event: AnalyticsEventName, distinctId: string, properties: AnalyticsProperties = {}, timestamp?: Date) {
  const { key, host } = getPostHogConfig();
  if (!key) return false;
  const client = new PostHog(key, { host, flushInterval: 0, fetchRetryCount: 0, requestTimeout: 5000, disableGeoip: true, disableRemoteFeatureFlags: true });
  const normalized = normalizePlanAnalytics(properties);
  const { analytics_audience, analytics_excluded, analytics_audience_version, ...planPersonProperties } = normalized;
  const knownAudience = typeof analytics_excluded === "boolean" && analytics_audience !== "unknown"
    ? { analytics_audience, analytics_excluded, analytics_audience_version } : {};
  // Provider retries identify the same charge. Use both the same event UUID
  // and the provider's fixed timestamp when forwarding the verified charge.
  const paidAt = normalized.provider_paid_at_ms;
  const insertId = normalized.$insert_id;
  const stableCharge = event === "billing_payment_verified" && typeof insertId === "string" &&
    typeof paidAt === "number" && Number.isFinite(+new Date(paidAt));
  const signupMilestone = event === "signup_completed" || event === "first_login" || event === "web_signup_verified" || event === "web_signup_account_created";
  const stableId = stableCharge ? insertId : signupMilestone ? `${event}:${scopeAnalyticsDistinctId(distinctId)}` : null;
  const hex = stableId ? createHash("sha256").update(stableId).digest("hex") : null;
  const uuid = hex ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}` : undefined;
  let failed = false;
  client.on("error", () => { failed = true; });
  try {
    await client.captureImmediate({
      event, distinctId: scopeAnalyticsDistinctId(distinctId),
      ...(stableCharge ? { uuid, timestamp: new Date(paidAt) } : timestamp ? { timestamp, ...(signupMilestone ? { uuid } : {}) } : {}),
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
  return !failed;
}

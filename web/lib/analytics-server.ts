import { prisma } from "./prisma";
import { headers } from "next/headers";
import { after } from "next/server";
import { browserContext } from "../../shared/analytics";
import { shouldTrackAnalytics, type AnalyticsEventName, type AnalyticsProperties } from "./analytics";
import { capturePostHogServerEvent as capture } from "./analytics-capture";
import { getAnalyticsAudience } from "./analytics-audience";
async function prepareServerCapture(event: AnalyticsEventName, distinctId: string, properties: AnalyticsProperties = {}, timestamp?: Date) {
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
  const send = async () => {
    let identity = distinctId;
    if (/^(plan_|billing_|trial_to_paid)/.test(event) && !distinctId.startsWith("user_")) {
      try { identity = (await prisma.user.findUnique({ where: { id: distinctId }, select: { clerkUserId: true } }))?.clerkUserId ?? distinctId; } catch { /* Delivery must not affect billing. */ }
    }
    try {
      if (identity.startsWith("user_") && await prisma.clerkIdentityDeletion.findUnique({ where: { clerkUserId: identity }, select: { clerkUserId: true } })) return true;
    } catch { return false; /* Analytics must not block billing or capture an unverified deleted identity. */ }
    const audience = await getAnalyticsAudience(identity);
    // An intentional exclusion counts as delivered for retryable milestones.
    if (audience.analytics_audience === "test") return true;
    if ((event === "signup_completed" || event === "first_login") && audience.analytics_audience === "unknown") return false;
    return capture(event, identity, { ...context, ...properties, ...audience, event_source: "server" }, timestamp);
  };
  return send;
}

export async function capturePostHogServerEvent(event: AnalyticsEventName, distinctId: string, properties: AnalyticsProperties = {}, timestamp?: Date) {
  if (!shouldTrackAnalytics()) return;
  const send = await prepareServerCapture(event, distinctId, properties, timestamp);
  const deliver = async () => { await send(); };
  try { after(deliver); } catch { await deliver(); }
}

// Clerk can retry the signed delivery if PostHog is temporarily unavailable.
export async function captureClerkSignup(identity: string, verified: boolean, createdAt: Date) {
  const send = await prepareServerCapture("signup_completed", identity, { email_verified: verified }, createdAt);
  return send();
}

export async function scheduleFirstLogin(identity: string, verified: boolean, timestamp: Date) {
  if (!shouldTrackAnalytics()) return;
  const send = await prepareServerCapture("first_login", identity, { email_verified: verified }, timestamp);
  const deliver = async () => {
    if (await send()) {
      await prisma.user.updateMany({
        where: { clerkUserId: identity, firstLoginAt: timestamp, firstLoginAnalyticsPending: true },
        data: { firstLoginAnalyticsPending: false },
      });
    }
  };
  try { after(deliver); } catch { await deliver(); }
}

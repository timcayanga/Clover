import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BillingProvider,
  BillingSubscriptionStatus,
  PlanTier,
  Prisma,
  type User,
} from "@prisma/client";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { getDeploymentEnvironment } from "@/lib/deployment-environment";
import { getEnv, type AppEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { refreshProAccess } from "@/lib/pro-access";

export type PaddleWebhookEvent = {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: Record<string, unknown>;
};

const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 300;
const PADDLE_REQUEST_TIMEOUT_MS = 10_000;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseDate(value: unknown) {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toJsonValue(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readPaddleSignatures(header: string) {
  const values = new Map<string, string[]>();

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) {
      continue;
    }

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key || !value) {
      continue;
    }

    values.set(key, [...(values.get(key) ?? []), value]);
  }

  return values;
}

export function verifyPaddleWebhookSignature(params: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  now?: Date;
}) {
  const { rawBody, signatureHeader, secret, now = new Date() } = params;
  if (!signatureHeader || !secret) {
    return false;
  }

  const signatures = readPaddleSignatures(signatureHeader);
  const timestamp = Number(signatures.get("ts")?.[0]);
  const candidateSignatures = signatures.get("h1") ?? [];

  if (!Number.isFinite(timestamp) || candidateSignatures.length === 0) {
    return false;
  }

  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - timestamp);
  if (ageSeconds > PADDLE_SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}:${rawBody}`, "utf8")
    .digest();

  return candidateSignatures.some((candidate) => {
    if (!/^[a-f0-9]{64}$/i.test(candidate)) {
      return false;
    }

    const received = Buffer.from(candidate, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export function getPaddleBillingStatus(status: string | null | undefined) {
  switch (status?.trim().toLowerCase()) {
    case "active":
      return BillingSubscriptionStatus.active;
    case "canceled":
    case "cancelled":
      return BillingSubscriptionStatus.cancelled;
    case "paused":
    case "past_due":
      return BillingSubscriptionStatus.suspended;
    default:
      return BillingSubscriptionStatus.unknown;
  }
}

function getPaddlePlan(data: Record<string, unknown>, env: AppEnv) {
  const items = Array.isArray(data.items) ? data.items : [];

  for (const itemValue of items) {
    const item = asRecord(itemValue);
    const price = asRecord(item?.price);
    const priceId = readString(price?.id) ?? readString(item?.price_id);
    const productId = readString(price?.product_id) ?? readString(item?.product_id);
    const productMatches = !env.PADDLE_PRODUCT_ID || productId === env.PADDLE_PRODUCT_ID;

    if (productMatches && priceId === env.PADDLE_MONTHLY_PRICE_ID) {
      return { providerPlanId: priceId, interval: "monthly" as const };
    }

    if (productMatches && priceId === env.PADDLE_ANNUAL_PRICE_ID) {
      return { providerPlanId: priceId, interval: "annual" as const };
    }
  }

  return { providerPlanId: null, interval: null };
}

function getPaddleSubscriptionId(event: PaddleWebhookEvent) {
  const data = asRecord(event.data);
  return readString(data?.id) ?? readString(data?.subscription_id);
}

async function resolvePaddleUser(event: PaddleWebhookEvent) {
  const data = asRecord(event.data);
  const subscriptionId = getPaddleSubscriptionId(event);
  const environment = getDeploymentEnvironment();

  if (subscriptionId) {
    const existing = await prisma.billingSubscription.findUnique({
      where: { providerSubscriptionId: subscriptionId },
      include: { user: true },
    });
    if (existing?.provider === BillingProvider.paddle && existing.user.environment === environment) {
      return existing.user;
    }
  }

  const customData = asRecord(data?.custom_data);
  const userId =
    readString(customData?.cloverUserId) ??
    readString(customData?.clover_user_id) ??
    null;

  if (!userId) {
    return null;
  }

  return prisma.user.findFirst({
    where: {
      environment,
      OR: [{ id: userId }, { clerkUserId: userId }],
    },
  });
}

function getStoredOccurredAt(rawPayload: Prisma.JsonValue | null) {
  return parseDate(asRecord(rawPayload)?.occurred_at);
}

async function recordPaddleEvent(params: {
  event: PaddleWebhookEvent;
  userId: string | null;
  subscriptionId: string | null;
  status: string | null;
  processedAt: Date;
}) {
  const { event, userId, subscriptionId, status, processedAt } = params;
  const eventId = readString(event.event_id);
  const eventType = readString(event.event_type) ?? "unknown";
  const rawPayload = toJsonValue(event as Record<string, unknown>);

  if (eventId) {
    const existing = await prisma.billingEvent.findUnique({
      where: { providerEventId: eventId },
    });
    if (existing?.processedAt) {
      return { event: existing, duplicate: true };
    }

    const stored = await prisma.billingEvent.upsert({
      where: { providerEventId: eventId },
      update: {
        provider: BillingProvider.paddle,
        eventType,
        subscriptionId,
        userId,
        status,
        rawPayload,
        processedAt,
      },
      create: {
        provider: BillingProvider.paddle,
        providerEventId: eventId,
        eventType,
        subscriptionId,
        userId,
        status,
        rawPayload,
        processedAt,
      },
    });
    return { event: stored, duplicate: false };
  }

  const stored = await prisma.billingEvent.create({
    data: {
      provider: BillingProvider.paddle,
      eventType,
      subscriptionId,
      userId,
      status,
      rawPayload,
      processedAt,
    },
  });
  return { event: stored, duplicate: false };
}

export function getPaddlePlanTier(
  status: BillingSubscriptionStatus,
  interval: "monthly" | "annual" | null
) {
  return status === BillingSubscriptionStatus.active && interval
    ? PlanTier.pro
    : PlanTier.free;
}

export async function applyPaddleEntitlement(
  event: PaddleWebhookEvent,
  env = getEnv()
) {
  const eventType = readString(event.event_type) ?? "unknown";
  const data = asRecord(event.data) ?? {};
  const subscriptionId = getPaddleSubscriptionId(event);
  const user = await resolvePaddleUser(event);
  const statusText = readString(data.status);
  const occurredAt = parseDate(event.occurred_at) ?? new Date();

  const recorded = await recordPaddleEvent({
    event,
    userId: user?.id ?? null,
    subscriptionId,
    status: statusText,
    processedAt: new Date(),
  });

  if (recorded.duplicate) {
    return { matched: Boolean(user), duplicate: true, applied: false };
  }

  if (!user || !subscriptionId || !eventType.startsWith("subscription.")) {
    return { matched: Boolean(user), duplicate: false, applied: false };
  }

  const existing = await prisma.billingSubscription.findUnique({
    where: { userId: user.id },
  });

  if (
    existing?.provider === BillingProvider.paypal &&
    existing.status === BillingSubscriptionStatus.active
  ) {
    return { matched: true, duplicate: false, applied: false, conflict: "active_paypal" };
  }

  const previousOccurredAt = existing ? getStoredOccurredAt(existing.rawPayload) : null;
  if (previousOccurredAt && occurredAt < previousOccurredAt) {
    return { matched: true, duplicate: false, applied: false, stale: true };
  }

  const { providerPlanId, interval } = getPaddlePlan(data, env);
  const status = getPaddleBillingStatus(statusText);
  const planTier = getPaddlePlanTier(status, interval);
  const billingPeriod = asRecord(data.current_billing_period);
  const currentPeriodEnd =
    parseDate(billingPeriod?.ends_at) ??
    parseDate(data.next_billed_at);
  const rawPayload = toJsonValue(event as Record<string, unknown>);
  const wasActive = existing?.status === BillingSubscriptionStatus.active;
  const wasPro = existing?.planTier === PlanTier.pro;
  const wasCancelled = existing?.status === BillingSubscriptionStatus.cancelled;

  const subscriptionData: Prisma.BillingSubscriptionUncheckedCreateInput = {
    userId: user.id,
    provider: BillingProvider.paddle,
    providerSubscriptionId: subscriptionId,
    providerPlanId,
    status,
    planTier,
    interval,
    pendingPlanId: null,
    pendingInterval: null,
    currentPeriodEnd,
    paidThrough: (await prisma.growthPayment.findFirst({ where: { userId: user.id, subscriptionId, provider: "paddle", reversedAt: null, paidThrough: { not: null } }, orderBy: { paidThrough: "desc" } }))?.paidThrough ?? existing?.paidThrough ?? null,
    nextBillingTime: parseDate(data.next_billed_at),
    approvedAt:
      status === BillingSubscriptionStatus.active
        ? existing?.approvedAt ?? occurredAt
        : existing?.approvedAt ?? null,
    cancelledAt:
      status === BillingSubscriptionStatus.cancelled
        ? occurredAt
        : existing?.cancelledAt ?? null,
    lastEventType: eventType,
    lastSyncedAt: new Date(),
    rawPayload,
  };

  await prisma.billingSubscription.upsert({
    where: { userId: user.id },
    update: subscriptionData,
    create: subscriptionData,
  });

  if (!user.planTierLocked) {
    await refreshProAccess(user.id);
  }

  if (status === BillingSubscriptionStatus.active && !wasActive) {
    void capturePostHogServerEvent("billing_success", user.id, {
      billing_provider: "paddle",
      billing_status: status,
      plan_tier: planTier,
      interval,
    });
    if (!wasPro) {
      void capturePostHogServerEvent("trial_to_paid_conversion", user.id, {
        billing_provider: "paddle",
        billing_status: status,
        plan_tier: planTier,
        interval,
      });
    }
  }

  if (status === BillingSubscriptionStatus.cancelled && !wasCancelled) {
    void capturePostHogServerEvent("billing_cancelled", user.id, {
      billing_provider: "paddle",
      billing_status: status,
      plan_tier: planTier,
      interval,
    });
  }

  return { matched: true, duplicate: false, applied: true, planTier };
}

export function isPaddleCheckoutReady(env = getEnv()) {
  const requiredEnvironment =
    getDeploymentEnvironment() === "production" ? "live" : "sandbox";

  return Boolean(
    env.PADDLE_ENV === requiredEnvironment &&
      env.PADDLE_CLIENT_TOKEN &&
      env.PADDLE_WEBHOOK_SECRET &&
      env.PADDLE_MONTHLY_PRICE_ID &&
      env.PADDLE_ANNUAL_PRICE_ID
  );
}

export async function cancelPaddleSubscription(
  subscriptionId: string,
  env = getEnv()
) {
  if (!env.PADDLE_API_KEY) {
    throw new Error("Missing PADDLE_API_KEY");
  }

  const baseUrl =
    env.PADDLE_ENV === "live"
      ? "https://api.paddle.com"
      : "https://sandbox-api.paddle.com";
  const response = await fetch(
    `${baseUrl}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${env.PADDLE_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        scheduled_change: {
          action: "cancel",
          effective_at: "immediately",
        },
      }),
      signal: AbortSignal.timeout(PADDLE_REQUEST_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    throw new Error(`Unable to cancel Paddle subscription (${response.status})`);
  }
}

function getPaddleBaseUrl(env: AppEnv) {
  return env.PADDLE_ENV === "live"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

function getPaddleCustomerIdFromPayload(rawPayload: Prisma.JsonValue | null) {
  const payload = asRecord(rawPayload);
  return readString(asRecord(payload?.data)?.customer_id);
}

async function fetchPaddleSubscriptionCustomerId(
  subscriptionId: string,
  env: AppEnv
) {
  const response = await fetch(
    `${getPaddleBaseUrl(env)}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      headers: {
        Authorization: `Bearer ${env.PADDLE_API_KEY}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(PADDLE_REQUEST_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    throw new Error(`Unable to load Paddle subscription (${response.status})`);
  }

  const body = (await response.json()) as { data?: Record<string, unknown> };
  const customerId = readString(body.data?.customer_id);
  if (!customerId) {
    throw new Error("Paddle subscription does not include a customer.");
  }

  return customerId;
}

export function getPaddleCustomerPortalLinks(
  payload: unknown,
  subscriptionId: string
) {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  const urls = asRecord(data?.urls);
  const general = asRecord(urls?.general);
  const subscriptions = Array.isArray(urls?.subscriptions)
    ? urls.subscriptions
    : [];
  const subscriptionLinks = subscriptions
    .map(asRecord)
    .find((links) => readString(links?.id) === subscriptionId);

  return {
    overview: readString(general?.overview),
    updatePaymentMethod: readString(
      subscriptionLinks?.update_subscription_payment_method
    ),
    cancel: readString(subscriptionLinks?.cancel_subscription),
  };
}

export async function createPaddleCustomerPortalSession(params: {
  subscriptionId: string;
  rawPayload: Prisma.JsonValue | null;
  env?: AppEnv;
}) {
  const env = params.env ?? getEnv();
  if (!env.PADDLE_API_KEY) {
    throw new Error("Paddle subscription management is not configured.");
  }

  const customerId =
    getPaddleCustomerIdFromPayload(params.rawPayload) ??
    (await fetchPaddleSubscriptionCustomerId(params.subscriptionId, env));
  const response = await fetch(
    `${getPaddleBaseUrl(env)}/customers/${encodeURIComponent(customerId)}/portal-sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.PADDLE_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        subscription_ids: [params.subscriptionId],
      }),
      signal: AbortSignal.timeout(PADDLE_REQUEST_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    throw new Error(`Unable to open Paddle subscription management (${response.status})`);
  }

  const links = getPaddleCustomerPortalLinks(
    await response.json(),
    params.subscriptionId
  );

  if (!links.overview) {
    throw new Error("Paddle did not return a customer portal link.");
  }

  return links;
}

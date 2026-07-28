import {
  BillingProvider,
  BillingSubscriptionStatus,
  PlanTier,
  Prisma,
  type User,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { getBillingPlanById, type BillingInterval } from "@/lib/billing-plans";
import { getDeploymentEnvironment } from "@/lib/deployment-environment";

export type PayPalWebhookBody = {
  id?: string;
  event_type?: string;
  resource_type?: string;
  summary?: string;
  resource?: Record<string, unknown>;
};

type VerificationPayload = {
  transmission_id: string;
  transmission_time: string;
  cert_url: string;
  auth_algo: string;
  transmission_sig: string;
  webhook_id: string;
  webhook_event: PayPalWebhookBody;
};

const tokenCache = {
  accessToken: null as string | null,
  expiresAt: 0,
};
const PAYPAL_REQUEST_TIMEOUT_MS = 10_000;

function getPayPalBaseUrl(env = getEnv()) {
  return env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toJsonValue(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function getEventType(body: PayPalWebhookBody) {
  return body.event_type?.trim() ?? "";
}

function getResource(body: PayPalWebhookBody) {
  return asRecord(body.resource) ?? {};
}

function getCandidateUserIdentifiers(body: PayPalWebhookBody) {
  const resource = getResource(body);
  const eventType = getEventType(body).toUpperCase();
  const subscriber = asRecord(resource.subscriber);
  const payer = asRecord(resource.payer);

  const customId =
    readString(resource.custom_id) ??
    readString(subscriber?.custom_id) ??
    readString(resource.invoice_id) ??
    readString(resource.reference_id);

  const email =
    readString(subscriber?.email_address) ??
    readString(payer?.email_address) ??
    readString(resource.email_address) ??
    readString(resource.payer_email_address);

  const subscriptionId =
    readString(resource.subscription_id) ??
    readString(resource.billing_agreement_id) ??
    readString(asRecord(resource.billing_agreement)?.id) ??
    (eventType.startsWith("BILLING.SUBSCRIPTION.") ? readString(resource.id) : null);

  return { customId, email, subscriptionId };
}

async function getPayPalAccessToken(env = getEnv()) {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 30_000) {
    return tokenCache.accessToken;
  }

  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error("Missing PayPal API credentials");
  }

  const response = await fetch(`${getPayPalBaseUrl(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(PAYPAL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Unable to authenticate with PayPal (${response.status})`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("PayPal did not return an access token");
  }

  tokenCache.accessToken = data.access_token;
  tokenCache.expiresAt = now + (data.expires_in ?? 0) * 1000;

  return tokenCache.accessToken;
}

async function fetchPayPalSubscription(subscriptionId: string, env = getEnv()) {
  const accessToken = await getPayPalAccessToken(env);
  const response = await fetch(`${getPayPalBaseUrl(env)}/v1/billing/subscriptions/${subscriptionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(PAYPAL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function verifyPayPalWebhook(body: PayPalWebhookBody, headers: Headers) {
  const env = getEnv();
  if (!env.PAYPAL_WEBHOOK_ID) {
    throw new Error("Missing PAYPAL_WEBHOOK_ID");
  }

  const payload: VerificationPayload = {
    transmission_id: headers.get("paypal-transmission-id") ?? headers.get("PAYPAL-TRANSMISSION-ID") ?? "",
    transmission_time: headers.get("paypal-transmission-time") ?? headers.get("PAYPAL-TRANSMISSION-TIME") ?? "",
    cert_url: headers.get("paypal-cert-url") ?? headers.get("PAYPAL-CERT-URL") ?? "",
    auth_algo: headers.get("paypal-auth-algo") ?? headers.get("PAYPAL-AUTH-ALGO") ?? "",
    transmission_sig: headers.get("paypal-transmission-sig") ?? headers.get("PAYPAL-TRANSMISSION-SIG") ?? "",
    webhook_id: env.PAYPAL_WEBHOOK_ID,
    webhook_event: body,
  };

  if (
    !payload.transmission_id ||
    !payload.transmission_time ||
    !payload.cert_url ||
    !payload.auth_algo ||
    !payload.transmission_sig
  ) {
    throw new Error("Missing PayPal webhook headers");
  }

  const accessToken = await getPayPalAccessToken(env);
  const response = await fetch(`${getPayPalBaseUrl(env)}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(PAYPAL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Unable to verify PayPal webhook (${response.status})`);
  }

  const data = (await response.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}

export async function resolvePayPalUser(body: PayPalWebhookBody) {
  const { customId, email, subscriptionId } = getCandidateUserIdentifiers(body);
  const environment = getDeploymentEnvironment();

  const findByIdentifiers = async (identifier?: string | null) => {
    const existingSubscription = subscriptionId
      ? await prisma.billingSubscription.findUnique({
          where: { providerSubscriptionId: subscriptionId },
          include: { user: true },
        })
      : null;
    if (existingSubscription?.user.environment === environment) {
      return existingSubscription.user;
    }

    const byCustomId = identifier
      ? await prisma.user.findFirst({
          where: {
            environment,
            OR: [{ id: identifier }, { clerkUserId: identifier }],
          },
        })
      : null;

    return byCustomId;
  };

  const initialMatch = await findByIdentifiers(customId);
  if (initialMatch) {
    return { user: initialMatch, subscriptionId, email };
  }

  if (!subscriptionId) {
    return { user: null, subscriptionId, email };
  }

  const subscription = await fetchPayPalSubscription(subscriptionId);
  const subscriptionCustomId =
    readString(subscription?.custom_id) ??
    readString(asRecord(subscription?.subscriber)?.custom_id) ??
    readString(asRecord(subscription?.subscriber)?.email_address);
  const subscriptionEmail = readString(asRecord(subscription?.subscriber)?.email_address);

  const resolvedMatch = await findByIdentifiers(subscriptionCustomId);
  return { user: resolvedMatch, subscriptionId, email: subscriptionEmail ?? email };
}

export async function applyPayPalEntitlement(body: PayPalWebhookBody) {
  const eventType = getEventType(body);
  const resource = getResource(body);
  const { user, subscriptionId, email } = await resolvePayPalUser(body);
  const eventId = readString(body.id);

  await upsertBillingEvent({
    eventId,
    eventType,
    subscriptionId,
    userId: user?.id ?? null,
    status: readString(resource.status) ?? null,
    rawPayload: body as Record<string, unknown>,
    processedAt: new Date(),
  });

  if (!user) {
    return { matched: false, user: null, planTier: null as PlanTier | null };
  }

  if (subscriptionId) {
    const snapshot = await syncBillingSubscriptionFromPayPal(subscriptionId, user, { eventType });
    if (snapshot && "planTier" in snapshot) {
      return {
        matched: true,
        user,
        email,
        subscriptionId,
        planTier: snapshot.planTier,
      };
    }
  }

  // A verified event alone is not proof of a Clover subscription. Keep the
  // current entitlement if PayPal cannot return a configured subscription.
  return {
    matched: true,
    user,
    email,
    subscriptionId,
    planTier: user.planTier,
  };
}

type PayPalLink = {
  href?: string;
  rel?: string;
};

type PayPalSubscriptionSnapshot = {
  providerSubscriptionId: string;
  providerPlanId: string | null;
  interval: BillingInterval | null;
  status: BillingSubscriptionStatus;
  customId: string | null;
  email: string | null;
  currentPeriodEnd: Date | null;
  nextBillingTime: Date | null;
  approvedAt: Date | null;
  rawPayload: Record<string, unknown>;
};

function parseBillingDate(value: unknown) {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getBillingStatus(status: string | null | undefined) {
  const normalized = status?.trim().toUpperCase() ?? "";

  if (normalized === "ACTIVE") {
    return BillingSubscriptionStatus.active;
  }

  if (normalized === "APPROVAL_PENDING") {
    return BillingSubscriptionStatus.approval_pending;
  }

  if (normalized === "CANCELLED") {
    return BillingSubscriptionStatus.cancelled;
  }

  if (normalized === "SUSPENDED") {
    return BillingSubscriptionStatus.suspended;
  }

  if (normalized === "EXPIRED") {
    return BillingSubscriptionStatus.expired;
  }

  return BillingSubscriptionStatus.unknown;
}

export function getBillingPlanTierForSubscription(
  status: BillingSubscriptionStatus,
  interval: BillingInterval | null
) {
  return status === BillingSubscriptionStatus.active && interval !== null
    ? PlanTier.pro
    : PlanTier.free;
}

function getPlanIntervalFromSubscription(subscription: Record<string, unknown>, env = getEnv()) {
  const providerPlanId = readString(subscription.plan_id);
  const resolvedPlan = getBillingPlanById(providerPlanId, env);
  return {
    providerPlanId,
    interval: resolvedPlan?.interval ?? null,
  };
}

function getPayPalLinks(responseBody: Record<string, unknown>) {
  const links = Array.isArray(responseBody.links)
    ? responseBody.links
        .map((link) => asRecord(link))
        .filter((link): link is Record<string, unknown> => Boolean(link))
    : [];

  return {
    approve: links.find((link) => readString(link.rel)?.toLowerCase() === "approve")?.href ?? null,
    self: links.find((link) => readString(link.rel)?.toLowerCase() === "self")?.href ?? null,
    edit: links.find((link) => readString(link.rel)?.toLowerCase() === "edit")?.href ?? null,
  };
}

function snapshotPayPalSubscription(subscription: Record<string, unknown>, env = getEnv()): PayPalSubscriptionSnapshot | null {
  const providerSubscriptionId = readString(subscription.id);
  if (!providerSubscriptionId) {
    return null;
  }

  const subscriber = asRecord(subscription.subscriber);
  const billingInfo = asRecord(subscription.billing_info);
  const { providerPlanId, interval } = getPlanIntervalFromSubscription(subscription, env);

  return {
    providerSubscriptionId,
    providerPlanId,
    interval,
    status: getBillingStatus(readString(subscription.status)),
    customId:
      readString(subscription.custom_id) ??
      readString(subscriber?.custom_id) ??
      readString(subscription.invoice_id) ??
      null,
    email: readString(subscriber?.email_address) ?? readString(subscription.email_address) ?? null,
    currentPeriodEnd: parseBillingDate(billingInfo?.next_billing_time),
    nextBillingTime: parseBillingDate(billingInfo?.next_billing_time),
    approvedAt: parseBillingDate(subscription.update_time) ?? parseBillingDate(subscription.create_time),
    rawPayload: subscription,
  };
}

async function applyBillingSubscriptionSnapshot(
  user: Pick<User, "id" | "planTierLocked">,
  snapshot: PayPalSubscriptionSnapshot,
  eventType?: string,
  pendingPlanId?: string | null,
  pendingInterval?: BillingInterval | null
) {
  // Approval pending means the buyer has not completed the PayPal consent flow.
  // Do not grant paid entitlements until PayPal reports an active subscription.
  const planTier = getBillingPlanTierForSubscription(snapshot.status, snapshot.interval);
  const shouldClearPending = eventType !== "MANUAL.REVISE" && snapshot.status !== BillingSubscriptionStatus.approval_pending;

  const existing = await prisma.billingSubscription.findUnique({
    where: { userId: user.id },
  });
  const wasPro = existing?.planTier === PlanTier.pro;
  const wasActive = existing?.status === BillingSubscriptionStatus.active;
  const wasCancelled = existing?.status === BillingSubscriptionStatus.cancelled;

  const rawPayload: Prisma.InputJsonValue = toJsonValue(snapshot.rawPayload);

  const data: Prisma.BillingSubscriptionUncheckedCreateInput = {
    provider: BillingProvider.paypal,
    providerSubscriptionId: snapshot.providerSubscriptionId,
    providerPlanId: snapshot.providerPlanId,
    status: snapshot.status,
    planTier,
    interval: snapshot.interval,
    pendingPlanId: shouldClearPending ? null : pendingPlanId ?? existing?.pendingPlanId ?? null,
    pendingInterval: shouldClearPending ? null : pendingInterval ?? existing?.pendingInterval ?? null,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    nextBillingTime: snapshot.nextBillingTime,
    approvedAt: snapshot.status === BillingSubscriptionStatus.active ? snapshot.approvedAt ?? new Date() : existing?.approvedAt ?? null,
    cancelledAt: snapshot.status === BillingSubscriptionStatus.cancelled ? new Date() : existing?.cancelledAt ?? null,
    lastEventType: eventType ?? existing?.lastEventType ?? null,
    lastSyncedAt: new Date(),
    rawPayload,
    userId: user.id,
  };

  const billingSubscription = existing
    ? await prisma.billingSubscription.update({
        where: { userId: user.id },
        data,
      })
    : await prisma.billingSubscription.create({
        data,
      });

  if (!user.planTierLocked) {
    await prisma.user.update({
      where: { id: user.id },
      data: { planTier },
    });
  }

  if (snapshot.status === BillingSubscriptionStatus.active && !wasActive) {
    void capturePostHogServerEvent("billing_success", user.id, {
      billing_status: snapshot.status,
      plan_tier: planTier,
      interval: snapshot.interval ?? null,
    });

    if (!wasPro) {
      void capturePostHogServerEvent("trial_to_paid_conversion", user.id, {
        billing_status: snapshot.status,
        plan_tier: planTier,
        interval: snapshot.interval ?? null,
      });
    }
  }

  if (snapshot.status === BillingSubscriptionStatus.cancelled && !wasCancelled) {
    void capturePostHogServerEvent("billing_cancelled", user.id, {
      billing_status: snapshot.status,
      plan_tier: planTier,
      interval: snapshot.interval ?? null,
    });
  }

  return billingSubscription;
}

export async function getUserBillingSubscription(userId: string) {
  return prisma.billingSubscription.findUnique({
    where: { userId },
  });
}

export async function reconcileBillingPlanTier(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, planTier: true, planTierLocked: true },
  });

  if (!user) {
    return null;
  }

  if (user.planTierLocked) {
    return user.planTier;
  }

  const subscription = await getUserBillingSubscription(userId);
  if (!subscription) {
    return null;
  }

  const nextPlanTier = getBillingPlanTierForSubscription(subscription.status, subscription.interval);

  if (subscription.planTier !== nextPlanTier) {
    await prisma.billingSubscription.update({
      where: { userId },
      data: {
        planTier: nextPlanTier,
        lastSyncedAt: new Date(),
      },
    });
  }

  if (user.planTier !== nextPlanTier) {
    await prisma.user.update({
      where: { id: userId },
      data: { planTier: nextPlanTier },
    });
  }

  return nextPlanTier;
}

export async function upsertBillingEvent(params: {
  eventId?: string | null;
  eventType: string;
  subscriptionId?: string | null;
  userId?: string | null;
  status?: string | null;
  rawPayload: Record<string, unknown>;
  processedAt?: Date | null;
}) {
  const { eventId, eventType, subscriptionId, userId, status, rawPayload, processedAt } = params;

  if (eventId) {
    return prisma.billingEvent.upsert({
      where: { providerEventId: eventId },
      update: {
        eventType,
        subscriptionId: subscriptionId ?? null,
        userId: userId ?? null,
        status: status ?? null,
        rawPayload: toJsonValue(rawPayload),
        processedAt: processedAt ?? new Date(),
      },
      create: {
        providerEventId: eventId,
        eventType,
        subscriptionId: subscriptionId ?? null,
        userId: userId ?? null,
        status: status ?? null,
        rawPayload: toJsonValue(rawPayload),
        processedAt: processedAt ?? new Date(),
      },
    });
  }

  return prisma.billingEvent.create({
    data: {
      eventType,
      subscriptionId: subscriptionId ?? null,
      userId: userId ?? null,
      status: status ?? null,
      rawPayload: toJsonValue(rawPayload),
      processedAt: processedAt ?? new Date(),
    },
  });
}

export async function syncBillingSubscriptionFromPayPal(
  subscriptionId: string,
  user: Pick<User, "id" | "planTierLocked"> | null = null,
  options?: {
    eventType?: string;
    pendingPlanId?: string | null;
    pendingInterval?: BillingInterval | null;
  }
) {
  const env = getEnv();
  const subscription = await fetchPayPalSubscription(subscriptionId, env);
  if (!subscription) {
    return null;
  }

  const snapshot = snapshotPayPalSubscription(subscription, env);
  if (!snapshot) {
    return null;
  }

  const targetUser = user
    ? await prisma.user.findUnique({ where: { id: user.id } })
    : null;

  if (targetUser) {
    return applyBillingSubscriptionSnapshot(targetUser, snapshot, options?.eventType, options?.pendingPlanId, options?.pendingInterval);
  }

  return snapshot;
}

export async function createPayPalSubscription(params: {
  planId: string;
  customId: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const env = getEnv();
  const accessToken = await getPayPalAccessToken(env);

  const response = await fetch(`${getPayPalBaseUrl(env)}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      plan_id: params.planId,
      custom_id: params.customId,
      application_context: {
        brand_name: "Clover",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
    signal: AbortSignal.timeout(PAYPAL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    throw new Error(
      `Create Subscription Api response error: ${JSON.stringify(errorBody ?? { status: response.status })}`
    );
  }

  const body = (await response.json()) as Record<string, unknown>;
  const links = getPayPalLinks(body);
  const subscriptionId = readString(body.id);

  if (!subscriptionId) {
    throw new Error("PayPal did not return a subscription id");
  }

  return {
    subscriptionId,
    approvalUrl: links.approve,
    raw: body,
  };
}

export async function revisePayPalSubscription(params: {
  subscriptionId: string;
  planId: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const env = getEnv();
  const accessToken = await getPayPalAccessToken(env);

  const response = await fetch(`${getPayPalBaseUrl(env)}/v1/billing/subscriptions/${params.subscriptionId}/revise`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      plan_id: params.planId,
      application_context: {
        brand_name: "Clover",
        locale: "en-US",
        user_action: "SUBSCRIBE_NOW",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
    signal: AbortSignal.timeout(PAYPAL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    throw new Error(
      `Revise Subscription Api response error: ${JSON.stringify(errorBody ?? { status: response.status })}`
    );
  }

  const body = (await response.json()) as Record<string, unknown>;
  const links = getPayPalLinks(body);

  return {
    subscriptionId: readString(body.id) ?? params.subscriptionId,
    approvalUrl: links.approve,
    raw: body,
  };
}

export async function cancelPayPalSubscription(params: { subscriptionId: string; reason: string }) {
  const env = getEnv();
  const accessToken = await getPayPalAccessToken(env);

  const response = await fetch(`${getPayPalBaseUrl(env)}/v1/billing/subscriptions/${params.subscriptionId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      reason: params.reason,
    }),
    signal: AbortSignal.timeout(PAYPAL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    throw new Error(
      `Cancel Subscription Api response error: ${JSON.stringify(errorBody ?? { status: response.status })}`
    );
  }

  return true;
}

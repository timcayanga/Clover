import { PlanTier, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

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

function getEventType(body: PayPalWebhookBody) {
  return body.event_type?.trim() ?? "";
}

function getResource(body: PayPalWebhookBody) {
  return asRecord(body.resource) ?? {};
}

function getCandidateUserIdentifiers(body: PayPalWebhookBody) {
  const resource = getResource(body);
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
    readString(resource.id) ??
    readString(resource.subscription_id) ??
    readString(resource.billing_agreement_id) ??
    readString(asRecord(resource.billing_agreement)?.id);

  return { customId, email, subscriptionId };
}

function shouldSetPro(eventType: string, resource: Record<string, unknown>) {
  const upperType = eventType.toUpperCase();
  const status = readString(resource.status)?.toUpperCase() ?? readString(resource.state)?.toUpperCase() ?? "";

  if (upperType === "BILLING.SUBSCRIPTION.ACTIVATED") {
    return true;
  }

  if (upperType === "BILLING.SUBSCRIPTION.UPDATED") {
    return status === "ACTIVE";
  }

  if (upperType === "PAYMENT.SALE.COMPLETED") {
    return true;
  }

  if (["BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.EXPIRED"].includes(upperType)) {
    return false;
  }

  if (["PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED"].includes(upperType)) {
    return false;
  }

  return status === "ACTIVE";
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
  });

  if (!response.ok) {
    throw new Error(`Unable to verify PayPal webhook (${response.status})`);
  }

  const data = (await response.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}

export async function resolvePayPalUser(body: PayPalWebhookBody) {
  const { customId, email, subscriptionId } = getCandidateUserIdentifiers(body);

  const findByIdentifiers = async (identifier?: string | null, address?: string | null) => {
    const byCustomId = identifier
      ? await prisma.user.findFirst({
          where: {
            OR: [{ id: identifier }, { clerkUserId: identifier }, { email: identifier }],
          },
        })
      : null;

    if (byCustomId) {
      return byCustomId;
    }

    return address
      ? await prisma.user.findUnique({
          where: { email: address },
        })
      : null;
  };

  const initialMatch = await findByIdentifiers(customId, email);
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

  const resolvedMatch = await findByIdentifiers(subscriptionCustomId, subscriptionEmail);
  return { user: resolvedMatch, subscriptionId, email: subscriptionEmail ?? email };
}

export async function applyPayPalEntitlement(body: PayPalWebhookBody) {
  const eventType = getEventType(body);
  const resource = getResource(body);
  const { user, subscriptionId, email } = await resolvePayPalUser(body);

  if (!user) {
    return { matched: false, user: null, planTier: null as PlanTier | null };
  }

  const shouldGrant = shouldSetPro(eventType, resource);
  const nextPlanTier = shouldGrant ? PlanTier.pro : PlanTier.free;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      planTier: nextPlanTier,
    },
  });

  return {
    matched: true,
    user,
    email,
    subscriptionId,
    planTier: nextPlanTier,
  };
}

export function getPayPalDebugInfo(body: PayPalWebhookBody) {
  const { customId, email, subscriptionId } = getCandidateUserIdentifiers(body);
  return {
    eventType: getEventType(body),
    customId,
    email,
    subscriptionId,
  };
}

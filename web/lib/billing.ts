import { BillingProvider, BillingStatus, PlanTier, Prisma, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";

type JsonLike = Record<string, unknown> | unknown[];

type GumroadEvent = {
  provider: BillingProvider;
  eventType: string;
  externalEventId: string | null;
  externalCustomerId: string | null;
  externalCustomerEmail: string | null;
  externalSubscriptionId: string | null;
  externalProductId: string | null;
  externalProductPermalink: string | null;
  status: BillingStatus;
  isRelevantProduct: boolean;
  isEntitlementActive: boolean;
  rawPayload: Prisma.InputJsonValue;
};

const ACTIVE_EVENT_HINTS = [
  "sale",
  "purchase",
  "subscription_created",
  "subscription_renewed",
  "membership_created",
  "membership_renewed",
  "active",
];

const INACTIVE_EVENT_HINTS = [
  "refund",
  "chargeback",
  "cancel",
  "canceled",
  "cancelled",
  "expired",
  "inactive",
  "failed",
  "past_due",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
  }

  return null;
}

function readBoolean(source: Record<string, unknown> | null, keys: string[]): boolean | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (["1", "true", "yes", "y", "active", "paid"].includes(normalized)) {
        return true;
      }

      if (["0", "false", "no", "n", "inactive", "canceled", "cancelled", "refunded"].includes(normalized)) {
        return false;
      }
    }

    if (typeof value === "number") {
      return value !== 0;
    }
  }

  return null;
}

function normalizeStatus(eventType: string, source: Record<string, unknown> | null): BillingStatus {
  const hintedStatus = readString(source, ["status", "subscription_status", "payment_status"]);

  if (hintedStatus) {
    const normalized = hintedStatus.trim().toLowerCase();

    if (["active", "paid", "succeeded", "success"].includes(normalized)) return BillingStatus.active;
    if (["canceled", "cancelled", "expired", "inactive"].includes(normalized)) return BillingStatus.canceled;
    if (["refunded", "chargeback", "reversed"].includes(normalized)) return BillingStatus.refunded;
    if (["past_due", "unpaid", "failed"].includes(normalized)) return BillingStatus.past_due;
  }

  const lowerEvent = eventType.toLowerCase();
  if (INACTIVE_EVENT_HINTS.some((hint) => lowerEvent.includes(hint))) {
    if (lowerEvent.includes("refund") || lowerEvent.includes("chargeback")) {
      return BillingStatus.refunded;
    }

    return BillingStatus.canceled;
  }

  if (ACTIVE_EVENT_HINTS.some((hint) => lowerEvent.includes(hint))) {
    return BillingStatus.active;
  }

  return BillingStatus.unknown;
}

function isTruthyEvent(source: Record<string, unknown> | null, keys: string[]) {
  const value = readBoolean(source, keys);
  if (value !== null) {
    return value;
  }

  const raw = readString(source, keys);
  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase();
  if (["active", "paid", "succeeded", "success"].includes(normalized)) return true;
  if (["inactive", "canceled", "cancelled", "refunded", "failed", "past_due"].includes(normalized)) return false;
  return null;
}

export function normalizeGumroadPayload(input: unknown, opts: { productId?: string | null; productPermalink?: string | null } = {}): GumroadEvent | null {
  const source = asRecord(input);
  if (!source) {
    return null;
  }

  const eventType = readString(source, ["event", "event_type", "type", "action", "status"]) ?? "unknown";
  const externalEventId = readString(source, ["sale_id", "event_id", "id", "purchase_id"]);
  const externalCustomerId = readString(source, ["customer_id", "buyer_id", "user_id"]);
  const externalCustomerEmail = readString(source, ["email", "buyer_email", "customer_email", "purchaser_email"]);
  const externalSubscriptionId = readString(source, ["subscription_id", "membership_id", "subscription"]);
  const externalProductId = readString(source, ["product_id", "gumroad_product_id", "resource_id"]);
  const externalProductPermalink = readString(source, ["permalink", "product_permalink", "product_slug"]);
  const status = normalizeStatus(eventType, source);
  const activeHint = isTruthyEvent(source, ["is_active", "active", "subscription_active", "membership_active"]);
  const cancelledHint = isTruthyEvent(source, ["cancelled", "canceled", "subscription_cancelled", "subscription_canceled", "membership_cancelled", "membership_canceled"]);
  const refundedHint = isTruthyEvent(source, ["refunded", "refund", "is_refunded"]);

  const isRelevantProduct =
    Boolean(opts.productId && externalProductId && opts.productId === externalProductId) ||
    Boolean(opts.productPermalink && externalProductPermalink && opts.productPermalink === externalProductPermalink) ||
    (!opts.productId && !opts.productPermalink);

  const isEntitlementActive =
    status === BillingStatus.active ||
    activeHint === true ||
    (status === BillingStatus.unknown && cancelledHint !== true && refundedHint !== true);

  return {
    provider: BillingProvider.gumroad,
    eventType,
    externalEventId,
    externalCustomerId,
    externalCustomerEmail,
    externalSubscriptionId,
    externalProductId,
    externalProductPermalink,
    status: refundedHint === true ? BillingStatus.refunded : cancelledHint === true ? BillingStatus.canceled : status,
    isRelevantProduct,
    isEntitlementActive,
    rawPayload: input as Prisma.InputJsonValue,
  };
}

export function getBillingEntitlementTier(event: Pick<GumroadEvent, "status" | "isEntitlementActive">) {
  if (event.status === BillingStatus.refunded || event.status === BillingStatus.canceled) {
    return PlanTier.free;
  }

  return event.isEntitlementActive ? PlanTier.pro : PlanTier.free;
}

export function shouldSyncUserForEvent(
  event: Pick<GumroadEvent, "isRelevantProduct" | "isEntitlementActive" | "status">,
  currentTier: PlanTier
) {
  if (!event.isRelevantProduct) {
    return false;
  }

  if (event.status === BillingStatus.refunded || event.status === BillingStatus.canceled) {
    return currentTier === PlanTier.pro;
  }

  return event.isEntitlementActive;
}

export function findBillingEmail(user: Pick<User, "email"> | null, event: Pick<GumroadEvent, "externalCustomerEmail">) {
  return event.externalCustomerEmail ?? user?.email ?? null;
}

export function isBillingPayload(value: unknown): value is JsonLike {
  return typeof value === "object" && value !== null;
}

export async function recordBillingEventForUser(
  user: Pick<User, "id" | "email" | "planTier"> | null,
  event: GumroadEvent
) {
  const eventEmail = findBillingEmail(user, event);

  const billingConnection = user
    ? await prisma.billingConnection.upsert({
        where: {
          userId_provider: {
            userId: user.id,
            provider: BillingProvider.gumroad,
          },
        },
        update: {
          externalCustomerId: event.externalCustomerId,
          externalCustomerEmail: eventEmail,
          externalSubscriptionId: event.externalSubscriptionId,
          externalProductId: event.externalProductId,
          externalProductPermalink: event.externalProductPermalink,
          status: event.status,
          entitlementTier: getBillingEntitlementTier(event),
          syncedAt: new Date(),
          lastPayload: event.rawPayload,
        },
        create: {
          userId: user.id,
          provider: BillingProvider.gumroad,
          externalCustomerId: event.externalCustomerId,
          externalCustomerEmail: eventEmail,
          externalSubscriptionId: event.externalSubscriptionId,
          externalProductId: event.externalProductId,
          externalProductPermalink: event.externalProductPermalink,
          status: event.status,
          entitlementTier: getBillingEntitlementTier(event),
          syncedAt: new Date(),
          lastPayload: event.rawPayload,
        },
      })
    : null;

  const eventData = {
    provider: BillingProvider.gumroad,
    externalEventId: event.externalEventId,
    eventType: event.eventType,
    externalCustomerId: event.externalCustomerId,
    externalCustomerEmail: eventEmail,
    externalSubscriptionId: event.externalSubscriptionId,
    externalProductId: event.externalProductId,
    externalProductPermalink: event.externalProductPermalink,
    status: event.status,
    processedAt: new Date(),
    rawPayload: event.rawPayload,
    billingConnectionId: billingConnection?.id ?? null,
    userId: user?.id ?? null,
  };

  const eventRecord =
    event.externalEventId
      ? await prisma.billingEvent
          .findFirst({
            where: {
              provider: BillingProvider.gumroad,
              externalEventId: event.externalEventId,
            },
          })
          .then((existing) =>
            existing
              ? prisma.billingEvent.update({
                  where: { id: existing.id },
                  data: eventData,
                })
              : prisma.billingEvent.create({
                  data: eventData,
                })
          )
      : await prisma.billingEvent.create({
          data: eventData,
        });

  if (user && shouldSyncUserForEvent(event, user.planTier)) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        planTier: getBillingEntitlementTier(event),
      },
    });
  }

  return { billingConnection, eventRecord };
}

export async function reconcileUserBilling(user: Pick<User, "id" | "email" | "planTier">) {
  const env = getEnv();
  const connection = await prisma.billingConnection.findFirst({
    where: {
      userId: user.id,
      provider: BillingProvider.gumroad,
    },
  });

  if (connection) {
    if (connection.entitlementTier !== user.planTier) {
      await prisma.user.update({
        where: { id: user.id },
        data: { planTier: connection.entitlementTier },
      });
    }

    return connection;
  }

  const latestEvent = await prisma.billingEvent.findFirst({
    where: {
      provider: BillingProvider.gumroad,
      externalCustomerEmail: user.email,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!latestEvent) {
    return null;
  }

  const event = normalizeGumroadPayload(latestEvent.rawPayload, {
    productId: env.GUMROAD_PRO_PRODUCT_ID ?? null,
    productPermalink: env.GUMROAD_PRO_PRODUCT_PERMALINK ?? null,
  });

  if (!event) {
    return null;
  }

  if (!event.isRelevantProduct) {
    return null;
  }

  if (shouldSyncUserForEvent(event, user.planTier)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { planTier: getBillingEntitlementTier(event) },
    });
  }

  return prisma.billingConnection.upsert({
    where: {
      userId_provider: {
        userId: user.id,
        provider: BillingProvider.gumroad,
      },
    },
    update: {
      externalCustomerId: event.externalCustomerId,
      externalCustomerEmail: event.externalCustomerEmail ?? user.email,
      externalSubscriptionId: event.externalSubscriptionId,
      externalProductId: event.externalProductId,
      externalProductPermalink: event.externalProductPermalink,
      status: event.status,
      entitlementTier: getBillingEntitlementTier(event),
      syncedAt: new Date(),
      lastPayload: event.rawPayload,
    },
    create: {
      userId: user.id,
      provider: BillingProvider.gumroad,
      externalCustomerId: event.externalCustomerId,
      externalCustomerEmail: event.externalCustomerEmail ?? user.email,
      externalSubscriptionId: event.externalSubscriptionId,
      externalProductId: event.externalProductId,
      externalProductPermalink: event.externalProductPermalink,
      status: event.status,
      entitlementTier: getBillingEntitlementTier(event),
      syncedAt: new Date(),
      lastPayload: event.rawPayload,
    },
  });
}

export type { GumroadEvent };

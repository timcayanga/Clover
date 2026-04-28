export type ClientPlanTier = "free" | "pro" | "unknown";

export type PlanLimitType = "account_limit" | "transaction_limit" | "upload_limit";

export type PlanLimitPayload = {
  planTier: ClientPlanTier;
  limitType: PlanLimitType;
  limitValue: number | null;
};

export type PlanLimitNudgeCopy = {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

export const parsePlanLimitPayload = (payload: unknown): PlanLimitPayload | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const planTierValue = "planTier" in payload ? (payload as { planTier?: unknown }).planTier : null;
  const limitTypeValue = "limitType" in payload ? (payload as { limitType?: unknown }).limitType : null;
  const limitValueRaw = "limitValue" in payload ? (payload as { limitValue?: unknown }).limitValue : null;

  const planTier =
    planTierValue === "free" || planTierValue === "pro" || planTierValue === "unknown" ? planTierValue : null;
  const limitType =
    limitTypeValue === "account_limit" || limitTypeValue === "transaction_limit" || limitTypeValue === "upload_limit"
      ? limitTypeValue
      : null;
  const limitValue =
    typeof limitValueRaw === "number" && Number.isFinite(limitValueRaw) ? limitValueRaw : limitValueRaw === null ? null : null;

  if (!planTier || !limitType) {
    return null;
  }

  return {
    planTier,
    limitType,
    limitValue,
  };
};

export const parsePlanLimitMessage = (
  message: string | null | undefined,
  fallbackPlanTier: ClientPlanTier = "unknown"
): PlanLimitPayload | null => {
  if (!message) {
    return null;
  }

  const normalized = message.toLowerCase();
  const limitMatch = message.match(/up to\s+([\d,]+)/i);
  const parsedLimitValue = limitMatch ? Number(limitMatch[1].replaceAll(",", "")) : null;
  const limitValue = typeof parsedLimitValue === "number" && Number.isFinite(parsedLimitValue) ? parsedLimitValue : null;

  if (normalized.includes("non-cash accounts")) {
    return {
      planTier: fallbackPlanTier,
      limitType: "account_limit",
      limitValue,
    };
  }

  if (normalized.includes("transaction rows")) {
    return {
      planTier: fallbackPlanTier,
      limitType: "transaction_limit",
      limitValue,
    };
  }

  if (normalized.includes("monthly uploads") || normalized.includes("upload limit")) {
    return {
      planTier: fallbackPlanTier,
      limitType: "upload_limit",
      limitValue,
    };
  }

  return null;
};

export const getPlanLimitNudgeCopy = ({ planTier, limitType, limitValue }: PlanLimitPayload): PlanLimitNudgeCopy => {
  const limitText = typeof limitValue === "number" ? limitValue.toLocaleString() : "the current";

  if (limitType === "account_limit") {
    if (planTier === "free") {
      return {
        eyebrow: "Account limit reached",
        title: "You’ve filled your 5-account space on Free.",
        body: "Upgrade to Pro to unlock up to 20 accounts and keep bringing more banks, wallets, and cards into one view.",
        ctaLabel: "Upgrade to Pro",
        ctaHref: "/pricing",
      };
    }

    return {
      eyebrow: "Account limit reached",
      title: `You’ve reached the current ${limitText}-account limit on Pro.`,
      body: "You can remove an account to make room, or manage billing if you need more headroom.",
      ctaLabel: "Manage billing",
      ctaHref: "/settings#billing",
    };
  }

  if (limitType === "transaction_limit") {
    if (planTier === "free") {
      return {
        eyebrow: "Transaction limit reached",
        title: "You’ve reached the 1,000-row limit on Free.",
        body: "Upgrade to Pro to keep importing and adding more transaction history without trimming your timeline.",
        ctaLabel: "Upgrade to Pro",
        ctaHref: "/pricing",
      };
    }

    return {
      eyebrow: "Transaction limit reached",
      title: "You’ve reached the current transaction limit.",
      body: "You can keep working with what’s here, or manage billing if you need more room for a larger history.",
      ctaLabel: "Manage billing",
      ctaHref: "/settings#billing",
    };
  }

  if (planTier === "free") {
    return {
      eyebrow: "Upload limit reached",
      title: "You’ve used this month’s 10-upload room on Free.",
      body: "Upgrade to Pro to unlock more monthly statement uploads and keep importing without waiting for the next cycle.",
      ctaLabel: "Upgrade to Pro",
      ctaHref: "/pricing",
    };
  }

  return {
    eyebrow: "Upload limit reached",
    title: `You’ve reached the current ${limitText}-upload limit on Pro for this month.`,
    body: "Uploads will open back up next month, or you can manage billing if you need more room now.",
    ctaLabel: "Manage billing",
    ctaHref: "/settings#billing",
  };
};

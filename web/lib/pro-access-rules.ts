export function addCalendarMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export type AccessInput = {
  stagingQaAccess?: boolean;
  planTier: "free" | "pro" | "premium";
  planTierLocked: boolean;
  subscription: {
    status: string;
    planTier?: "free" | "pro" | "premium";
    interval: string | null;
    paidThrough: Date | null;
  } | null;
  storeAccess?: { planTier?: "pro" | "premium"; expiresAt: Date | null; renewing: boolean } | null;
  grants: { startsAt: Date; endsAt: Date; revokedAt: Date | null }[];
};

export function calculateProAccess(input: AccessInput, now = new Date()) {
  const activeGrants = input.grants.filter(
    (g) => !g.revokedAt && g.startsAt <= now && g.endsAt > now,
  );
  const paidThrough = input.subscription?.paidThrough ?? null;
  const storePaid = Boolean(input.storeAccess?.expiresAt && input.storeAccess.expiresAt > now);
  const subscriptionRenewing = input.subscription?.status === "active" && Boolean(input.subscription.interval);
  const subscriptionPaid = subscriptionRenewing || Boolean(paidThrough && paidThrough > now);
  const renewing = (storePaid && input.storeAccess!.renewing) || subscriptionRenewing;
  const paid = storePaid || subscriptionPaid;
  const premiumPaid = (subscriptionPaid && input.subscription?.planTier === "premium") ||
    (storePaid && input.storeAccess?.planTier === "premium");
  const planTier: AccessInput["planTier"] = input.stagingQaAccess ? "pro"
    : input.planTierLocked ? input.planTier
    : premiumPaid ? "premium"
    : paid || activeGrants.length > 0 ? "pro" : "free";
  let end: Date | null =
    paidThrough && paidThrough > now
      ? paidThrough
      : (activeGrants[0]?.endsAt ?? null);
  if (storePaid && (!end || input.storeAccess!.expiresAt! > end)) end = input.storeAccess!.expiresAt;
  // Include only contiguous grants; a future, disconnected grant isn't current access.
  for (const grant of [...input.grants]
    .filter((g) => !g.revokedAt)
    .sort((a, b) => +a.startsAt - +b.startsAt)) {
    if (end && grant.startsAt <= end && grant.endsAt > end) end = grant.endsAt;
  }
  return {
    planTier,
    renewing,
    paidThrough,
    accessEndsAt: input.stagingQaAccess || input.planTierLocked || renewing ? null : end,
    source: input.stagingQaAccess
      ? "staging QA override"
      : input.planTierLocked
      ? "manual override"
      : paid && activeGrants.length
        ? "paid + complimentary"
        : paid
          ? "paid"
          : activeGrants.length
            ? "complimentary"
            : "free",
  };
}

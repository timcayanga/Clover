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
  planTier: "free" | "pro";
  planTierLocked: boolean;
  subscription: {
    status: string;
    interval: string | null;
    paidThrough: Date | null;
  } | null;
  grants: { startsAt: Date; endsAt: Date; revokedAt: Date | null }[];
};

export function calculateProAccess(input: AccessInput, now = new Date()) {
  const activeGrants = input.grants.filter(
    (g) => !g.revokedAt && g.startsAt <= now && g.endsAt > now,
  );
  const paidThrough = input.subscription?.paidThrough ?? null;
  const renewing =
    input.subscription?.status === "active" &&
    Boolean(input.subscription.interval);
  const paid = renewing || Boolean(paidThrough && paidThrough > now);
  const pro = input.planTierLocked
    ? input.planTier === "pro"
    : paid || activeGrants.length > 0;
  let end =
    paidThrough && paidThrough > now
      ? paidThrough
      : (activeGrants[0]?.endsAt ?? null);
  // Include only contiguous grants; a future, disconnected grant isn't current access.
  for (const grant of [...input.grants]
    .filter((g) => !g.revokedAt)
    .sort((a, b) => +a.startsAt - +b.startsAt)) {
    if (end && grant.startsAt <= end && grant.endsAt > end) end = grant.endsAt;
  }
  return {
    planTier: pro ? ("pro" as const) : ("free" as const),
    renewing,
    paidThrough,
    accessEndsAt: input.planTierLocked || renewing ? null : end,
    source: input.planTierLocked
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

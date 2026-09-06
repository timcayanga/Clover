import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  addCalendarMonths,
  calculateProAccess,
  type AccessInput,
} from "../lib/pro-access-rules";
import { campaignEligibility, campaignRulesSchema } from "../lib/growth-rules";
const now = new Date("2026-09-06T10:00:00Z");
const input: AccessInput = {
  planTier: "free",
  planTierLocked: false,
  subscription: null,
  grants: [],
};
assert.equal(
  addCalendarMonths(new Date("2026-01-31T10:12:00Z"), 1).toISOString(),
  "2026-02-28T10:12:00.000Z",
);
assert.equal(
  addCalendarMonths(new Date("2028-01-31T10:12:00Z"), 1).toISOString(),
  "2028-02-29T10:12:00.000Z",
);
const paidThrough = new Date("2026-10-06T10:00:00Z");
assert.equal(
  calculateProAccess(
    {
      ...input,
      subscription: { status: "cancelled", interval: "monthly", paidThrough },
    },
    now,
  ).planTier,
  "pro",
);
assert.equal(
  calculateProAccess(
    {
      ...input,
      subscription: {
        status: "cancelled",
        interval: "monthly",
        paidThrough: now,
      },
    },
    now,
  ).planTier,
  "free",
);
assert.equal(
  calculateProAccess(
    {
      ...input,
      subscription: { status: "active", interval: null, paidThrough: null },
    },
    now,
  ).planTier,
  "free",
);
const grant = { startsAt: now, endsAt: paidThrough, revokedAt: null };
assert.equal(
  calculateProAccess({ ...input, grants: [grant] }, now).source,
  "complimentary",
);
assert.equal(
  calculateProAccess({ ...input, grants: [{ ...grant, revokedAt: now }] }, now)
    .planTier,
  "free",
);
assert.equal(
  calculateProAccess(
    { ...input, grants: [{ ...grant, startsAt: paidThrough }] },
    now,
  ).planTier,
  "free",
);
assert.equal(
  calculateProAccess({ ...input, planTier: "pro", planTierLocked: true }, now)
    .source,
  "manual override",
);
assert.equal(
  calculateProAccess({ ...input, planTierLocked: true, grants: [grant] }, now)
    .planTier,
  "free",
);
const next = addCalendarMonths(paidThrough, 1);
assert.equal(
  calculateProAccess(
    {
      ...input,
      grants: [grant, { ...grant, startsAt: paidThrough, endsAt: next }],
    },
    now,
  ).accessEndsAt?.toISOString(),
  next.toISOString(),
);
const campaign = {
  status: "active",
  startsAt: now,
  endsAt: paidThrough,
  rules: campaignRulesSchema.parse({
    countries: ["PH"],
    intervals: ["annual"],
  }),
};
assert.equal(campaignEligibility(campaign, "annual", "PH", now), null);
assert.ok(
  campaignEligibility({ ...campaign, status: "paused" }, "annual", "PH", now),
);
assert.ok(campaignEligibility(campaign, "monthly", "PH", now));
assert.ok(campaignEligibility(campaign, "annual", "US", now));
assert.ok(campaignEligibility(campaign, "annual", "PH", paidThrough));
const source = (p: string) => readFileSync(p, "utf8");
assert.match(source("lib/growth.ts"), /pg_advisory_xact_lock/);
assert.match(source("lib/growth.ts"), /existing\?\.reversedAt/);
assert.match(source("lib/growth.ts"), /checkout\.userId !== payment\.userId/);
assert.match(source("lib/growth.ts"), /checkout\.planId !== payment\.planId/);
assert.match(
  source("app/api/admin/campaigns/route.ts"),
  /before\?\.publishedAt/,
);
assert.match(
  source("app/api/billing/paypal/webhook/route.ts"),
  /if \(!verified\)[\s\S]*handlePayPalGrowth\(body\)/,
);
assert.match(
  source("app/api/billing/paddle/webhook/route.ts"),
  /if \(!verified\)[\s\S]*handlePaddleGrowth\(event\)/,
);
assert.match(
  source("app/api/billing/paypal/cancel/route.ts"),
  /refreshProAccess\(user.id\)/,
);
console.log(
  "Pro access, calendar rewards, campaign eligibility, and webhook safety checks passed.",
);

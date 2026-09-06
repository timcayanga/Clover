import { z } from "zod";

export const campaignRulesSchema = z.object({
  months: z.number().int().min(1).max(12).default(1),
  holdDays: z.number().int().min(0).max(90).default(14),
  purchaseDays: z.number().int().min(1).max(90).default(30),
  redemptionDays: z.number().int().min(1).max(730).nullable().default(null),
  maxPerReferrer: z.number().int().min(1).max(1000).default(12),
  maxRewards: z.number().int().min(1).max(100000).default(1000),
  intervals: z
    .array(z.enum(["monthly", "annual"]))
    .min(1)
    .default(["monthly", "annual"]),
  countries: z
    .array(z.string().regex(/^[A-Z]{2}$/))
    .max(250)
    .default([]),
});
export const campaignSchema = z
  .object({
    name: z.string().trim().min(3).max(100),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    terms: z.string().trim().min(40).max(12000),
    rules: campaignRulesSchema,
  })
  .refine(
    (v) => new Date(v.endsAt) > new Date(v.startsAt),
    "End date must follow start date.",
  );
export const reasonSchema = z.string().trim().min(5).max(1000);
export const jsonSnapshot = (value: unknown) =>
  JSON.parse(JSON.stringify(value));

export function campaignEligibility(
  campaign: { status: string; startsAt: Date; endsAt: Date; rules: unknown },
  interval: string,
  country: string,
  now = new Date(),
) {
  if (campaign.status !== "active" && campaign.status !== "scheduled")
    return "This campaign is not accepting referrals.";
  if (now < campaign.startsAt || now >= campaign.endsAt)
    return "This campaign is outside its validity period.";
  const rules = campaignRulesSchema.parse(campaign.rules);
  if (!rules.intervals.includes(interval as "monthly" | "annual"))
    return "This billing interval is not eligible.";
  if (rules.countries.length && !rules.countries.includes(country))
    return "This campaign is not available in your region.";
  return null;
}

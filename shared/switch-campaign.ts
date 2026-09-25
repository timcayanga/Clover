export const SWITCH_REWARD_DAYS = 30;
export const SWITCH_CLAIM_DAYS = 7;
export const SWITCH_PATH = "/settings/plan/switch-to-clover";
export const SWITCH_TERMS = "One 30-day Clover Plus reward per eligible verified Free user, subject to receipt review. Paid budgeting or personal-finance app purchases qualify; free trials and refunded purchases do not. Existing paid subscribers are excluded. Activate within seven days of approval. No payment details or automatic renewal are required. Existing records remain accessible after expiry; bank connections require eligible paid access. Unused promotional days have no cash value. Evidence is private, reviewed for this offer, and deleted after 90 days; application and reward records remain for eligibility and audit.";
export const dayMs = 86_400_000;
export function occupiesCampaignPlace(app: { activatedAt: Date | null; status: string; claimBy: Date | null }, now: Date) {
  return Boolean(app.activatedAt || (app.status === "approved" && app.claimBy && app.claimBy > now));
}
export function campaignOpen(c: {status: string; endsAt: Date | null}, now: Date) {
  return c.status === "active" && (!c.endsAt || c.endsAt > now);
}
export function applicationStatus(a: {status: string; activatedAt: Date | null; expiresAt: Date | null; claimBy: Date | null}, now: Date) {
  if (a.activatedAt && a.expiresAt && a.expiresAt <= now) return "expired";
  if (a.status === "approved" && a.claimBy && a.claimBy <= now) return "claim_expired";
  return a.status;
}

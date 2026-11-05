/** Measurement only. These rules never grant access or change customer records. */
export const MEASUREMENT_VERSION = 1;
// Owner/demo identities explicitly used in Clover's launch testing. Server only.
const staffEmails = ["hello@clover.ph", "timcayanga@gmail.com"];
const testEmails = ["review@clover.ph", "reviewer@clover.ph", "tc97531@gmail.com", "tigercayanga@gmail.com"];
export const syntheticIds = ["local-admin", "staging-guest", "seed-demo-user", "user_3JJ1IGtRLHyU8hwh7AIRM8xAh8z", "user_3Jn5l6dedVoPWWZnTP74VJpspEf"];
export const syntheticSuffixes = ["@placeholder.local", "@example.com", "@example.invalid"];
const list = (raw?: string) => (raw ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
const ids = (raw?: string) => (raw ?? "").split(",").map(x => x.trim()).filter(Boolean);
export function measurementConfig() {
  return {
    staffEmails: [...new Set([...staffEmails, ...list(process.env.ADMIN_EMAILS), ...list(process.env.ANALYTICS_STAFF_EMAILS)])],
    testEmails: [...new Set([...testEmails, ...list(process.env.ANALYTICS_TEST_EMAILS)])],
    staffIds: [...new Set([...ids(process.env.ADMIN_USER_IDS), ...ids(process.env.ADMIN_ONLY_USER_IDS)])],
    testIds: [...new Set([...syntheticIds, ...ids(process.env.ANALYTICS_TEST_USER_IDS)])],
  };
}
export function audienceProperties(audience: "staff" | "test" | "customer" | "unknown") {
  return { analytics_audience: audience, analytics_excluded: audience !== "customer", analytics_audience_version: MEASUREMENT_VERSION };
}
export function classifyAnalyticsIdentity(identity: { clerkUserId: string; email: string }, assignedStaff = false) {
  const config = measurementConfig(), email = identity.email.trim().toLowerCase(), id = identity.clerkUserId.toLowerCase();
  if (assignedStaff || config.staffIds.some(x => x.toLowerCase() === id) || config.staffEmails.includes(email)) return audienceProperties("staff");
  if (config.testIds.some(x => x.toLowerCase() === id) || config.testEmails.includes(email) || syntheticSuffixes.some(s => email.endsWith(s))) return audienceProperties("test");
  return audienceProperties("customer");
}

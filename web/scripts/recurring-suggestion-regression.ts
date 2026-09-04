import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectRecurringPatterns, buildRecurringMerchantFamilySignature } from "../lib/recurring-detection";
import { suggestRecurringTitle, isRecurringSuggestionCurrent, getRecurringSuggestionCategory } from "../lib/recurring-suggestion-policy";

const now = new Date("2026-09-03T12:00:00Z");
const rows = (dates: string[], merchant = "Apple.com/Bill") => dates.map((date, index) => ({
  id: `tx-${index}`, workspaceId: "test-workspace", accountId: "test-account", date: new Date(`${date}T12:00:00Z`),
  amount: 199, currency: "PHP", type: "expense" as const, merchantRaw: merchant, merchantClean: merchant,
  category: { name: "Subscriptions" }, account: { id: "test-account", name: "Card", institution: "Bank" },
}));
assert.equal(suggestRecurringTitle("Apple.com/Bill"), "Apple");
assert.equal(suggestRecurringTitle("Scribd R 690061887 Scribd.com US"), "Scribd");
assert.equal(suggestRecurringTitle("Apple Music Subscription"), "Apple Music");
assert.equal(suggestRecurringTitle("iCloud storage"), "iCloud");
assert.equal(suggestRecurringTitle("Maria's apartment rent"), "Maria's apartment rent");
assert.equal(suggestRecurringTitle("PAYPAL"), "PAYPAL", "Never invent the underlying merchant.");
assert.equal(buildRecurringMerchantFamilySignature("Apple.com/Bill"), buildRecurringMerchantFamilySignature("Apple"));
assert.equal(getRecurringSuggestionCategory(["Other", "Subscriptions", "Subscriptions", "Shopping"]), "Subscriptions");
assert.equal(getRecurringSuggestionCategory([], ["utility"]), "Bills & Utilities");
assert.equal(isRecurringSuggestionCurrent("2026-06-08", "monthly", now), false);
assert.equal(isRecurringSuggestionCurrent("2026-08-08", "monthly", now), true);
assert.equal(isRecurringSuggestionCurrent(null, "monthly", now), false);
assert.equal(isRecurringSuggestionCurrent("2027-01-01", "monthly", now), false);
const monthly = detectRecurringPatterns(rows(["2026-06-08", "2026-07-09", "2026-08-08"]), now);
assert.equal(monthly.length, 1);
assert.equal(monthly[0].frequency, "monthly");
assert.equal(monthly[0].canonicalTitle, "Apple");
assert.equal(monthly[0].categoryName, "Subscriptions");
assert.equal(detectRecurringPatterns(rows(["2026-04-08", "2026-05-08", "2026-06-08"]), now).length, 0, "Do not roll a stopped bill forward forever.");
const annual = detectRecurringPatterns(rows(["2024-10-03", "2025-10-05"], "Adobe annual subscription"), now);
assert.equal(annual.length, 1, "Retain annual renewals with evidence older than 400 days.");
assert.equal(annual[0].frequency, "annual");
assert.equal(annual[0].transactionIds.length, 2);
assert.equal(detectRecurringPatterns(rows(["2024-04-03", "2025-04-03"], "Adobe annual subscription"), now).length, 0, "Hide a missed annual renewal after its grace period.");
assert.equal(detectRecurringPatterns(rows(["2025-07-03", "2026-05-03"], "Adobe subscription"), now).length, 0, "Ten-month gaps are not annual renewals.");
assert.equal(detectRecurringPatterns(rows(["2026-08-03"]), now).length, 0, "One charge does not establish a cadence.");
const shopping = rows(["2026-07-03", "2026-08-03"], "Coffee Corner").map((row) => ({ ...row, category: { name: "Food & Dining" } }));
assert.equal(detectRecurringPatterns(shopping, now).length, 0);
const panel = readFileSync("components/commitments-panel.tsx", "utf8");
assert.match(panel, /if \(!search\) return \[\]/, "Don't show unrelated transactions before searching.");
assert.match(panel, /Not a recurring payment/);
assert.match(panel, /recurring-overview-list__item--suggestion[\s\S]*CategoryBrandMark/);
const route = readFileSync("app/api/recurring-suggestions/dismiss/route.ts", "utf8");
assert.match(route, /assertTrustedRequestOrigin\(request\)/);
assert.match(route, /assertWorkspaceAccess\(userId, body.workspaceId\)/);
assert.match(route, /getPlannedPaymentSuggestions\(body.workspaceId\)/);
assert.match(route, /upsert/);
assert.doesNotMatch(route, /financialCommitment\.(delete|update)|transaction\.(delete|update)/);
console.log("Recurring suggestion regression passed: titles, freshness, annual cadence, evidence, icons, search, and protected dismissal.");

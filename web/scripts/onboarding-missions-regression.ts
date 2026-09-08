import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildHomeNextSteps } from "../lib/home-next-steps";

const root = process.cwd();
const missionSource = readFileSync(resolve(root, "lib/onboarding-missions.ts"), "utf8");
const apiSource = readFileSync(resolve(root, "app/api/onboarding/missions/route.ts"), "utf8");
const componentSource = readFileSync(resolve(root, "components/onboarding-missions.tsx"), "utf8");
const trackerSource = readFileSync(resolve(root, "components/onboarding-mission-tracker.tsx"), "utf8");

assert.match(missionSource, /importCount > 0 \|\| \(manualAccountCount > 0 && manualTransactionCount > 0\)/);
assert.match(missionSource, /transaction_updated/);
assert.match(missionSource, /source: "recurring_detection"/);
assert.match(missionSource, /recurringSuggestionCount > 0 \|\| recurringCount > 0/);
assert.match(missionSource, /hasData && actions\.has\("onboarding_mission\.check_data"\)/);
assert.match(missionSource, /hasData && actions\.has\("onboarding_mission\.open_insights"\)/);
assert.doesNotMatch(missionSource, /\.update\(|\.delete\(|\.create\(/, "Mission derivation must remain read-only.");

assert.match(apiSource, /assertTrustedRequestOrigin/);
assert.match(apiSource, /findFirst/);
assert.match(apiSource, /onboarding_mission\.dismissed/);
assert.match(apiSource, /onboarding_mission_completed/);
assert.match(componentSource, /onboarding_mission_started/);
assert.match(componentSource, /surface: "home" \| "notifications"/);
assert.match(trackerSource, /pathname === "\/accounts" \|\| pathname === "\/transactions"/);
assert.match(trackerSource, /pathname === "\/adviser" \|\| pathname === "\/reports"/);

console.log("Onboarding missions regression passed.");

// Home must disappear once all live reviews have been resolved, regardless of
// historical onboarding completion or whether any recurring payment was kept.
assert.deepEqual(buildHomeNextSteps({ transactionCount: 0, recurringCount: 0, statementCount: 0 }), []);
assert.deepEqual(
  buildHomeNextSteps({ transactionCount: 3, recurringCount: 2, statementCount: 1 }).map(({ id, count }) => ({ id, count })),
  [{ id: "transactions", count: 3 }, { id: "recurring", count: 2 }, { id: "statements", count: 1 }],
);
assert.deepEqual(
  buildHomeNextSteps({ transactionCount: 3, recurringCount: 0, statementCount: 0 }).map(({ id }) => id),
  ["transactions"],
);
assert.match(missionSource, /getPlannedPaymentSuggestions\(workspaceId\)/);
assert.doesNotMatch(missionSource, /prisma\.recurringPattern\.count/);
assert.match(missionSource, /confirm_recurring: hasData && recurringSuggestionCount === 0/);

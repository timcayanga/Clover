import assert from "node:assert/strict";
import { detectGoalIntent, parseGoalIntentAmount } from "@/lib/goal-intent";

assert.equal(detectGoalIntent("QA UAT Emergency Fund 20260728"), "build_emergency_fund");
assert.equal(detectGoalIntent("Build an index fund portfolio"), "invest_better");
assert.equal(parseGoalIntentAmount("QA UAT Emergency Fund 20260728"), null);
assert.equal(parseGoalIntentAmount("Save 25k for a phone"), 25_000);
assert.equal(parseGoalIntentAmount("Target 15000 for travel"), 15_000);
assert.equal(parseGoalIntentAmount("PHP 12,345.50 emergency fund"), 12_345.5);

console.log("Goal intent regression passed.");

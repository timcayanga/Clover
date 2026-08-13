import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FEATURE_FUNNEL_DEFINITIONS } from "../lib/feature-adoption";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const expectedFeatures = [
  "Authentication",
  "Onboarding",
  "Home",
  "Accounts",
  "Transactions",
  "Imports",
  "Review Queue",
  "Recurring",
  "Adviser",
  "Reports",
  "Split Bills",
  "Circles",
  "Budgeting",
  "Goals",
  "Investments",
  "Notifications",
  "Settings",
  "Help and Support",
  "Categories and Rules",
  "Profiles and Workspaces",
  "Billing and Plans",
];

assert.deepEqual(FEATURE_FUNNEL_DEFINITIONS.map((feature) => feature.label), expectedFeatures);
assert.ok(FEATURE_FUNNEL_DEFINITIONS.every((feature) => feature.steps.length >= 2));
assert.ok(FEATURE_FUNNEL_DEFINITIONS.some((feature) => feature.key === "recurring" && feature.steps.length >= 4));

const querySource = readSource("lib/posthog-query.ts");
assert.match(querySource, /getPostHogFeatureFunnels/);
assert.match(querySource, /countIf\(.*_hit/s);
assert.match(querySource, /GROUP BY person_id/);
assert.match(querySource, /_at >= .*_at/);
assert.match(querySource, /timestamp < toDateTime\('\$\{rangeEnd\}'\)/);

const commandCenterSource = readSource("components/admin-command-center.tsx");
assert.match(commandCenterSource, /className="admin-feature-line"/);
assert.match(commandCenterSource, /className="admin-feature-line__chart"/);
assert.match(commandCenterSource, /viewers are 100%/);
assert.match(commandCenterSource, /name="adoptionFrom"/);
assert.match(commandCenterSource, /name="adoptionTo"/);
assert.match(commandCenterSource, /type="date"/);
assert.match(commandCenterSource, /point\.rate/);

console.log("Admin feature adoption regression passed.");

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const commandCenter = readSource("lib/admin-command-center.ts");
const analytics = readSource("lib/admin-analytics.ts");
const commandCenterUi = readSource("components/admin-command-center.tsx");
const analyticsUi = readSource("components/admin-analytics-workspace.tsx");

for (const source of [commandCenter, analytics]) {
  assert.match(source, /name: "Activation"/);
  assert.match(source, /name: "Core tracking"/);
  assert.match(source, /label: "Started tracking"/);
  assert.match(source, /label: "Transactions available"|label: "Has transactions"/);
  assert.match(source, /label: "Added data in 30d"/);
  assert.doesNotMatch(source, /name: "Import success"|name: "Import magic"/);
}

assert.match(commandCenter, /OR:\s*\[\s*\{ accounts: \{ some: \{\} \} \},\s*\{ transactions: \{ some: activeTransaction \} \}/);
assert.match(analytics, /OR:\s*\[\s*\{ accounts: \{ some: \{ createdAt: \{ gte: betaStartedAt \} \} \} \},\s*\{ transactions: \{ some: betaTransaction \} \}/);
assert.match(commandCenterUi, /Math\.min\(100, Math\.round/);
assert.match(commandCenterUi, /Math\.min\(100, Math\.max/);
assert.match(analyticsUi, /Math\.min\(100, Math\.round/);
assert.match(analyticsUi, /Activation and core tracking/);

console.log("Admin core funnel regression passed.");

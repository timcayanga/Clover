import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveTrackedCommitmentDueDate, toCommitmentOccurrenceKey } from "../lib/commitment-occurrences";

const webRoot = process.cwd();
const panelSource = readFileSync(join(webRoot, "components", "commitments-panel.tsx"), "utf8");
const pageSource = readFileSync(join(webRoot, "lib", "recurring-page.ts"), "utf8");
const stylesSource = readFileSync(join(webRoot, "app", "globals.css"), "utf8");

assert.match(panelSource, /<th>Category<\/th>/, "Recurring subtabs must expose category data.");
assert.match(panelSource, /CategoryBrandMark/, "Recurring categories must use Clover's transaction-style category marks.");
assert.match(panelSource, /recurring-occurrence-check/, "Recurring status must use occurrence checkboxes.");
assert.match(panelSource, /commitment\.kind === "receivable"[\s\S]{0,180}"Received"/, "Receivables must distinguish received money from paid obligations.");
assert.match(panelSource, /commitment\.account \?\? commitment\.inferredAccount/, "Recurring rows must show reliable inferred accounts.");
assert.match(pageSource, /categorySource: evidenceTransaction\?\.category\?\.name \? "transaction"/, "Transaction categories must take precedence over fallback categories.");
assert.match(pageSource, /bestMatch\.score >= runnerUp\.score \+ 2/, "Ambiguous account matches must stay unconfirmed.");
assert.match(stylesSource, /transactions-table\.commitments-table thead th[\s\S]{0,180}position: sticky/, "Recurring table headers must remain sticky.");

const beforeNextWindow = resolveTrackedCommitmentDueDate({
  dueDate: new Date("2026-08-10T00:00:00.000Z"),
  nextDueDate: new Date("2026-08-10T00:00:00.000Z"),
  recurrence: "monthly",
  now: new Date("2026-08-20T00:00:00.000Z"),
});
assert.equal(toCommitmentOccurrenceKey(beforeNextWindow!), "2026-08-10", "A completed month must remain active before the next seven-day window.");

const insideNextWindow = resolveTrackedCommitmentDueDate({
  dueDate: new Date("2026-08-10T00:00:00.000Z"),
  nextDueDate: new Date("2026-08-10T00:00:00.000Z"),
  recurrence: "monthly",
  now: new Date("2026-09-03T00:00:00.000Z"),
});
assert.equal(toCommitmentOccurrenceKey(insideNextWindow!), "2026-09-10", "A new month must become pending inside its seven-day due window.");

const quarterlyWindow = resolveTrackedCommitmentDueDate({
  dueDate: new Date("2026-06-30T00:00:00.000Z"),
  nextDueDate: new Date("2026-06-30T00:00:00.000Z"),
  recurrence: "quarterly",
  now: new Date("2026-09-24T00:00:00.000Z"),
});
assert.equal(toCommitmentOccurrenceKey(quarterlyWindow!), "2026-09-30", "The occurrence window must work for non-monthly recurring items too.");

console.log("Recurring ledger regression passed.");

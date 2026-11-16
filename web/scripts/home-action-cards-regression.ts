import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCommitmentOccurrenceDate,
  resolveRelevantCommitmentDueDate,
  toCommitmentOccurrenceKey,
} from "../lib/commitment-occurrences";
import { getTransactionReviewReasons } from "../lib/transaction-review-reasons";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(scriptDir, "..");
const dashboardSource = readFileSync(join(webRoot, "app", "dashboard", "page.tsx"), "utf8");
const cardSource = readFileSync(join(webRoot, "components", "home-recurring-payments-card.tsx"), "utf8");
const transactionReviewCardSource = readFileSync(join(webRoot, "components", "home-transaction-review-card.tsx"), "utf8");
const transactionReviewLauncherSource = readFileSync(join(webRoot, "components", "home-transaction-review-launcher.tsx"), "utf8");
const completionRouteSource = readFileSync(
  join(webRoot, "app", "api", "commitments", "[commitmentId]", "completion", "route.ts"),
  "utf8"
);
const migrationSource = readFileSync(
  join(webRoot, "prisma", "migrations", "20260803090000_financial_commitment_occurrences", "migration.sql"),
  "utf8"
);

const julyOccurrence = resolveRelevantCommitmentDueDate({
  dueDate: new Date("2026-01-31T00:00:00.000Z"),
  nextDueDate: null,
  recurrence: "monthly",
  now: new Date("2026-08-03T00:00:00.000Z"),
});
assert.equal(toCommitmentOccurrenceKey(julyOccurrence!), "2026-07-31");

const augustOccurrence = resolveRelevantCommitmentDueDate({
  dueDate: new Date("2026-01-31T00:00:00.000Z"),
  nextDueDate: null,
  recurrence: "monthly",
  now: new Date("2026-08-08T00:00:00.000Z"),
});
assert.equal(toCommitmentOccurrenceKey(augustOccurrence!), "2026-08-31");
assert.equal(parseCommitmentOccurrenceDate("2026-08-31")?.toISOString(), "2026-08-31T00:00:00.000Z");
assert.equal(parseCommitmentOccurrenceDate("31/08/2026"), null);
assert.equal(parseCommitmentOccurrenceDate("2026-02-31"), null);

assert.doesNotMatch(dashboardSource, /recurringWatchProgress|recurringWatchCount/);
assert.match(dashboardSource, /<HomeRecurringPaymentsCard/);
assert.match(dashboardSource, /getDashboardTransactionReviewReasons/);
assert.match(dashboardSource, /<HomeTransactionReviewLauncher/);
assert.doesNotMatch(dashboardSource, /href=\{`\/transactions\?review=/);
assert.match(dashboardSource, /reviewAttentionTransactions\.slice\(0, 3\)/);
assert.match(transactionReviewCardSource, /role="dialog"/);
assert.match(transactionReviewLauncherSource, /dynamic\(/);
assert.match(transactionReviewLauncherSource, /onPointerEnter=\{\(\) => prefetchDetail\(transaction\.id\)\}/);
assert.match(transactionReviewCardSource, /method: "PATCH"/);
assert.match(transactionReviewCardSource, /router\.refresh\(\)/);
assert.doesNotMatch(transactionReviewCardSource, /router\.(push|replace)\(/);
assert.match(cardSource, /role="checkbox"/);
assert.match(cardSource, /\/api\/commitments\/\$\{item\.id\}\/completion/);
assert.match(cardSource, /href="\/recurring\?tab=planned">Review/);

assert.match(completionRouteSource, /assertTrustedRequestOrigin\(request\)/);
assert.match(completionRouteSource, /assertWorkspaceAccess\(userId, commitment\.workspaceId\)/);
assert.match(completionRouteSource, /financialCommitmentOccurrence\.upsert/);
assert.match(completionRouteSource, /financialCommitmentOccurrence\.deleteMany/);
assert.match(migrationSource, /UNIQUE INDEX "FinancialCommitmentOccurrence_commitmentId_dueDate_key"/);
assert.match(migrationSource, /ENABLE ROW LEVEL SECURITY/);
assert.match(migrationSource, /REVOKE ALL ON TABLE "FinancialCommitmentOccurrence" FROM anon, authenticated/);

assert.deepEqual(
  getTransactionReviewReasons({
    reviewStatus: "suggested",
    categoryId: "category-shopping",
    categoryName: "Shopping",
    parserConfidence: 92,
    categoryConfidence: 92,
    accountMatchConfidence: 92,
    duplicateConfidence: 0,
    merchantRaw: "Sample merchant",
    merchantClean: "Sample merchant",
  }),
  [],
  "High-confidence suggested transactions must not appear as Home review errors."
);
assert.ok(
  getTransactionReviewReasons({
    reviewStatus: "pending_review",
    categoryId: null,
    categoryName: null,
    parserConfidence: 92,
    categoryConfidence: 0,
    accountMatchConfidence: 92,
    duplicateConfidence: 0,
    merchantRaw: "Sample merchant",
  }).includes("Needs category review"),
  "Transactions with a concrete review issue must remain visible on Home."
);

console.log("Home action cards regression passed.");

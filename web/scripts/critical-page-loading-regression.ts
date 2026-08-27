import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  guessCategoryName,
  inferAccountTypeFromStatement,
} from "../lib/financial-classification";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const shellSource = readSource("components/clover-shell.tsx");
assert.match(shellSource, /dynamic\(\s*\(\) => import\("@\/components\/import-files-modal"\)/);
assert.doesNotMatch(shellSource, /^import \{ ImportFilesModal \} from "@\/components\/import-files-modal";/m);
assert.doesNotMatch(shellSource, /^import \{ DashboardManualTransactionModal \} from "@\/components\/dashboard-top-actions";/m);

const dashboardSource = readSource("app/dashboard/page.tsx");
assert.match(dashboardSource, /DashboardTopActionsLazy/);
assert.doesNotMatch(dashboardSource, /from "@\/components\/dashboard-top-actions";/);
assert.match(dashboardSource, /const todayStart = toDayStart\(now\)/);
assert.doesNotMatch(dashboardSource, /activityAnchorDate/);
assert.match(dashboardSource, /Weekly Report/);
assert.match(dashboardSource, /Monthly Report/);
assert.match(dashboardSource, /monthlyTimelineDays/);
assert.match(dashboardSource, /dashboard-home__report-flow-tooltip/);

const lazyActionsSource = readSource("components/dashboard-top-actions-lazy.tsx");
assert.match(lazyActionsSource, /dynamic\(\s*\(\) => import\("@\/components\/dashboard-top-actions"\)/);
assert.match(lazyActionsSource, /dynamic\(\s*\(\) => import\("@\/components\/import-files-modal"\)/);

const accountsSource = readSource("app/accounts/page.tsx");
assert.match(accountsSource, /awaitHydration: !hydratedFromCache/);
assert.doesNotMatch(accountsSource, /from "@\/lib\/import-parser"/);

const accountDetailsSource = readSource("app/accounts/[accountId]/page.tsx");
const transactionsSource = readSource("app/transactions/page.tsx");
const transactionDisplaySource = readSource("lib/transaction-display.ts");
const importOptimisticSummarySource = readSource("lib/import-optimistic-summary.ts");
const importStatementIdentitySource = readSource("lib/import-statement-identity.ts");
for (const source of [
  accountDetailsSource,
  transactionsSource,
  transactionDisplaySource,
  importOptimisticSummarySource,
  importStatementIdentitySource,
]) {
  assert.doesNotMatch(source, /from "@\/lib\/import-parser"/);
}

assert.equal(inferAccountTypeFromStatement("PayPal", "PayPal"), "wallet");
assert.equal(inferAccountTypeFromStatement("RCBC", "RCBC Visa Platinum"), "credit_card");
assert.equal(inferAccountTypeFromStatement("Maya", "Maya Savings"), "bank");
assert.equal(inferAccountTypeFromStatement("PDAX", "PDAX Portfolio"), "investment");
assert.equal(guessCategoryName("Service Navigo Paris", "expense"), "Transport");
assert.equal(guessCategoryName("OpenAI ChatGPT", "expense"), "Bills & Utilities");

const featuresSource = readSource("app/features/page.tsx");
const featureDetailSource = readSource("app/features/[slug]/page.tsx");
const helpSource = readSource("app/help/page.tsx");
assert.match(featuresSource, /title: "Features"/);
assert.doesNotMatch(featuresSource, /title: "Features \| Clover"/);
assert.match(featureDetailSource, /title: page\.navLabel/);
assert.doesNotMatch(featureDetailSource, /page\.navLabel\} \| Clover/);
assert.match(helpSource, /title: "Help Center"/);
assert.doesNotMatch(helpSource, /title: "Help Center \| Clover"/);

const adviserSource = readSource("app/adviser/page.tsx");
const adviserLoadingSource = readSource("app/adviser/loading.tsx");
const budgetingDataSource = readSource("lib/budgeting-data.ts");
const serverPageErrorSource = readSource("lib/server-page-error.ts");
assert.doesNotMatch(adviserSource, /accounts:\s*\{[\s\S]{0,900}transactions:\s*\{/);
assert.doesNotMatch(adviserSource, /<ReportsStream/, "Adviser must remain chat-first instead of embedding Reports.");
assert.match(adviserLoadingSource, /CloverRouteLoadingScreen label="adviser" prompt/);
assert.doesNotMatch(shellSource, /const coreRoutes = \[[^\]]*"\/adviser"/);
assert.match(adviserSource, /statementCheckpoints:[\s\S]{0,500}take: 1/);
assert.match(adviserSource, /Keep Adviser[\s\S]{0,250}reads in pairs/);
assert.doesNotMatch(
  adviserSource,
  /const \[\s*allTransactionsQuery,[\s\S]{0,250}manualAccountTransactions[\s\S]{0,80}= await Promise\.all/,
);
assert.match(budgetingDataSource, /Keep each batch within Clover's Vercel database pool limit/);
assert.doesNotMatch(
  budgetingDataSource,
  /const \[budgets, transactions, categories, accounts, commitments\] = await Promise\.all/,
);
assert.match(serverPageErrorSource, /\[clover:server-page-error\]/);

const errorBoundarySource = readSource("app/error.tsx");
const errorScreenSource = readSource("components/error-recovery-screen.tsx");
const adminErrorLogsSource = readSource("components/admin-error-logs-table.tsx");
assert.doesNotMatch(errorBoundarySource, /<p>\{error\.message\}<\/p>/);
assert.match(errorBoundarySource, /message: error\.message/);
assert.match(errorBoundarySource, /errorCode/);
assert.match(errorScreenSource, /Something went wrong/);
assert.match(errorScreenSource, /Refresh page/);
assert.match(errorScreenSource, /\/assets\/error-clover\.webp/);
assert.match(adminErrorLogsSource, /Frontend reference/);

const commitmentsSource = readSource("components/commitments-panel.tsx");
assert.match(commitmentsSource, /Why Clover suggested this/);
assert.match(commitmentsSource, /<span>Paid to<\/span>/);
assert.match(commitmentsSource, /<span>Currency<\/span>/);
assert.match(commitmentsSource, /recurring-overview-review-button/);
assert.doesNotMatch(commitmentsSource, /Add this to Recurring\?/);
assert.doesNotMatch(commitmentsSource, /overviewStats\.upcoming\.length\} scheduled/);
assert.doesNotMatch(commitmentsSource, /overviewStats\.activeCount\} active/);
assert.doesNotMatch(
  commitmentsSource,
  /actionablePlannedPaymentSuggestions\.length \+ suggestedRecurringPatterns\.length/,
);

console.log("Critical page loading regression passed.");

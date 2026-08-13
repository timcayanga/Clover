import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const adviserSource = readSource("app/adviser/page.tsx");
const adviserLoadingSource = readSource("app/adviser/loading.tsx");
assert.doesNotMatch(adviserSource, /accounts:\s*\{[\s\S]{0,900}transactions:\s*\{/);
assert.match(adviserSource, /<Suspense fallback=\{null\}>\s*<ReportsStream/);
assert.match(adviserLoadingSource, /CloverRouteLoadingScreen label="adviser" prompt/);
assert.doesNotMatch(shellSource, /const coreRoutes = \[[^\]]*"\/adviser"/);

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

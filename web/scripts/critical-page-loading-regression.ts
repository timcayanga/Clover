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

console.log("Critical page loading regression passed.");

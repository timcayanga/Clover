import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const cacheSource = read("lib/admin-page-data.ts");
const chromeSource = read("components/admin-page-chrome.tsx");
const loadingSource = read("app/admin/loading.tsx");
const dataQaSource = read("app/admin/data-qa/page.tsx");

assert.match(cacheSource, /unstable_cache/);
assert.match(cacheSource, /revalidate: 30/);
assert.match(cacheSource, /getCachedAdminCommandCenterSnapshot/);
assert.match(cacheSource, /getCachedAdminInitialUsers/);
assert.match(cacheSource, /getAdminDataEnvironment/);
assert.match(chromeSource, /prefetch/);
assert.match(loadingSource, /aria-busy="true"/);
assert.doesNotMatch(dataQaSource, /synchronizeDataQaTraining/);
assert.doesNotMatch(read("app/admin/data-qa/bank/[bankSlug]/page.tsx"), /synchronizeDataQaTraining/);
assert.match(read("components/admin-users-console.tsx"), /skipInitialUsersLoad/);

for (const page of [
  "app/admin/page.tsx",
  "app/admin/analytics/page.tsx",
  "app/admin/analysis/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/operations/page.tsx",
  "app/admin/logs/page.tsx",
  "app/admin/errors/page.tsx",
  "app/admin/inquiries/page.tsx",
  "app/admin/data-qa/page.tsx",
]) {
  assert.match(read(page), /getCachedAdmin/, `${page} should use the warm Admin data path`);
}

console.log("Admin navigation performance regression passed.");

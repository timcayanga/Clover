import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const analytics = readSource("lib/analytics.ts");
const client = readSource("components/posthog-analytics.tsx");
const queries = readSource("lib/posthog-query.ts");
const snapshot = readSource("lib/admin-analytics.ts");
const workspace = readSource("components/admin-analytics-workspace.tsx");

for (const event of ["acquisition_identified", "page_engagement", "ui_interaction"]) {
  assert.match(analytics, new RegExp(`\\| "${event}"`));
  assert.match(client, new RegExp(`safeCapture\\("${event}"`));
}

assert.match(client, /acquisition_channel/);
assert.match(client, /max_scroll_percent/);
assert.match(client, /x_percent/);
assert.match(client, /y_percent/);
assert.match(client, /target_area/);
assert.doesNotMatch(client, /\.textContent|\.innerText|target_value|input_value/);

assert.match(queries, /getPostHogGrowthAnalytics/);
assert.match(queries, /properties\.analytics_environment/);
assert.match(queries, /event = '\$pageview'/);
assert.match(queries, /event = 'page_engagement'/);
assert.match(queries, /event = 'ui_interaction'/);

assert.match(snapshot, /uniqueAccountsCreated/);
assert.match(snapshot, /prisma\.user\.count\(\{ where: \{ AND: \[productionUser/);
assert.match(workspace, /Website visits to unique account creation/);
assert.match(workspace, /Time and scroll depth by page/);
assert.match(workspace, /Click and scroll heatmaps/);
assert.match(workspace, /Input text, financial values, and clicked labels are never included/);

console.log("Admin behavior analytics regression passed: privacy, attribution, engagement, and heatmap checks.");

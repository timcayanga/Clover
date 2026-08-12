import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildImportKey } from "@/lib/import-keys";
import { getImportQueueName } from "@/lib/import-queue";

const originalVercelEnv = process.env.VERCEL_ENV;
const originalNodeEnv = process.env.NODE_ENV;

const main = async () => {
try {
  process.env.VERCEL_ENV = "production";
  assert.equal(getImportQueueName(), "import-processing");
  assert.match(buildImportKey("workspace-1", "Statement.pdf"), /^workspaces\/workspace-1\/imports\//);

  process.env.VERCEL_ENV = "preview";
  assert.equal(getImportQueueName(), "import-processing-staging");
  assert.match(buildImportKey("workspace-1", "Statement.pdf"), /^staging\/workspaces\/workspace-1\/imports\//);

  process.env.VERCEL_ENV = undefined;
  process.env.NODE_ENV = "development";
  assert.equal(getImportQueueName(), "import-processing-local");

  const root = process.cwd();
  const paypal = await readFile(join(root, "lib/paypal-billing.ts"), "utf8");
  const webhook = await readFile(join(root, "app/api/billing/paypal/webhook/route.ts"), "utf8");
  const marketHistory = await readFile(join(root, "app/api/market-history/route.ts"), "utf8");
  const analytics = await readFile(join(root, "components/posthog-analytics.tsx"), "utf8");
  const importModal = await readFile(join(root, "components/import-files-modal.tsx"), "utf8");
  const transactionsPage = await readFile(join(root, "app/transactions/page.tsx"), "utf8");
  const transactionsRoute = await readFile(join(root, "app/api/transactions/route.ts"), "utf8");
  const nextConfig = await readFile(join(root, "next.config.mjs"), "utf8");
  const middleware = await readFile(join(root, "middleware.ts"), "utf8");

  assert.match(paypal, /getBillingPlanTierForSubscription\(snapshot\.status, snapshot\.interval\)/);
  assert.match(paypal, /status === BillingSubscriptionStatus\.active && interval !== null/);
  assert.match(paypal, /where: \{ providerSubscriptionId: subscriptionId \}/);
  assert.match(paypal, /existingSubscription\?\.user\.environment === environment/);
  assert.doesNotMatch(paypal, /\{ email: identifier \}/);
  assert.doesNotMatch(paypal, /provider_subscription_id:/);
  assert.match(webhook, /MAX_PAYPAL_WEBHOOK_BYTES/);
  assert.doesNotMatch(webhook, /getPayPalDebugInfo/);
  assert.match(marketHistory, /await requireAuth\(\)/);
  assert.match(marketHistory, /market-history:\$\{userId\}/);
  assert.doesNotMatch(analytics, /\$search:/);
  assert.match(analytics, /redactAnalyticsPath/);
  assert.match(nextConfig, /Content-Security-Policy-Report-Only/);
  assert.match(nextConfig, /X-Content-Type-Options/);
  assert.match(nextConfig, /X-Frame-Options/);
  assert.match(nextConfig, /source: "\/favicon\.ico"/);
  assert.match(nextConfig, /destination: "\/favicon\.svg"/);
  assert.doesNotMatch(nextConfig, /source: "\/ph\/:path\*"/);
  assert.doesNotMatch(nextConfig, /us\.i\.posthog\.com\/:path\*/);
  assert.doesNotMatch(analytics, /return "\/ph"/);
  assert.match(middleware, /clerkMiddleware/);
  assert.doesNotMatch(middleware, /\/\(\(\?!_next/);
  assert.match(middleware, /\/\(api\|trpc\)\(\.\*\)/);
  assert.match(middleware, /"\/admin\(\.\*\)"/);
  assert.match(importModal, /IN_FLIGHT_IMPORT_PROGRESS_POLL_INTERVAL_MS = 1_500/);
  assert.match(transactionsRoute, /SELECT DISTINCT "currency"/);
  assert.doesNotMatch(transactionsRoute, /distinct: \["currency"\]/);
  assert.doesNotMatch(transactionsPage, /pageSizeOverride: 200/);

  console.log("Integration security regression passed.");
} finally {
  process.env.VERCEL_ENV = originalVercelEnv;
  process.env.NODE_ENV = originalNodeEnv;
}
};

void main();

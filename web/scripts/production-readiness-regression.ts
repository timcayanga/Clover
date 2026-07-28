import assert from "node:assert/strict";
import { buildProductionReadinessReport } from "@/lib/production-readiness";

const completeEnvironment = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_test",
  CLERK_SECRET_KEY: "sk_live_test",
  DATABASE_URL: "postgresql://runtime",
  DIRECT_URL: "postgresql://migration",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "bucket",
  REDIS_URL: "redis://queue",
  OPENAI_API_KEY: "openai",
  NEXT_PUBLIC_POSTHOG_KEY: "posthog",
  NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  POSTHOG_PERSONAL_API_KEY: "personal",
  POSTHOG_PROJECT_ID: "project",
  PAYPAL_ENV: "live",
  PAYPAL_CLIENT_ID: "client",
  PAYPAL_CLIENT_SECRET: "secret",
  PAYPAL_WEBHOOK_ID: "webhook",
  PAYPAL_MONTHLY_PLAN_ID: "monthly",
  PAYPAL_ANNUAL_PLAN_ID: "annual",
  ZOHO_SMTP_USER: "support@example.com",
  ZOHO_SMTP_PASSWORD: "password",
  ADMIN_EMAILS: "admin@example.com",
  ALPHA_VANTAGE_API_KEY: "market",
};

const passing = buildProductionReadinessReport(completeEnvironment);
assert.equal(passing.ready, true);
assert.equal(passing.checks.some((check) => check.status === "fail"), false);

const sandboxProduction = buildProductionReadinessReport({
  ...completeEnvironment,
  PAYPAL_ENV: "sandbox",
});
assert.equal(sandboxProduction.ready, false);
assert.equal(
  sandboxProduction.checks.find((check) => check.id === "paypal-environment")?.status,
  "fail"
);

const duplicatePlans = buildProductionReadinessReport({
  ...completeEnvironment,
  PAYPAL_ANNUAL_PLAN_ID: completeEnvironment.PAYPAL_MONTHLY_PLAN_ID,
});
assert.equal(duplicatePlans.ready, false);
assert.equal(
  duplicatePlans.checks.find((check) => check.id === "paypal-plan-separation")?.status,
  "fail"
);

const missingDatabase = buildProductionReadinessReport({
  ...completeEnvironment,
  DATABASE_URL: "",
});
assert.equal(missingDatabase.ready, false);
assert.match(
  missingDatabase.checks.find((check) => check.id === "database")?.detail ?? "",
  /DATABASE_URL/
);

console.log("Production readiness regression checks passed.");

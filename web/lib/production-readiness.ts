type ReadinessEnvironment = Record<string, string | undefined>;

export type ProductionReadinessCheck = {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
};

export type ProductionReadinessReport = {
  ready: boolean;
  environment: string;
  generatedAt: string;
  checks: ProductionReadinessCheck[];
};

const hasValue = (env: ReadinessEnvironment, key: string) => Boolean(env[key]?.trim());

const allConfigured = (env: ReadinessEnvironment, keys: string[]) =>
  keys.every((key) => hasValue(env, key));

const integrationCheck = (
  env: ReadinessEnvironment,
  id: string,
  label: string,
  keys: string[],
  detail: string
): ProductionReadinessCheck => ({
  id,
  label,
  status: allConfigured(env, keys) ? "pass" : "fail",
  detail: allConfigured(env, keys) ? detail : `Missing configuration: ${keys.filter((key) => !hasValue(env, key)).join(", ")}`,
});

export const buildProductionReadinessReport = (
  env: ReadinessEnvironment = process.env
): ProductionReadinessReport => {
  const environment = env.VERCEL_ENV?.trim() || env.NODE_ENV?.trim() || "development";
  const isProduction = environment === "production";
  const checks: ProductionReadinessCheck[] = [
    integrationCheck(
      env,
      "authentication",
      "Clerk authentication",
      ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
      "Client and server authentication keys are configured."
    ),
    integrationCheck(
      env,
      "database",
      "Primary database",
      ["DATABASE_URL", "DIRECT_URL"],
      "Pooled runtime and direct migration connections are configured."
    ),
    integrationCheck(
      env,
      "storage",
      "Import storage",
      ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"],
      "Private import storage is configured."
    ),
    integrationCheck(
      env,
      "queue",
      "Import queue",
      ["REDIS_URL"],
      "Redis-backed import coordination is configured."
    ),
    integrationCheck(
      env,
      "openai",
      "OCR and Adviser",
      ["OPENAI_API_KEY"],
      "OpenAI-backed parsing and Adviser requests are configured."
    ),
    integrationCheck(
      env,
      "posthog",
      "Product analytics",
      [
        "NEXT_PUBLIC_POSTHOG_KEY",
        "NEXT_PUBLIC_POSTHOG_HOST",
        "POSTHOG_PERSONAL_API_KEY",
        "POSTHOG_PROJECT_ID",
      ],
      "Client capture and Admin analytics queries are configured."
    ),
    integrationCheck(
      env,
      "paypal",
      "PayPal subscriptions",
      [
        "PAYPAL_CLIENT_ID",
        "PAYPAL_CLIENT_SECRET",
        "PAYPAL_WEBHOOK_ID",
        "PAYPAL_MONTHLY_PLAN_ID",
        "PAYPAL_ANNUAL_PLAN_ID",
      ],
      "Subscription checkout, lifecycle sync, and webhook verification are configured."
    ),
    integrationCheck(
      env,
      "email",
      "Support email",
      ["ZOHO_SMTP_USER", "ZOHO_SMTP_PASSWORD"],
      "Transactional support email is configured."
    ),
    integrationCheck(
      env,
      "admin",
      "Admin access",
      ["ADMIN_EMAILS"],
      "At least one server-verified Admin identity is configured."
    ),
  ];

  const paypalEnvironment = env.PAYPAL_ENV?.trim() || "";
  checks.push({
    id: "paypal-environment",
    label: "PayPal environment",
    status:
      (isProduction && paypalEnvironment === "live") ||
      (!isProduction && paypalEnvironment === "sandbox")
        ? "pass"
        : "fail",
    detail: isProduction
      ? "Production must use PayPal live mode."
      : "Non-production deployments must use PayPal sandbox mode.",
  });

  const monthlyPlanId = env.PAYPAL_MONTHLY_PLAN_ID?.trim();
  const annualPlanId = env.PAYPAL_ANNUAL_PLAN_ID?.trim();
  checks.push({
    id: "paypal-plan-separation",
    label: "PayPal plan separation",
    status: monthlyPlanId && annualPlanId && monthlyPlanId !== annualPlanId ? "pass" : "fail",
    detail: "Monthly and annual subscriptions must use distinct configured PayPal plans.",
  });

  checks.push({
    id: "market-data",
    label: "Market data fallback",
    status: hasValue(env, "ALPHA_VANTAGE_API_KEY") ? "pass" : "warning",
    detail: hasValue(env, "ALPHA_VANTAGE_API_KEY")
      ? "Alpha Vantage market data is configured."
      : "Market history can still load through other providers, but Alpha Vantage fallback is unavailable.",
  });

  return {
    ready: checks.every((check) => check.status !== "fail"),
    environment,
    generatedAt: new Date().toISOString(),
    checks,
  };
};

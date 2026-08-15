import type { Pool } from "pg";

export type IsolatedDeploymentEnvironment = "production" | "staging";

type IsolationEnv = Record<string, string | undefined>;

type IsolationConfig = {
  environment: IsolatedDeploymentEnvironment;
  databaseProjectRef: string;
};

const fail = (code: string): never => {
  throw new Error(`ENVIRONMENT_ISOLATION_${code}`);
};

const requireValue = (value: string | undefined, code: string): string => {
  const normalized = value?.trim();
  return normalized || fail(code);
};

export const extractSupabaseProjectRef = (databaseUrl: string) => {
  try {
    const parsed = new URL(databaseUrl);
    const directMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (directMatch?.[1]) return directMatch[1];

    const username = decodeURIComponent(parsed.username);
    const poolerMatch = username.match(/^postgres\.([a-z0-9]+)$/i);
    return poolerMatch?.[1] ?? null;
  } catch {
    return null;
  }
};

export const assertStaticEnvironmentIsolation = (env: IsolationEnv): IsolationConfig | null => {
  const vercelEnvironment = env.VERCEL_ENV;
  const shouldEnforce =
    vercelEnvironment === "production" ||
    vercelEnvironment === "preview" ||
    env.CLOVER_ENFORCE_ENVIRONMENT_ISOLATION === "true";
  if (!shouldEnforce) return null;

  const environment: IsolatedDeploymentEnvironment =
    vercelEnvironment === "production" ? "production" : "staging";
  if (env.CLOVER_DEPLOYMENT_ENVIRONMENT !== environment) {
    fail("DEPLOYMENT_LABEL_MISMATCH");
  }

  if (
    environment === "staging" &&
    env.VERCEL_GIT_COMMIT_REF &&
    env.VERCEL_GIT_COMMIT_REF !== "staging"
  ) {
    fail("PREVIEW_BRANCH_NOT_ALLOWED");
  }

  const databaseUrl = requireValue(
    env.DATABASE_URL?.trim() || env.DIRECT_URL?.trim(),
    "DATABASE_CONFIGURATION_MISSING",
  );
  const expectedProjectRef = requireValue(
    env.CLOVER_EXPECTED_DATABASE_PROJECT_REF,
    "DATABASE_CONFIGURATION_MISSING",
  );

  const databaseProjectRef =
    extractSupabaseProjectRef(databaseUrl) || fail("DATABASE_PROJECT_MISMATCH");
  if (databaseProjectRef !== expectedProjectRef) {
    fail("DATABASE_PROJECT_MISMATCH");
  }

  const expectedBucket = requireValue(env.CLOVER_EXPECTED_R2_BUCKET, "R2_BUCKET_MISMATCH");
  const configuredBucket = requireValue(env.R2_BUCKET_NAME, "R2_BUCKET_MISMATCH");
  if (expectedBucket !== configuredBucket) {
    fail("R2_BUCKET_MISMATCH");
  }
  if (environment === "staging" && !configuredBucket.toLowerCase().includes("staging")) {
    fail("STAGING_R2_BUCKET_NAME_INVALID");
  }
  if (environment === "production" && configuredBucket.toLowerCase().includes("staging")) {
    fail("PRODUCTION_R2_BUCKET_NAME_INVALID");
  }

  if (env.FINVERSE_ENABLED === "true" && env.CLOVER_FINVERSE_ENVIRONMENT_ISOLATED !== "true") {
    fail("FINVERSE_NOT_ISOLATED");
  }

  return { environment, databaseProjectRef };
};

export const assertDatabaseEnvironmentMarker = async (
  pool: Pick<Pool, "query">,
  environment: IsolatedDeploymentEnvironment,
) => {
  const result = await pool.query<{ environment: string }>(
    'SELECT "environment" FROM "CloverDeploymentEnvironment" WHERE "id" = $1 LIMIT 1',
    ["primary"],
  );
  if (result.rows[0]?.environment !== environment) {
    fail("DATABASE_MARKER_MISMATCH");
  }
};

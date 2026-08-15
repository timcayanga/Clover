import assert from "node:assert/strict";
import {
  assertDatabaseEnvironmentMarker,
  assertStaticEnvironmentIsolation,
  extractSupabaseProjectRef,
} from "@/lib/environment-isolation";

const stagingRef = "stagingprojectref";
const productionRef = "productionprojectref";

assert.equal(
  extractSupabaseProjectRef(`postgresql://postgres.${stagingRef}:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`),
  stagingRef,
);
assert.equal(
  extractSupabaseProjectRef(`postgresql://postgres:password@db.${productionRef}.supabase.co:5432/postgres`),
  productionRef,
);

const stagingEnv = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "staging",
  CLOVER_DEPLOYMENT_ENVIRONMENT: "staging",
  CLOVER_EXPECTED_DATABASE_PROJECT_REF: stagingRef,
  DATABASE_URL: `postgresql://postgres.${stagingRef}:password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
  CLOVER_EXPECTED_R2_BUCKET: "clover-imports-staging",
  R2_BUCKET_NAME: "clover-imports-staging",
  FINVERSE_ENABLED: "false",
};

assert.equal(assertStaticEnvironmentIsolation(stagingEnv)?.environment, "staging");
assert.throws(
  () => assertStaticEnvironmentIsolation({ ...stagingEnv, DATABASE_URL: `postgresql://postgres.${productionRef}:password@host:6543/postgres` }),
  /ENVIRONMENT_ISOLATION_DATABASE_PROJECT_MISMATCH/,
);
assert.throws(
  () => assertStaticEnvironmentIsolation({ ...stagingEnv, VERCEL_GIT_COMMIT_REF: "feature-branch" }),
  /ENVIRONMENT_ISOLATION_PREVIEW_BRANCH_NOT_ALLOWED/,
);
assert.throws(
  () => assertStaticEnvironmentIsolation({ ...stagingEnv, R2_BUCKET_NAME: "clover-imports" }),
  /ENVIRONMENT_ISOLATION_R2_BUCKET_MISMATCH/,
);
assert.throws(
  () => assertStaticEnvironmentIsolation({ ...stagingEnv, FINVERSE_ENABLED: "true" }),
  /ENVIRONMENT_ISOLATION_FINVERSE_NOT_ISOLATED/,
);

const main = async () => {
  await assertDatabaseEnvironmentMarker(
    { query: async () => ({ rows: [{ environment: "staging" }] }) } as never,
    "staging",
  );
  await assert.rejects(
    assertDatabaseEnvironmentMarker(
      { query: async () => ({ rows: [{ environment: "production" }] }) } as never,
      "staging",
    ),
    /ENVIRONMENT_ISOLATION_DATABASE_MARKER_MISMATCH/,
  );

  console.log("Environment isolation regression checks passed.");
};

void main();

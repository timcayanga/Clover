import { Pool } from "pg";
import {
  assertDatabaseEnvironmentMarker,
  assertStaticEnvironmentIsolation,
} from "@/lib/environment-isolation";

const main = async () => {
  const config = assertStaticEnvironmentIsolation(process.env);
  if (!config) {
    console.log("Environment isolation guard skipped outside an isolated deployment.");
    return;
  }

  const connectionString = process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim();
  if (!connectionString) throw new Error("ENVIRONMENT_ISOLATION_DATABASE_CONFIGURATION_MISSING");

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 1_000,
    allowExitOnIdle: true,
  });
  try {
    await assertDatabaseEnvironmentMarker(pool, config.environment);
    console.log(`Environment isolation guard passed for ${config.environment}.`);
  } finally {
    await pool.end();
  }
};

void main();

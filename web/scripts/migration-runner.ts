import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export function migrationEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const connection = env.DIRECT_URL || env.DATABASE_URL;
  if (!connection) throw new Error("Migrations require DIRECT_URL or a session-capable DATABASE_URL.");
  let url: URL;
  try { url = new URL(connection); } catch { throw new Error("Invalid migration database URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Migrations require a PostgreSQL direct or session connection.");
  }
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    throw new Error("Prisma migrations cannot use Supabase transaction pooling (6543). Set DIRECT_URL to the session pooler (5432).");
  }
  if (url.searchParams.get("pgbouncer") === "true") {
    throw new Error("Prisma migrations require session semantics; remove pgbouncer=true from DIRECT_URL.");
  }
  return { ...env, DIRECT_URL: connection, DATABASE_URL: env.DATABASE_URL || connection };
}

export function deployMigrations(env: NodeJS.ProcessEnv, run: typeof spawnSync = spawnSync): number {
  const migrationEnv = migrationEnvironment(env);
  console.log("Applying Prisma migrations through the configured direct/session connection (180s limit).");
  // Use the installed CLI, not npx; never retry a failed migration on a runtime
  // transaction pooler. P3009/schema errors need explicit inspection and repair.
  const result = run(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
    cwd: process.cwd(), stdio: "inherit", env: migrationEnv,
    timeout: 180_000, killSignal: "SIGKILL",
  });
  if (result.error) {
    console.error(result.error.code === "ETIMEDOUT"
      ? "Migration command exceeded 180s. Build stopped; inspect migration status before retrying."
      : "Migration command could not run. Build stopped.");
    return 1;
  }
  if (result.status !== 0) console.error("Migration failed. Build stopped without a transaction-pooler retry; inspect the Prisma error above.");
  return result.status ?? 1;
}

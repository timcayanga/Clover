import { spawnSync } from "node:child_process";

const shouldRunMigrations = process.env.VERCEL === "1" || process.env.VERCEL === "true";

if (!shouldRunMigrations) {
  process.exit(0);
}

if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
  console.warn("Skipping Prisma migrations because no database URL is configured.");
  process.exit(0);
}

const prismaBin = process.platform === "win32" ? "npx.cmd" : "npx";
const args = ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"];
const runMigrations = (env: NodeJS.ProcessEnv) =>
  spawnSync(prismaBin, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env,
  });

let result = runMigrations(process.env);

// Supabase's direct host can be unreachable from IPv4-only build workers while
// its session pooler remains available. Prisma migrations are idempotent, so a
// failed direct attempt can safely retry through DATABASE_URL.
if (
  !result.error &&
  result.status !== 0 &&
  process.env.DIRECT_URL &&
  process.env.DATABASE_URL &&
  process.env.DIRECT_URL !== process.env.DATABASE_URL
) {
  console.warn("Direct migration connection failed; retrying with DATABASE_URL.");
  result = runMigrations({
    ...process.env,
    DIRECT_URL: process.env.DATABASE_URL,
  });
}

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

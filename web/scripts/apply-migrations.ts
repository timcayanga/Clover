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
const result = spawnSync(
  prismaBin,
  ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  }
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

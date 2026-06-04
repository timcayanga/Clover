import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadEnvConfig } from "@next/env";
import { existsSync } from "fs";
import path from "path";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

const loadLocalDatabaseEnv = () => {
  if (process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim()) {
    return;
  }

  const cwd = process.cwd();
  const candidateProjectDirs = [cwd, path.join(cwd, "web")];
  const projectDir = candidateProjectDirs.find((dir) => existsSync(path.join(dir, "next.config.mjs")));
  if (projectDir) {
    loadEnvConfig(projectDir);
  }
};

loadLocalDatabaseEnv();

const resolveDatabaseUrl = () => {
  const configuredUrl = process.env.DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim();

  if (!configuredUrl) {
    return "postgresql://user:pass@localhost:5432/finance_manager";
  }

  try {
    const url = new URL(configuredUrl);
    const isSupabaseTransactionPooler =
      url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543";

    if (isSupabaseTransactionPooler && !url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
      return url.toString();
    }

    return configuredUrl;
  } catch {
    return configuredUrl;
  }
};

const connectionString = resolveDatabaseUrl();

const pool =
  globalForPrisma.prismaPool ??
  new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 10_000,
  });

const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = prisma;
globalForPrisma.prismaPool = pool;

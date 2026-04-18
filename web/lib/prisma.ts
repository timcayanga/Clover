import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

const resolveDatabaseUrl = () => {
  const configuredUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!configuredUrl) {
    return "postgresql://user:pass@localhost:5432/finance_manager";
  }

  try {
    const url = new URL(configuredUrl);
    const isSupabaseSessionPooler = url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432";
    if (!isSupabaseSessionPooler) {
      return configuredUrl;
    }

    const [usernamePrefix, projectRef] = decodeURIComponent(url.username).split(".", 2);
    if (usernamePrefix !== "postgres" || !projectRef) {
      return configuredUrl;
    }

    const directUrl = new URL(configuredUrl);
    directUrl.username = encodeURIComponent("postgres");
    directUrl.hostname = `db.${projectRef}.supabase.co`;
    directUrl.port = "5432";
    directUrl.searchParams.delete("pgbouncer");
    return directUrl.toString();
  } catch {
    return configuredUrl;
  }
};

const connectionString =
  resolveDatabaseUrl() ?? "postgresql://user:pass@localhost:5432/finance_manager";

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

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? "postgresql://postgres:postgres@localhost:5432/clover",
  },
});

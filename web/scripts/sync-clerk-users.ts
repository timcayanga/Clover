import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
async function main() {
  const index = process.argv.indexOf("--env-file");
  if (index < 0 || !process.argv[index + 1])
    throw new Error(
      "Supply --env-file with the environment's private Vercel export.",
    );
  Object.assign(
    process.env,
    parseEnv(readFileSync(process.argv[index + 1], "utf8")),
  );
  process.env.NODE_ENV = "production";
  const { reconcileClerkUsers } =
    await import("../lib/clerk-identity-lifecycle");
  const { prisma } = await import("../lib/prisma");
  try {
    let offset: number | null = 0;
    let synced = 0,
      errors = 0;
    do {
      const result = await reconcileClerkUsers(offset);
      synced += result.synced;
      errors += result.errors.length;
      console.log(
        JSON.stringify({
          environment: result.environment,
          synced,
          errors: result.errors,
          nextOffset: result.nextOffset,
        }),
      );
      offset = result.nextOffset;
    } while (offset !== null);
    if (errors) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Clerk reconciliation failed. Verify instance credentials, database marker, and schema before retrying.",
  );
  process.exitCode = 1;
});

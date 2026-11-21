// Trusted local coordinator bridge; run with securely loaded destination environment.
// Never accepts an owner ID from a report or grants access to an arbitrary email.
import { Pool } from "pg";
import { assertDatabaseEnvironmentMarker } from "../lib/environment-isolation";
import { readFile } from "node:fs/promises";
import { clerkClient } from "@clerk/nextjs/server";
import { hasInternalEmail } from "../lib/internal-permissions";
import { saveTeamReport } from "../lib/team-report-store";
import { teamReportSchema } from "../lib/team-report-contract";
import { prisma } from "../lib/prisma";
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: tsx scripts/team-report-import.ts report.json");
  const report = teamReportSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const destination = process.env.CLOVER_TEAM_REPORT_DESTINATION;
  const connectionString = process.env.DATABASE_URL?.trim();
  const secret = process.env.CLERK_SECRET_KEY || "";
  if (!connectionString || !["production", "staging"].includes(destination || "") || !secret.startsWith(destination === "production" ? "sk_live_" : "sk_test_")) throw new Error("Explicit matching destination credentials required");
  const pool = new Pool({connectionString, max: 1, connectionTimeoutMillis: 8000});
  try { await assertDatabaseEnvironmentMarker(pool, destination as "production" | "staging"); }
  finally { await pool.end(); }
  const clerk = await clerkClient();
  const users = await clerk.users.getUserList({emailAddress: ["hello@clover.ph"], limit: 2});
  if (users.data.length !== 1 || !hasInternalEmail(users.data[0].emailAddresses)) throw new Error("Verified Clover owner unavailable in this environment");
  console.log(JSON.stringify(await saveTeamReport(users.data[0].id, report)));
}
main().catch(() => { console.error("Report import failed. Verify the report and destination credentials; no delivery receipt recorded."); process.exitCode = 1; }).finally(() => prisma.$disconnect());

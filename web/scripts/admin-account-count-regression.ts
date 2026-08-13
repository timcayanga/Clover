import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "lib/admin-users.ts"), "utf8");

const perUserAccountQuery = source.match(
  /SELECT w\."userId" AS "userId", COUNT\(\*\)::bigint AS "accountCount"[\s\S]*?GROUP BY w\."userId"/,
)?.[0];

if (!perUserAccountQuery) {
  throw new Error("Admin per-user account count query was not found.");
}

if (perUserAccountQuery.includes('a."type" =')) {
  throw new Error("Admin per-user account count must include bank, card, wallet, cash, investment, and other account types.");
}

if (source.includes("bankAccountCount") || source.includes("totalBankAccounts")) {
  throw new Error("Admin account metrics must not imply that only bank accounts are counted.");
}

const overviewAccountCount = source.match(
  /prisma\.account\.count\(\{[\s\S]*?workspace: \{[\s\S]*?user: realUserWhere,[\s\S]*?\},[\s\S]*?\},[\s\S]*?\}\)/,
)?.[0];

if (!overviewAccountCount) {
  throw new Error("Admin overview account count was not found.");
}

if (overviewAccountCount.includes("type:")) {
  throw new Error("Admin overview account count must include every current account type.");
}

if (!source.includes('t."deletedAt" IS NULL')) {
  throw new Error("Admin transaction usage must continue excluding deleted transactions.");
}

console.log("Admin account count regression passed.");

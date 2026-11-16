import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "lib/admin-command-center.ts"), "utf8");
const volumeSource = fs.readFileSync(path.join(process.cwd(), "lib/admin-transaction-volume.ts"), "utf8");

if (!source.includes('label: "Amount tracked"')) {
  throw new Error("Admin Home must include an Amount tracked summary card.");
}

if (!source.includes('note: "Current entries by currency · transfers excluded"')) {
  throw new Error("Admin Home must explain the tracked-volume scope.");
}

if (!volumeSource.includes('SUM(ABS(t."amount"))')) {
  throw new Error("Amount tracked must use the total absolute transaction amount.");
}

if (!volumeSource.includes('t."deletedAt" IS NULL')) {
  throw new Error("Amount tracked must exclude deleted transactions.");
}

if (!volumeSource.includes('COUNT(*)::bigint AS "transactionCount"')) {
  throw new Error("Transaction count and amount must share one Admin Home aggregate query.");
}

if (!volumeSource.includes('t."isExcluded" = false') || !volumeSource.includes('t."isTransfer" = false')) {
  throw new Error("Tracked volume must exclude hidden entries and internal transfers.");
}

if (!volumeSource.includes("GROUP BY UPPER")) {
  throw new Error("Tracked volume must be separated by currency.");
}

console.log("Admin Home tracked amount regression passed.");

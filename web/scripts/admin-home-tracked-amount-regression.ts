import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "lib/admin-command-center.ts"), "utf8");

if (!source.includes('label: "Amount tracked"')) {
  throw new Error("Admin Home must include an Amount tracked summary card.");
}

if (!source.includes('note: "Absolute total · mixed currencies"')) {
  throw new Error("Admin Home must explain that the raw total may contain mixed currencies.");
}

if (!source.includes('SUM(ABS(t."amount"))')) {
  throw new Error("Amount tracked must use the total absolute transaction amount.");
}

if (!source.includes('t."deletedAt" IS NULL')) {
  throw new Error("Amount tracked must exclude deleted transactions.");
}

if (!source.includes('COUNT(*)::bigint AS "transactionCount"')) {
  throw new Error("Transaction count and amount must share one Admin Home aggregate query.");
}

if (source.includes("prisma.transaction.count({\n      where: { ...activeTransaction")) {
  throw new Error("Amount tracked must not add a second Admin Home transaction query.");
}

console.log("Admin Home tracked amount regression passed.");

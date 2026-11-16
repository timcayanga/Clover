import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const readSource = (relativePath: string) => readFile(path.join(process.cwd(), relativePath), "utf8");

async function main() {
  const [transactionsPage, bulkDeleteRoute] = await Promise.all([
    readSource("app/transactions/page.tsx"),
    readSource("app/api/transactions/bulk-delete/route.ts"),
  ]);

  assert.match(
    transactionsPage,
    /fetch\("\/api\/transactions\/bulk-delete"[\s\S]{0,300}transactionIds/,
    "Bulk deletion must use one bounded server operation instead of racing one request per row."
  );
  assert.doesNotMatch(
    transactionsPage,
    /Promise\.allSettled\(transactionIds\.map\(\(transactionId\) => deleteTransactionRemote/,
    "Selected rows must not be deleted through concurrent per-row requests."
  );
  assert.match(
    transactionsPage,
    /deletedTransactionIdsRef\.current\.has\(transaction\.id\)/,
    "A stale list response must not reinsert a transaction deleted in this session."
  );
  assert.match(
    transactionsPage,
    /clearJsonRequestCache\("transactions:list:"\)/,
    "Deletion must invalidate cached transaction-list responses before the authoritative reload."
  );
  assert.match(
    transactionsPage,
    /setMobilePaginationExhausted\(!hasRemainingVisibleTransactions\)/,
    "Deleting the final transaction in a filtered currency must stop mobile load-more immediately."
  );
  assert.match(
    bulkDeleteRoute,
    /prisma\.\$transaction\(async \(tx\)[\s\S]{0,500}tx\.transaction\.updateMany/,
    "The server must soft-delete the selected transaction set atomically."
  );
  assert.match(
    bulkDeleteRoute,
    /workspaceId: payload\.workspaceId,[\s\S]{0,120}id: \{ in: activeTransactions\.map/,
    "Bulk deletion must remain scoped to the authenticated workspace."
  );
  assert.match(
    bulkDeleteRoute,
    /tx\.auditLog\.createMany/,
    "Every bulk-deleted row must retain an audit record."
  );

  console.log("Bulk transaction deletion regression passed.");
}

void main();

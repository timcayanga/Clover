import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readProjectFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const schemaSource = readProjectFile("prisma/schema.prisma");
const previewRouteSource = readProjectFile("app/api/split-bill-receipts/preview/route.ts");
const receiptRouteSource = readProjectFile("app/api/split-bills/[billId]/receipt/route.ts");
const workspaceSource = readProjectFile("components/split-bill-workspace.tsx");
const detailToolsSource = readProjectFile("components/split-bill-detail-tools.tsx");
const homeSource = readProjectFile("components/split-bill-home.tsx");
const importedSplitBillSource = readProjectFile("lib/imported-split-bill.ts");
const importWorkerSource = readProjectFile("workers/import-processor.ts");
const billRouteSource = readProjectFile("app/api/split-bills/[billId]/route.ts");

assert.match(schemaSource, /model SplitBill[\s\S]*receiptStorageKey\s+String\?/);
assert.match(previewRouteSource, /uploadObject[\s\S]*split-bill-receipts[\s\S]*receiptStorageKey/);
assert.match(receiptRouteSource, /collaborators:\s*\{\s*some:\s*\{\s*userId:\s*user\.id/);
assert.match(receiptRouteSource, /Cache-Control": "private, no-store"/);
assert.match(importedSplitBillSource, /receiptStorageKey:\s*params\.storageKey/);
assert.match(importWorkerSource, /storageKey:\s*String\(importFile\.storageKey/);
assert.match(billRouteSource, /requestedReceiptStorageKey\?\.startsWith\(`split-bill-receipts\/\$\{userId\}\//);
assert.match(billRouteSource, /existing\.receiptStorageKey\?\.startsWith\(`split-bill-receipts\/\$\{user\.id\}\//);

for (const tab of ["Insights", "Receipts"]) {
  assert.match(workspaceSource, new RegExp(`label: "${tab}"`), `${tab} must remain inside entity details.`);
  assert.doesNotMatch(homeSource, new RegExp(`>${tab}<`), `${tab} must not clutter the Split Bills landing page.`);
}

assert.match(detailToolsSource, /split-bills\.csv/);
assert.match(detailToolsSource, /Print \/ PDF/);
assert.match(detailToolsSource, /summary\.png/);
assert.match(detailToolsSource, /Receipt proof/);
assert.match(detailToolsSource, /Total spent[\s\S]*Settlement progress[\s\S]*Largest expense[\s\S]*Receipt coverage/);

console.log("Split Bill detail feature regression checks passed.");

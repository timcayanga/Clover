import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseImportText, parseNetWorthSnapshotCsv } from "@/lib/import-parser";
import { detectStatementMetadataFromText } from "@/lib/data-engine";

const csv = [
  "Date,PHP Total,USD Total,Gain / Loss,Liquid Cash,Savings Total,Investments Total,Physical Cash Total,AR Total,Savings,,,,,,,,Investments,,,,,,,,Physical Cash,,Accounts Receivable",
  ",,,,,,,,,BPI (Supplemental),BPI (Personal / Ateneo),RCBC,GCash Wallet,Maya,Wise,UnionBank,HSBC,GFunds,GStocks Philippines,GSave (UNO),GCrypto,PDAX,GoTrade,BPI Time Deposit,HSBC Savings,PHP,USD,",
  '1/1/2026,"₱9,999.00","$999.00",1%,,"₱5,000.00","₱4,000.00","₱900.00","₱99.00","₱10.00","₱20.00","₱30.00","₱40.00","₱50.00","₱60.00","₱70.00","₱80.00","₱90.00","₱100.00","₱110.00","₱120.00","₱130.00","₱140.00","₱150.00","₱160.00","₱170.00","$180.00","₱190.00"',
  '3/24/2026,"₱99,999.00","$9,999.00",2%,,"₱50,000.00","₱40,000.00","₱9,000.00","₱990.00","₱1,010.00","₱1,020.00","₱1,030.00","₱1,040.00","₱1,050.00","₱1,060.00","₱1,070.00","₱1,080.00","₱1,090.00","₱1,100.00","₱1,110.00","₱1,120.00","₱1,130.00","₱1,140.00","₱1,150.00","₱1,160.00","₱1,170.00","$1,180.00","₱1,190.00"',
].join("\n");

const fileName = "Net Worth Calculator - Net Worth Calculator.csv";
const rows = parseNetWorthSnapshotCsv(csv, fileName, "text/csv");
assert.ok(rows, "The net-worth matrix should be recognized deterministically.");
assert.equal(rows.length, 19, "Every account column should produce one current balance marker.");
assert.equal(
  rows.filter((row) => row.rawPayload?.kind !== "account_snapshot_marker").length,
  0,
  "A balance-history matrix must not produce spending transactions."
);
assert.equal(parseImportText(csv, fileName, "text/csv").length, 19, "Main parser routing should use the snapshot parser first.");

const byName = new Map(rows.map((row) => [row.accountName, row]));
assert.equal(byName.get("BPI Supplemental")?.institution, "BPI");
assert.equal(byName.get("BPI Personal / Ateneo")?.rawPayload?.balance, 1020);
assert.equal(byName.get("GCash")?.rawPayload?.accountType, "wallet");
assert.equal(byName.get("PDAX")?.rawPayload?.accountType, "investment");
assert.equal(byName.get("Cash")?.rawPayload?.accountType, "cash");
assert.equal(byName.get("Cash")?.institution, "Cash", "PHP cash must reuse the workspace's default Cash account.");
assert.equal(byName.get("Cash USD")?.currency, "USD");
assert.equal(byName.get("Accounts Receivable")?.rawPayload?.accountType, "receivable");
assert.equal(byName.has("PHP Total"), false, "Summary totals must not become accounts.");
assert.equal(byName.has("Savings Total"), false, "Section totals must not become accounts.");
assert.equal(
  (byName.get("BPI Supplemental")?.rawPayload?.balanceHistory as unknown[])?.length,
  2,
  "Account-specific snapshot history should remain available for traceability."
);

const metadata = detectStatementMetadataFromText(csv, fileName);
assert.equal(metadata.institution, null, "A multi-account file must not be assigned to one inferred bank.");
assert.equal(metadata.accountName, "Multiple Accounts");
assert.equal(metadata.accountType, "other");
assert.equal(metadata.endingBalance, null, "Summary totals must not be treated as one account balance.");
assert.equal(metadata.confidence, 100);

const main = async () => {
  const workerSource = await readFile(join(process.cwd(), "workers/import-processor.ts"), "utf8");
  assert.match(workerSource, /hasNetWorthSnapshotAccountGroups/, "Worker must preserve all snapshot account groups.");
  assert.match(workerSource, /shouldPersistNetWorthSnapshotGroupBalances/, "Worker must persist each latest account balance.");
  assert.match(
    workerSource,
    /likelyNetWorthSnapshotCsv \|\| legacyMatchLooksLikeNetWorthSnapshotCsv/,
    "A legacy bad transaction parse must not block corrected reimport."
  );
  assert.match(
    workerSource,
    /\[net-worth-csv\] unable to remove legacy fabricated transaction rows/,
    "Corrected reimports must clean up only unconfirmed transactions fabricated by an older parser."
  );
  assert.match(workerSource, /readParsedRowAccountType/, "Worker must honor cash and receivable account types.");
  assert.match(
    workerSource,
    /const groupAccountType = readParsedRowAccountType\(firstRow\)/,
    "Early account materialization must honor each snapshot column's account type."
  );
  assert.match(
    workerSource,
    /isGenericMobileScreenshotFileName\(fileName\) \|\| accountSnapshotInventory/,
    "Snapshot inventories must not infer an institution from the CSV filename."
  );
  assert.match(
    workerSource,
    /existingSnapshotAccountWithStaleType/,
    "A corrected snapshot import must repair an older account card that was created with the wrong type."
  );

  const modalSource = await readFile(join(process.cwd(), "components/import-files-modal.tsx"), "utf8");
  assert.match(
    modalSource,
    /const rowAccountType = readRowAccountType\(row\)/,
    "Optimistic multi-account previews must keep each snapshot account type."
  );

  console.log("[PASS] Net-worth snapshot CSV routes to 19 accounts and zero transactions.");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

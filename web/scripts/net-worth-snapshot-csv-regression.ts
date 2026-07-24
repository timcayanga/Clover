import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseImportText, parseNetWorthSnapshotCsv } from "@/lib/import-parser";
import { detectStatementMetadataFromText } from "@/lib/data-engine";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { normalizeImportedAccountKey } from "@/lib/imported-account-identity";
import { matchesImportedAccountIdentity, pruneImportedAccountPlaceholders } from "@/lib/workspace-cache";

const csv = [
  "Date,PHP Total,USD Total,Gain / Loss,Liquid Cash,Savings Total,Investments Total,Physical Cash Total,AR Total,Savings,,,,,,,,Investments,,,,,,,,Physical Cash,,Accounts Receivable",
  ",,,,,,,,,BPI (Supplemental),BPI (Personal / Ateneo),RCBC,GCash Wallet,Maya,Wise,UnionBank,HSBC,GFunds,GStocks Philippines,GSave (UNO),GCrypto,PDAX,GoTrade,BPI Time Deposit,HSBC Savings,PHP,USD,",
  '1/1/2026,"₱9,999.00","$999.00",1%,"₱5,999.00","₱5,000.00","₱4,000.00","₱900.00","₱99.00","₱10.00","₱20.00","₱30.00","₱40.00","₱50.00","₱60.00","₱70.00","₱80.00","₱90.00","₱100.00","₱110.00","₱120.00","₱130.00","₱140.00","₱150.00","₱160.00","₱170.00","$180.00","₱190.00"',
  '3/24/2026,"₱99,999.00","$9,999.00",2%,"₱59,999.00","₱50,000.00","₱40,000.00","₱9,000.00","₱990.00","₱1,010.00","₱1,020.00","₱1,030.00","₱1,040.00","₱1,050.00","₱1,060.00","₱1,070.00","₱1,080.00","₱1,090.00","₱1,100.00","₱1,110.00","₱1,120.00","₱1,130.00","₱1,140.00","₱1,150.00","₱1,160.00","₱1,170.00","$1,180.00","₱1,190.00"',
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
assert.equal(byName.get("GFunds")?.institution, "GFunds");
assert.equal(byName.get("GStocks Philippines")?.institution, "GStocks Philippines");
assert.equal(byName.get("GCrypto")?.institution, "GCrypto");
assert.equal(
  byName.get("GSave (UNO)")?.rawPayload?.accountType,
  "investment",
  "An account explicitly listed in the Investments section must not become a tracked bank asset."
);
assert.equal(byName.get("BPI Time Deposit")?.institution, "BPI Time Deposit");
assert.equal(byName.get("Cash")?.rawPayload?.accountType, "cash");
assert.equal(byName.get("Cash")?.institution, "Cash", "PHP cash must reuse the workspace's default Cash account.");
assert.equal(byName.get("Cash USD")?.currency, "USD");
assert.equal(
  formatUploadAccountDisplayName("Cash USD", "Cash", null, "cash"),
  "Cash USD",
  "A foreign-currency cash balance must not be relabeled as the PHP Cash account."
);
assert.notEqual(
  normalizeImportedAccountKey("Cash", "Cash", null, "cash", "PHP"),
  normalizeImportedAccountKey("Cash USD", "Cash", null, "cash", "USD"),
  "Cash identities must be scoped by currency."
);
assert.equal(
  matchesImportedAccountIdentity(
    { name: "Cash", institution: "Cash", type: "cash", currency: "PHP" },
    { name: "Cash USD", institution: "Cash", type: "cash", currency: "USD" }
  ),
  false,
  "A USD cash snapshot must never update the PHP cash balance."
);
assert.equal(
  pruneImportedAccountPlaceholders([
    {
      id: "rcbc-inventory",
      name: "RCBC",
      institution: "RCBC",
      accountNumber: null,
      type: "bank",
      currency: "PHP",
      source: "upload",
      balance: "61824.11",
      transactionCount: 0,
    },
  ]).length,
  1,
  "A balance-only bank account is authoritative inventory, not a transient parser placeholder."
);
assert.equal(byName.get("Accounts Receivable")?.rawPayload?.accountType, "receivable");
assert.equal(byName.has("PHP Total"), false, "Summary totals must not become accounts.");
assert.equal(byName.has("Savings Total"), false, "Section totals must not become accounts.");
assert.equal(byName.has("Liquid Cash"), false, "Liquid Cash is an aggregate total, not a separate account.");
assert.ok(
  rows.every((row) => row.date === "2026-03-24" && row.rawPayload?.snapshotDate === "2026-03-24"),
  "Every balance must use the latest snapshot date."
);
assert.ok(
  rows.every((row) => row.rawPayload?.documentType === "account_inventory"),
  "A multi-account balance matrix must not be promoted to one account-detail document."
);
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

const unfamiliarInstitutionCsv = [
  "Date,PHP Total,USD Total,Gain / Loss,Liquid Cash,Savings Total,Investments Total,Physical Cash Total,AR Total,Savings,Investments,Credit Cards,Mortgages",
  ",,,,,,,,,New Rural Cooperative,Acme Brokerage USD,Metro Rewards Card,Home Loan",
  '1/1/2026,"₱20,000.00","$1,000.00",0%,,"₱5,000.00","₱10,000.00","₱1,000.00","₱4,000.00","₱5,000.00","$100.00","₱2,000.00","₱3,000.00"',
  '3/24/2026,"₱24,000.00","$1,500.00",0%,,"₱6,000.00","₱12,000.00","₱1,000.00","₱5,000.00","₱6,000.00","","₱2,500.00","₱3,500.00"',
].join("\n");
const unfamiliarRows = parseNetWorthSnapshotCsv(
  unfamiliarInstitutionCsv,
  "Personal Balance History.csv",
  "text/csv"
);
assert.ok(unfamiliarRows, "A proven net-worth matrix must not depend on a trained filename or institution list.");
assert.deepEqual(
  unfamiliarRows.map((row) => row.accountName),
  ["New Rural Cooperative", "Acme Brokerage USD", "Metro Rewards Card", "Home Loan"]
);
assert.deepEqual(
  unfamiliarRows.map((row) => row.rawPayload?.accountType),
  ["bank", "investment", "credit_card", "mortgage"]
);
assert.equal(
  unfamiliarRows.find((row) => row.accountName === "Acme Brokerage USD")?.currency,
  "USD",
  "Foreign-currency account columns must retain their currency."
);
assert.equal(
  unfamiliarRows.find((row) => row.accountName === "Acme Brokerage USD")?.rawPayload?.balance,
  100,
  "A blank latest cell must retain the account's latest known balance."
);
assert.equal(
  unfamiliarRows.find((row) => row.accountName === "Acme Brokerage USD")?.rawPayload?.balanceAsOfDate,
  "2026-01-01"
);
assert.equal(
  unfamiliarRows.find((row) => row.accountName === "Acme Brokerage USD")?.rawPayload?.balanceCarriedForward,
  true
);
assert.ok(
  unfamiliarRows.every((row) => row.rawPayload?.snapshotDate === "2026-03-24"),
  "Unfamiliar institutions must still use the latest balance date."
);

const currentBalanceExport = [
  "As of Date,BPI Savings,Maya Wallet,Brokerage Portfolio",
  '2026-03-24,"₱6,000.00","₱1,500.00","₱12,000.00"',
].join("\n");
const currentBalanceRows = parseImportText(
  currentBalanceExport,
  "Current Account Balances.csv",
  "text/csv"
);
assert.equal(
  currentBalanceRows.length,
  3,
  "A one-date, multi-account current-balance export must create account markers."
);
assert.ok(
  currentBalanceRows.every(
    (row) =>
      row.rawPayload?.kind === "account_snapshot_marker" &&
      row.rawPayload?.source === "wide_account_snapshot_csv"
  ),
  "Current-balance columns must never be emitted as transactions."
);
assert.deepEqual(
  currentBalanceRows.map((row) => row.rawPayload?.accountType),
  ["bank", "wallet", "investment"]
);
assert.ok(
  currentBalanceRows.every((row) => row.rawPayload?.documentType === "account_inventory"),
  "A multi-account current-balance export must remain an account inventory."
);

const sparseBalanceHistory = [
  "Date,BPI Savings,Maya Wallet",
  '2026-01-01,"₱1,000.00","₱500.00"',
  '2026-02-01,"₱1,100.00","₱600.00"',
  '2026-03-01,"₱1,200.00",""',
].join("\n");
const sparseBalanceRows = parseImportText(
  sparseBalanceHistory,
  "Monthly Account Balances.csv",
  "text/csv"
);
const carriedMayaBalance = sparseBalanceRows.find((row) => row.accountName === "Maya Wallet");
assert.equal(carriedMayaBalance?.rawPayload?.balance, 600);
assert.equal(carriedMayaBalance?.rawPayload?.snapshotDate, "2026-03-01");
assert.equal(carriedMayaBalance?.rawPayload?.balanceAsOfDate, "2026-02-01");
assert.equal(carriedMayaBalance?.rawPayload?.balanceCarriedForward, true);

const longAccountInventory = [
  "Snapshot Date,Account Name,Balance,Account Type",
  '2026-03-24,BPI Savings,"₱6,000.00",bank',
  '2026-03-24,Brokerage Portfolio,"₱12,000.00",investment',
].join("\n");
const longAccountInventoryRows = parseImportText(
  longAccountInventory,
  "Account Inventory.csv",
  "text/csv"
);
assert.equal(longAccountInventoryRows.length, 2);
assert.ok(
  longAccountInventoryRows.every((row) => row.rawPayload?.documentType === "account_inventory"),
  "A long-form multi-account balance export must not be promoted to one account-detail document."
);

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
    "Corrected reimports must clean up transactions fabricated by an older parser."
  );
  assert.match(
    workerSource,
    /const legacyImportFileIds = completedSourceMatches\.map/,
    "Repeated inventory imports must repair historical matches in one bounded pass."
  );
  assert.match(
    workerSource,
    /completedSourceMatchesWithVisibleRows = likelyNetWorthSnapshotCsv\s*\?\s*\[\]/,
    "A deterministic account inventory must not issue one transaction-count query per prior upload."
  );
  assert.match(
    workerSource,
    /legacyInvestmentSnapshots/,
    "Corrected reimports must remove the legacy consolidated investment snapshot."
  );
  assert.match(
    workerSource,
    /rawPayload\?\.source === "net_worth_snapshot_csv"/,
    "Multi-account inventories must stay on the account-group confirmation path."
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
  assert.match(
    workerSource,
    /const explicitInventoryName =[\s\S]{0,350}accountSnapshotInventory[\s\S]{0,350}next\.name\.trim\(\)/,
    "Account inventories must preserve explicit labels instead of merging distinct accounts under a generic institution name."
  );
  assert.match(
    workerSource,
    /\[net-worth-csv\] account inventory confirmed/,
    "Inventory confirmation must log parsed, resolved, and published account counts."
  );

  const modalSource = await readFile(join(process.cwd(), "components/import-files-modal.tsx"), "utf8");
  assert.match(
    modalSource,
    /const rowAccountType = readRowAccountType\(row\)/,
    "Optimistic multi-account previews must keep each snapshot account type."
  );
  assert.match(
    modalSource,
    /const isAccountInventorySnapshot =/,
    "The client must recognize a zero-transaction multi-account inventory response."
  );
  assert.match(
    modalSource,
    /await Promise\.resolve\(onImported\(combinedSummary\)\)/,
    "The client must publish a completed account inventory atomically."
  );
  assert.match(
    modalSource,
    /const statusIsAccountInventory =[\s\S]{0,250}confirmedTransactionsCount === 0[\s\S]{0,300}statusAccountSummaries\.every/,
    "A polled multi-account completion must recognize a transaction-free account inventory."
  );
  assert.match(
    modalSource,
    /statusIsAccountInventory && combinedFinalizedSummary[\s\S]{0,700}onImported\(\{[\s\S]{0,250}combinedFinalizedSummary/,
    "A polled account inventory must publish all account cards in one UI transition."
  );
  assert.match(
    modalSource,
    /balanceSources: statusIsAccountInventory[\s\S]{0,150}\? \[accountSummary\.balance\]/,
    "A local preview balance must not leak into another account in a multi-account inventory."
  );
  const accountsPageSource = await readFile(join(process.cwd(), "app/accounts/page.tsx"), "utf8");
  assert.match(
    accountsPageSource,
    /const optimisticAccounts = importedAccountSummaries/,
    "Accounts must publish every account summary from a multi-account import without waiting for a reload."
  );
  const accountsRouteSource = await readFile(join(process.cwd(), "app/api/accounts/route.ts"), "utf8");
  assert.match(
    accountsRouteSource,
    /const publishedInventoryAccountIds = new Set\([\s\S]{0,900}publishedAccountSummaries/,
    "Accounts must recognize every account explicitly published by an account-inventory checkpoint."
  );
  assert.match(
    accountsRouteSource,
    /checkpointAccountIds\.has\(account\.id\) \|\| publishedInventoryAccountIds\.has\(account\.id\)/,
    "A zero-transaction inventory account without an account number must not be hidden as a temporary parser placeholder."
  );
  const processRouteSource = await readFile(join(process.cwd(), "app/api/imports/[importId]/process/route.ts"), "utf8");
  assert.match(
    processRouteSource,
    /mergeImportResponseAccountSummaries\(\s*result\.accountSummaries,\s*statusSnapshot\?\.accountSummaries\s*\)/,
    "A partial status snapshot must not replace a richer confirmation result."
  );
  assert.match(
    processRouteSource,
    /visibleRows > 0 \|\| committedAccountInventoryComplete/,
    "An account-only import must be visibly complete even when it creates no transactions."
  );
  const statusSnapshotSource = await readFile(join(process.cwd(), "lib/import-status-snapshot.ts"), "utf8");
  assert.match(
    statusSnapshotSource,
    /mergePublishedAccountSummaries\(\s*readPublishedAccountSummaries\(statementCheckpoint\?\.sourceMetadata\),\s*computedAccountSummaries\s*\)/,
    "Status polling must retain every account summary already published by confirmation."
  );

  console.log("[PASS] Net-worth snapshot CSV routes to 19 accounts and zero transactions.");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

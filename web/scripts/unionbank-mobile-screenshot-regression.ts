import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import { detectStatementMetadata, parseImportText } from "@/lib/import-parser";

const screenshotRoot = process.env.CLOVER_SCREENSHOT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Screenshots";
const unionbankRoot = join(screenshotRoot, "UnionBank");

const screenshotFiles = [
  "IMG_1387.PNG",
  "IMG_1388.PNG",
  "IMG_1389.PNG",
  "IMG_1390.PNG",
  "IMG_1391.PNG",
  "IMG_1392.PNG",
  "IMG_1393.PNG",
  "IMG_1394.PNG",
  "IMG_1395.PNG",
  "IMG_1396.PNG",
];

const buildFile = async (path: string) => {
  const bytes = await readFile(path);
  return new File([bytes], basename(path), { type: "image/png" });
};

const main = async () => {
  const snapshotRows = new Set<string>();
  const transactionRows = new Map<string, ReturnType<typeof parseImportText>[number]>();

  for (const fileName of screenshotFiles) {
    const path = join(unionbankRoot, fileName);
    const file = await buildFile(path);
    const text = await readUploadedFileText(file);
    const metadata = detectStatementMetadata(text, fileName);
    const rows = parseImportText(text, fileName, "image/png", {
      institution: metadata?.institution ?? null,
      accountName: metadata?.accountName ?? null,
      accountNumber: metadata?.accountNumber ?? null,
    });

    assert.ok(metadata, `${fileName} should resolve UnionBank screenshot metadata.`);
    assert.ok(
      /unionbank/i.test(String(metadata?.institution ?? "")),
      `${fileName} should resolve to UnionBank, got ${String(metadata?.institution ?? "")}.`
    );
    assert.equal(metadata?.accountName, "UnionBank 8037", `${fileName} should resolve the masked 8037 account.`);
    assert.equal(metadata?.accountNumber, "8037", `${fileName} should preserve the UnionBank screenshot last four.`);
    assert.equal(metadata?.accountType, "bank", `${fileName} should stay a bank account.`);

    if (fileName === "IMG_1387.PNG") {
      assert.equal(metadata?.endingBalance, 116465.28, "UnionBank dashboard screenshot should capture the available balance.");
      assert.equal(rows.length, 1, "UnionBank dashboard screenshot should create one snapshot marker row.");
      assert.equal(rows[0]?.rawPayload?.kind, "account_snapshot_marker");
      snapshotRows.add(String(rows[0]?.description ?? ""));
      continue;
    }

    assert.ok(rows.length > 0, `${fileName} should produce UnionBank screenshot transactions.`);

    for (const row of rows) {
      const description = String(row.description ?? row.merchantRaw ?? "");
      assert.ok(!/^10:\d{2}/.test(description), `${fileName} should not turn the iPhone status bar into a transaction.`);
      assert.ok(
        !/^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(description),
        `${fileName} should not treat month headers as transactions.`
      );
      assert.ok(!/Transaction History|Account Details|Download|Received Sent/i.test(description), `${fileName} should ignore UnionBank screenshot chrome.`);
      assert.equal(row.accountName, "UnionBank 8037", `${fileName} rows should attach to UnionBank 8037.`);
      assert.equal(row.accountNumber, "8037", `${fileName} rows should attach to account 8037.`);

      const key = [row.date ?? "", description, row.amount ?? ""].join("|");
      transactionRows.set(key, row);
    }
  }

  const combinedRows = Array.from(transactionRows.values());

  assert.ok(
    combinedRows.some(
      (row) =>
        row.date === "2026-04-13" &&
        row.amount === "92627.65" &&
        row.type === "income" &&
        /ONLINE PAYROLL/i.test(String(row.description ?? ""))
    ),
    "UnionBank screenshots should preserve the April 13, 2026 Online Payroll credit."
  );

  assert.ok(
    combinedRows.some(
      (row) =>
        row.date === "2026-04-06" &&
        row.amount === "50000.00" &&
        row.type === "expense" &&
        /Sent to Timothy Gunther Santos Cayanga WSE 499772/i.test(String(row.description ?? ""))
    ),
    "UnionBank screenshots should preserve the April 6, 2026 outgoing transfer to Timothy."
  );

  assert.ok(
    combinedRows.some(
      (row) =>
        row.date === "2026-02-05" &&
        row.amount === "1080.00" &&
        row.type === "income" &&
        /ONLINE FUND TRANSFER/i.test(String(row.description ?? ""))
    ),
    "UnionBank screenshots should preserve the February 5, 2026 online fund transfer credit."
  );

  assert.ok(
    combinedRows.some(
      (row) =>
        row.date === "2025-12-12" &&
        row.amount === "42822.25" &&
        row.type === "expense" &&
        /BILLS PAYMENT/i.test(String(row.description ?? ""))
    ),
    "UnionBank screenshots should preserve the December 12, 2025 Bills Payment row."
  );

  assert.ok(
    combinedRows.some(
      (row) =>
        row.date === "2025-11-30" &&
        row.amount === "4.95" &&
        row.type === "income" &&
        /Interest 11-13-2025 to 11-30-2025/i.test(String(row.description ?? ""))
    ),
    "UnionBank screenshots should preserve the November 2025 interest row."
  );

  console.log(
    `[PASS] UnionBank mobile screenshot regression | ${combinedRows.length} unique transaction rows | ${snapshotRows.size} snapshot markers`
  );
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

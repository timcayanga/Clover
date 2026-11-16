import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { readUploadedFileText } from "../lib/import-file-text.server";
import { detectStatementMetadata, parseImportText } from "../lib/import-parser";

const root = "/Users/TimCayanga1/Documents/Bank Screenshots/HSBC GBP";

const readScreenshot = async (fileName: string) => {
  const bytes = await readFile(join(root, fileName));
  return readUploadedFileText({
    name: fileName,
    type: "image/png",
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  });
};

const main = async () => {
  const detailText = await readScreenshot("IMG_1405.PNG");
  const detailMetadata = detectStatementMetadata(detailText, "IMG_1405.PNG");
  assert.equal(detailMetadata?.institution, "HSBC");
  assert.equal(detailMetadata?.currency, "GBP");
  assert.equal(detailMetadata?.accountNumber, "72514818");
  const detailRows = parseImportText(detailText, "IMG_1405.PNG", "image/png", {
    institution: detailMetadata?.institution,
    accountName: detailMetadata?.accountName,
    accountNumber: detailMetadata?.accountNumber,
  });
  assert.ok(detailRows.length >= 2);
  assert.ok(detailRows.some((row) => row.description === "Added Gross Interest" && row.amount === "0.25"));
  assert.ok(detailRows.some((row) => row.description === "Gross Interest" && row.amount === "0.11"));
  assert.ok(detailRows.every((row) => row.currency === "GBP"));

  const historyText = await readScreenshot("IMG_1406.PNG");
  const historyMetadata = detectStatementMetadata(historyText, "IMG_1406.PNG");
  assert.equal(historyMetadata?.institution, "HSBC");
  const historyRows = parseImportText(historyText, "IMG_1406.PNG", "image/png", {
    institution: historyMetadata?.institution,
    accountName: historyMetadata?.accountName,
    accountNumber: historyMetadata?.accountNumber,
  });
  assert.ok(historyRows.some((row) => row.description === "Global Money" && row.amount === "31.34" && row.categoryName === "Transfers"));
  assert.ok(historyRows.filter((row) => row.rawPayload?.kind === "hsbc_mobile_screenshot_transaction").length >= 7);

  const overviewText = await readScreenshot("IMG_1404.PNG");
  const overviewRows = parseImportText(overviewText, "IMG_1404.PNG", "image/png", {});
  assert.ok(overviewRows.filter((row) => row.rawPayload?.kind === "account_snapshot_marker").length >= 3);
  assert.equal(overviewRows.some((row) => row.description?.includes("Interest rate")), false);

  console.log(`[PASS] HSBC screenshots | overview=${overviewRows.length} rows | detail=${detailRows.length} rows | history=${historyRows.length} rows`);
};

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

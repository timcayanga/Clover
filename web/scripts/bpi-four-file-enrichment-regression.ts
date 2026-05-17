import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { strict as assert } from "node:assert";
import { detectStatementMetadataFromText, enrichParsedRowsWithTraining } from "@/lib/data-engine";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import { parseImportText } from "@/lib/import-parser";

const statementRoot = process.env.CLOVER_STATEMENT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements";
const workspaceId = process.env.CLOVER_WORKSPACE_ID ?? "regression-workspace";

const files = [
  "Samples/BPI/289783509-Statement-Bpi.pdf",
  "Samples/BPI/432739654-Statement.pdf",
  "Samples/BPI/527005183-9595490-e-79.pdf",
  "Samples/BPI/583720503-BPI-BANK-STATEMENT.pdf",
];

const readStatementText = async (relativePath: string) => {
  const absolutePath = join(statementRoot, relativePath);
  const bytes = await readFile(absolutePath);
  return readUploadedFileText({
    name: basename(absolutePath),
    type: "application/pdf",
    arrayBuffer: async () => {
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      return copy.buffer as ArrayBuffer;
    },
  });
};

const main = async () => {
  let totalRows = 0;
  let totalOtherRows = 0;
  const summaries: Array<{ fileName: string; rows: number; otherRows: number }> = [];

  for (const relativePath of files) {
    const fileName = basename(relativePath);
    const text = await readStatementText(relativePath);
    const metadata = detectStatementMetadataFromText(text);
    const parsedRows = parseImportText(text, fileName, "application/pdf", {
      institution: metadata.institution,
      accountName: metadata.accountName,
      accountNumber: metadata.accountNumber,
    });
    const enrichedRows = await enrichParsedRowsWithTraining({
      workspaceId,
      rows: parsedRows,
      statementConfidence: metadata.confidence,
    });
    const otherRows = enrichedRows.filter((row) => row.categoryName === "Other").length;

    summaries.push({ fileName, rows: enrichedRows.length, otherRows });
    totalRows += enrichedRows.length;
    totalOtherRows += otherRows;
  }

  console.table(summaries);
  assert.equal(totalRows, 64, `Expected the four BPI samples to produce 64 rows, got ${totalRows}.`);
  assert.equal(totalOtherRows, 0, `Expected deterministic enrichment to leave 0 BPI rows in Other, got ${totalOtherRows}.`);
  console.log("BPI four-file enrichment regression passed");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

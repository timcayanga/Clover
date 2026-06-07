import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { detectStatementMetadataFromText } from "@/lib/data-engine";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import { parseImportText } from "@/lib/import-parser";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const sampleRoot =
  process.env.CLOVER_RCBC_SCREENSHOT_ROOT?.trim() || "/Users/TimCayanga1/Documents/Bank Screenshots/RCBC";

const checks = [
  { fileName: "IMG_1371.PNG", accountName: "RCBC 0272", accountNumber: "0000009048500272", rowCount: 1, kind: "account_snapshot_marker" },
  { fileName: "IMG_1372.PNG", accountName: "RCBC 0272", accountNumber: "0000009048500272", rowCount: 1, merchantClean: "Cash Deposit" },
  { fileName: "IMG_1373.PNG", accountName: "RCBC 0272", accountNumber: "0000009048500272", rowCount: 1, kind: "account_snapshot_marker" },
  { fileName: "IMG_1374.PNG", accountName: "RCBC 1014", accountNumber: "1014", rowCount: 7, merchantClean: "Apple / iTunes" },
  { fileName: "IMG_1375.PNG", accountName: "RCBC 1014", accountNumber: "1014", rowCount: 4, merchantClean: "PayPal" },
  { fileName: "IMG_1376.PNG", accountName: "RCBC 1014", accountNumber: "1014", rowCount: 1, kind: "account_snapshot_marker" },
] as const;

const readImageText = async (path: string) => {
  const bytes = await readFile(path);
  return readUploadedFileText({
    name: basename(path),
    type: "image/png",
    arrayBuffer: async () => {
      const copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      return copy.buffer as ArrayBuffer;
    },
  });
};

const main = async () => {
  for (const check of checks) {
    const absoluteFilePath = join(sampleRoot, check.fileName);
    const text = await readImageText(absoluteFilePath);
    const metadata = detectStatementMetadataFromText(text, check.fileName);
    const rows = parseImportText(text, check.fileName, "image/png", {
      institution: metadata.institution,
      accountName: metadata.accountName,
      accountNumber: metadata.accountNumber,
    });

    assert.equal(metadata.institution, "RCBC", `${check.fileName} should detect RCBC.`);
    assert.equal(metadata.accountName, check.accountName, `${check.fileName} should normalize to ${check.accountName}.`);
    assert.equal(metadata.accountNumber, check.accountNumber, `${check.fileName} should normalize to ${check.accountNumber}.`);
    assert.equal(rows.length, check.rowCount, `${check.fileName} should produce ${check.rowCount} rows.`);
    assert.ok(rows.every((row) => row.accountName === check.accountName), `${check.fileName} rows should use ${check.accountName}.`);
    assert.ok(rows.every((row) => row.accountNumber === check.accountNumber), `${check.fileName} rows should use ${check.accountNumber}.`);

    if ("kind" in check) {
      assert.ok(
        rows.every((row) => {
          const rawPayload =
            row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
              ? (row.rawPayload as Record<string, unknown>)
              : null;
          return rawPayload?.kind === check.kind;
        }),
        `${check.fileName} should only emit ${check.kind} rows.`
      );
    }

    if ("merchantClean" in check) {
      assert.equal(rows[0]?.merchantClean, check.merchantClean, `${check.fileName} first row should normalize merchant.`);
    }

    console.log(
      `[PASS] ${check.fileName} | ${rows.length} rows | ${rows
        .map((row) => `${row.date ?? "no-date"} ${row.merchantClean ?? row.merchantRaw ?? "unknown"} ${row.amount ?? "0"}`)
        .join(" | ")}`
    );
  }

  console.log(`[PASS] RCBC screenshot regression | ${checks.length} files`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});

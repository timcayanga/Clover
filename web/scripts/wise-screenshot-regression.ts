import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { detectStatementMetadataFromText } from "@/lib/data-engine";
import { readUploadedFileText } from "@/lib/import-file-text.server";
import { parseImportText } from "@/lib/import-parser";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const sampleRoots = [
  process.env.CLOVER_WISE_SCREENSHOT_ROOT,
  "/Users/TimCayanga1/Documents/Bank Screenshots/Wise",
  "/Users/TimCayanga1/Documents/Bank Screenshots",
].filter((value): value is string => Boolean(value && value.trim()));

const checks = [
  { fileName: "IMG_1327.PNG", minimumRows: 4 },
  { fileName: "IMG_1328.PNG", minimumRows: 4 },
  { fileName: "IMG_1329.PNG", minimumRows: 1 },
  { fileName: "IMG_1330.PNG", minimumRows: 3 },
  { fileName: "IMG_1331.PNG", minimumRows: 4 },
  { fileName: "IMG_1332.PNG", minimumRows: 3 },
  { fileName: "IMG_1333.PNG", minimumRows: 4 },
  { fileName: "IMG_1334.PNG", minimumRows: 4 },
  { fileName: "IMG_1335.PNG", minimumRows: 4 },
  { fileName: "IMG_1336.PNG", minimumRows: 3 },
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
  let totalRows = 0;

  for (const check of checks) {
    let resolvedPath: string | null = null;
    for (const candidate of sampleRoots.map((root) => join(root, check.fileName))) {
      try {
        await readFile(candidate);
        resolvedPath = candidate;
        break;
      } catch {
        // Try the next candidate root.
      }
    }
    assert.ok(resolvedPath, `${check.fileName} should exist in one of: ${sampleRoots.join(", ")}`);
    const absoluteFilePath = resolvedPath as string;
    const text = await readImageText(absoluteFilePath);
    const metadata = detectStatementMetadataFromText(text);
    const rows = parseImportText(text, check.fileName, "image/png", {
      institution: metadata.institution,
      accountName: metadata.accountName,
      accountNumber: metadata.accountNumber,
    });

    assert.equal(metadata.institution, "Wise", `${check.fileName} should detect Wise.`);
    assert.equal(metadata.accountName, "Wise", `${check.fileName} should keep the plain Wise account label.`);
    assert.equal(metadata.accountNumber, null, `${check.fileName} should not invent an account number.`);
    assert.ok(rows.length >= check.minimumRows, `${check.fileName} should recover at least ${check.minimumRows} Wise rows.`);

    const zeroVerificationRows = rows.filter((row) => {
      const rawPayload =
        row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
          ? (row.rawPayload as Record<string, unknown>)
          : null;
      return Number(row.amount) === 0 && /^Card checked$/i.test(String(rawPayload?.status ?? ""));
    });
    assert.equal(zeroVerificationRows.length, 0, `${check.fileName} should not confirm zero-value Card checked rows.`);

    totalRows += rows.length;
    console.log(
      `[PASS] ${check.fileName} | ${rows.length} rows | ${rows
        .slice(0, 3)
        .map((row) => `${row.date ?? "no-date"} ${row.merchantRaw ?? "unknown"} ${row.amount ?? "0"} ${row.currency ?? ""}`.trim())
        .join(" | ")}`
    );
  }

  console.log(`[PASS] Wise screenshot regression | ${checks.length} files | ${totalRows} rows`);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });

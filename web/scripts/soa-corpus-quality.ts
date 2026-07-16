import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { assessStatementExtractionQuality } from "@/lib/import-quality";
import { detectStatementMetadataFromText } from "@/lib/data-engine";
import { parseImportText } from "@/lib/import-parser";
import { getStrongMerchantCategoryHint } from "@/lib/merchant-category-hints";

type CorpusFileResult = {
  file: string;
  bank: string;
  pageCount: number;
  rows: number;
  datedRows: number;
  normalizedRows: number;
  otherRows: number;
  recoverableOtherRows: number;
  duplicateKeyRate: number;
  identity: boolean;
  protected: boolean;
  visualRequired: boolean;
  error?: string;
};


const root = process.env.CLOVER_ACTUAL_SOA_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements/Actual SOAs";

const listPdfFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listPdfFiles(path)));
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".pdf") {
      files.push(path);
    }
  }
  return files.sort();
};

const readPdfText = async (filePath: string) => {
  const bytes = await readFile(filePath);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const positionedItems = content.items
      .map((item) => {
        if (!("str" in item) || typeof item.str !== "string" || !item.str.trim()) {
          return null;
        }

        const transform = "transform" in item && Array.isArray(item.transform) ? item.transform : [];
        return {
          text: item.str.trim(),
          x: typeof transform[4] === "number" ? transform[4] : 0,
          y: typeof transform[5] === "number" ? transform[5] : 0,
        };
      })
      .filter((item): item is { text: string; x: number; y: number } => Boolean(item));

    // PDF text items are often emitted as individual characters. Rebuild
    // visual lines before handing the text to the deterministic parser.
    const lines: Array<{ y: number; items: Array<{ text: string; x: number }> }> = [];
    for (const item of positionedItems.sort((left, right) => right.y - left.y || left.x - right.x)) {
      const currentLine = lines.at(-1);
      if (currentLine && Math.abs(currentLine.y - item.y) <= 2) {
        currentLine.items.push(item);
      } else {
        lines.push({ y: item.y, items: [item] });
      }
    }

    pageTexts.push(
      lines
        .sort((left, right) => right.y - left.y)
        .map((line) => line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" "))
        .join("\n")
    );
  }
  return { text: pageTexts.join("\n"), pageCount: document.numPages };
};

const summarizeFile = async (filePath: string): Promise<CorpusFileResult> => {
  const relativeFile = relative(root, filePath);
  const relativeParts = relativeFile.split(/[\\/]/).filter(Boolean);
  const bank = relativeParts.length > 1 ? relativeParts[0] ?? "Unknown" : basename(root) || "Unknown";
  try {
    const extraction = await readPdfText(filePath);
    if (extraction.text.trim().length < 40) {
      return {
        file: relativeFile,
        bank,
        pageCount: extraction.pageCount,
        rows: 0,
        datedRows: 0,
        normalizedRows: 0,
        otherRows: 0,
        recoverableOtherRows: 0,
        duplicateKeyRate: 0,
        identity: false,
        protected: false,
        visualRequired: true,
      };
    }
    const metadata = detectStatementMetadataFromText(extraction.text, basename(filePath));
    const rows = parseImportText(extraction.text, basename(filePath), "application/pdf", {
      institution: metadata.institution,
      accountName: metadata.accountName,
      accountNumber: metadata.accountNumber,
    }).filter((row) => row.rawPayload?.kind !== "opening_balance");
    const quality = assessStatementExtractionQuality({ rows, pageCount: extraction.pageCount });
    const datedRows = rows.filter((row) => Boolean(row.date)).length;
    const normalizedRows = rows.filter((row) => Boolean(row.merchantClean?.trim())).length;
    const otherRows = rows.filter((row) => row.categoryName?.toLowerCase() === "other");
    const recoverableOtherRows = otherRows.filter((row) => getStrongMerchantCategoryHint(String(row.merchantClean ?? row.merchantRaw ?? row.description ?? ""))).length;
    return {
      file: relativeFile,
      bank,
      pageCount: extraction.pageCount,
      rows: rows.length,
      datedRows,
      normalizedRows,
      otherRows: otherRows.length,
      recoverableOtherRows,
      duplicateKeyRate: quality.duplicateKeyRate,
      identity: Boolean(metadata.institution || metadata.accountNumber || metadata.accountName),
      protected: false,
      // A sparse text layer on a multi-page statement usually means the table
      // is image-backed; do not count it as complete parser coverage.
      visualRequired: extraction.pageCount > 1 && rows.length <= 1,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const protectedFile = /password|encrypted|needpassword/i.test(message);
    return {
      file: relativeFile,
      bank,
      pageCount: 0,
      rows: 0,
      datedRows: 0,
      normalizedRows: 0,
      otherRows: 0,
      recoverableOtherRows: 0,
      duplicateKeyRate: 0,
      identity: false,
      protected: protectedFile,
      visualRequired: false,
      ...(protectedFile ? {} : { error: message }),
    };
  }
};

const rate = (count: number, total: number) => (total > 0 ? count / total : 0);

const main = async () => {
  const files = await listPdfFiles(root);
  const results: CorpusFileResult[] = [];
  for (const file of files) {
    results.push(await summarizeFile(file));
  }
  const evaluated = results.filter((result) => !result.error && !result.protected);
  const parsed = evaluated.filter((result) => !result.visualRequired);
  const totalRows = parsed.reduce((sum, result) => sum + result.rows, 0);
  const totalDatedRows = parsed.reduce((sum, result) => sum + result.datedRows, 0);
  const totalNormalizedRows = parsed.reduce((sum, result) => sum + result.normalizedRows, 0);
  const totalOtherRows = parsed.reduce((sum, result) => sum + result.otherRows, 0);
  const totalRecoverableOtherRows = parsed.reduce((sum, result) => sum + result.recoverableOtherRows, 0);
  const totalDuplicateRiskRows = parsed.reduce((sum, result) => sum + result.duplicateKeyRate * result.rows, 0);
  const highRiskFiles = evaluated.filter((result) => result.visualRequired || result.rows === 0 || rate(result.otherRows, result.rows) > 0.2 || rate(result.normalizedRows, result.rows) < 0.75 || result.duplicateKeyRate > 0.05);

  const output = {
    root,
    files: results.length,
    parsedFiles: parsed.length,
    failedFiles: results.filter((result) => result.error).length,
    protectedFiles: results.filter((result) => result.protected).length,
    visualRequiredFiles: results.filter((result) => result.visualRequired).length,
    totals: {
      rows: totalRows,
      dateCoverage: rate(totalDatedRows, totalRows),
      normalizedNameCoverage: rate(totalNormalizedRows, totalRows),
      otherRate: rate(totalOtherRows, totalRows),
      recoverableOtherRate: rate(totalRecoverableOtherRows, totalRows),
      duplicateKeyRate: rate(totalDuplicateRiskRows, totalRows),
      identityCoverage: rate(parsed.filter((result) => result.identity).length, parsed.length),
    },
    highRiskFiles: highRiskFiles.map((result) => result.file),
    results,
  };

  console.log(JSON.stringify(output, null, 2));
  if (output.failedFiles > 0 || output.visualRequiredFiles > 0 || output.totals.otherRate > 0.2 || output.totals.normalizedNameCoverage < 0.75) {
    process.exitCode = 2;
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

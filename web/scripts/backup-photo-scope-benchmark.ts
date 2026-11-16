/** Synthetic-only live benchmark. Run with model-migration-eval-preload.cjs
 * and CLOVER_MODEL_MIGRATION_EVAL=1 to forbid database access. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { transcribeImportImagesWithOpenAI } from "../lib/openai-import-parser";
import backupCaseLabels from "./fixtures/financial-photo-scope/backup-case-labels.json";
import { readLocalReceiptImage, shutdownLocalReceiptOcr } from "../lib/local-receipt-ocr.server";
import { getBoundedImportImagePreview } from "../lib/import-image-validation.server";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";

assert.equal(process.env.CLOVER_MODEL_MIGRATION_EVAL, "1");
assert.ok(process.env.OPENAI_API_KEY?.trim(), "An OpenAI key is required.");

type Scope = ReturnType<typeof assessFinancialUploadScope>["decision"];
const cases: { id: string; expected: Scope; lines: string[]; faded?: boolean }[] = [
  { id: "menu-priced-items", expected: "non_financial", lines: ["Harbour Coffee Menu", "Latte PHP 150.00", "Sandwich PHP 200.00", "Tax included"] },
  { id: "coupon-with-price", expected: "non_financial", lines: ["Voucher Market Coupon", "Redeem before October 1", "Terms apply", "Save PHP 25.00"] },
  { id: "cart-with-total", expected: "non_financial", lines: ["Your Cart", "Coffee PHP 150.00", "Grand Total PHP 168.00", "Payment method: Card", "Place order"] },
  { id: "resume", expected: "non_financial", lines: ["Resume Studio", "Professional experience", "Education and qualifications", "Portfolio design and research"] },
  { id: "wallet-home", expected: "non_financial", lines: ["Home", "Available balance", "PHP 500.00", "Send money", "Cash in", "Pay bills"] },
  { id: "success-banner", expected: "non_financial", lines: ["Congratulations!", "Transfer Successful", "PHP 500.00", "Done"] },
  { id: "receipt-menu-merchant", expected: "financial", lines: ["The Lunch Menu", "Receipt", "2026-08-01", "Lunch PHP 125.00", "Coffee PHP 25.00", "Total PHP 150.00"] },
  { id: "receipt-voucher-footer", expected: "financial", lines: ["Daily Recipe", "Official Receipt", "2026-08-01", "Total PHP 125.00", "ADVERTISEMENT: Save on your next purchase", "Redeem before October 1", "Total USD 999.00"] },
  { id: "receipt-resume-merchant", expected: "financial", lines: ["Resume Studio", "Official Receipt", "2026-08-01", "Editing PHP 125.00", "Total PHP 125.00"] },
  { id: "receipt-faded", expected: "financial", faded: true, lines: ["Clover Corner", "Official Receipt", "2026-08-01", "Coffee PHP 125.00", "Total PHP 125.00"] },
  { id: "receipt-indonesian", expected: "financial", lines: ["Kedai Kopi", "Bukti Pembayaran", "Jumlah Bayar Rp 35.000"] },
  { id: "illegible-partial-heading", expected: "ambiguous", lines: ["HARBOUR CAFE", "Receipt", "D...te", "T...al"] },
];

const models = [...new Set([
  "gpt-5.4-mini", "gpt-5.5",
  process.env.OPENAI_IMPORT_PARSER_MODEL,
  process.env.OPENAI_IMPORT_PARSER_IMAGE_MODEL,
  process.env.OPENAI_IMPORT_PARSER_OCR_MODEL,
  process.env.OPENAI_IMPORT_PARSER_STRONG_MODEL,
  process.env.OPENAI_IMPORT_PARSER_PDF_MODEL,
].filter((model): model is string => Boolean(model?.trim())).map(model => model.trim())
  .filter(model => !/gpt-image/i.test(model)))];

async function main() {
  const images = await Promise.all(cases.map(async item => {
    assert.ok(Object.hasOwn(backupCaseLabels, item.id), `Missing measurement labels for ${item.id}`);
    const ink = item.faded ? "#969696" : "#182427";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="460">
      <rect width="760" height="460" fill="#efefeb"/>
      <rect x="30" y="20" width="700" height="420" fill="#fff"/>
      <g font-family="sans-serif" font-size="25" fill="${ink}">
        ${item.lines.map((line, index) => `<text x="55" y="${70 + index * 46}">${line}</text>`).join("")}
      </g></svg>`;
    const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
    return { bytes, page: 1, dataUrl: `data:image/png;base64,${bytes.toString("base64")}` };
  }));

  const localReads: Array<{ verdict: Scope; confidence: number; elapsedMs: number }> = [];
  let readableLocalCases = 0;
  try {
    for (const image of images) {
      const started = performance.now();
      const text = await readLocalReceiptImage(await getBoundedImportImagePreview(image.bytes));
      if (text?.trim()) readableLocalCases += 1;
      const localScope = assessFinancialUploadScope({ text, fileName: "upload.png" });
      localReads.push({ verdict: localScope.decision, confidence: localScope.confidence,
        elapsedMs: Math.round(performance.now() - started) });
    }
  } finally {
    await shutdownLocalReceiptOcr();
  }

  assert.ok(readableLocalCases > 0, "Local OCR produced no readable cases for threshold replay.");
  const output = process.argv[2] ?? "/tmp/clover-backup-photo-scope-results.json";
  const rows = [];
  for (const model of models) {
    // The production fast_only strategy sends exactly one candidate. Set the
    // image slot only in this process so fallbacks cannot mask model errors.
    process.env.OPENAI_IMPORT_PARSER_IMAGE_MODEL = model;
    for (let start = 0; start < cases.length; start += 4) {
      const batch = await Promise.all(cases.slice(start, start + 4).map(async (item, offset) => {
        const began = performance.now();
        let calls = 0;
        const result = await transcribeImportImagesWithOpenAI({
          consentUserId: "synthetic-model-eval",
          fileName: "upload.png",
          fileType: "image/png",
          pageImages: [{ page: 1, dataUrl: images[start + offset].dataUrl }],
          onRequest: () => { calls += 1; },
          importMode: "statement",
          strategy: "fast_only",
          timeoutMs: 60000,
        });
        if (result) assert.equal(result.model, model);
        const actual = result ? assessFinancialUploadScope({ text: result.transcript, fileName: "upload.png" }).decision : null;
        const elapsedMs = Math.round(performance.now() - began);
        return {
          local: localReads[start + offset],
          backup: calls ? { verdict: actual, calls, elapsedMs } : undefined,
          model, case: item.id, platform: "server", expected: item.expected, actual,
          ...backupCaseLabels[item.id as keyof typeof backupCaseLabels],
          classification: result?.classificationVerdict.documentType ?? null,
          elapsedMs,
        };
      }));
      rows.push(...batch);
      writeFileSync(output, JSON.stringify(rows, null, 2) + "\n");
    }
    const results = rows.filter(row => row.model === model);
    console.log("BACKUP_SCOPE", JSON.stringify({
      model, cases: results.length,
      correct: results.filter(row => row.expected === row.actual).length,
      falseRejections: results.filter(row => row.expected === "financial" && row.actual === "non_financial").length,
      falseAcceptances: results.filter(row => row.expected === "non_financial" && row.actual === "financial").length,
      ambiguousHardRejected: results.filter(row => row.expected === "ambiguous" && row.actual === "non_financial").length,
      unavailable: results.filter(row => row.actual === null).length,
    }));
  }
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : "Benchmark failed");
  process.exitCode = 1;
});

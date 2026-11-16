import { getBoundedImportImagePreview } from "../lib/import-image-validation.server";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { assessFinancialUploadScope } from "../lib/financial-upload-scope";
import { readLocalReceiptImage, shutdownLocalReceiptOcr, type LocalReceiptOcrTimings } from "../lib/local-receipt-ocr.server";
import manifest from "./fixtures/financial-photo-scope/manifest.json";

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) ids.push("telecom-official-receipt", "faded-long-pos-receipt", "restaurant-pos-tax-footer");
  const root = process.env.CLOVER_RECEIPT_SAMPLES_ROOT ?? join(homedir(), "Documents", "Receipt Samples");
  for (const id of ids) {
    const sample = manifest.cases.find(item => item.id === id && item.source === "receipt_samples");
    assert(sample, `Unknown local diagnostic fixture: ${id}`);
    const bytes = await readFile(join(root, sample.path));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), sample.sha256);
    const fileType = sample.format === "JPEG" ? "image/jpeg" : `image/${sample.format.toLowerCase()}`;
    await shutdownLocalReceiptOcr();
    const server = createServer(async (_request, response) => {
      try {
        const timings: LocalReceiptOcrTimings = {};
        const decodeStarted = performance.now();
        // Each upload is a new byte object. Warm runs reuse the worker and
        // models while still preparing a fresh preview for the incoming photo.
        const preview = await getBoundedImportImagePreview(new Uint8Array(bytes));
        const ocrStarted = performance.now();
        const text = await readLocalReceiptImage(preview, timings);
        const classificationStarted = performance.now();
        const scope = text ? assessFinancialUploadScope({ text, fileType }) : null;
        const verdict = scope?.decision ?? null;
        const completed = performance.now();
        response.setHeader("Content-Type", "application/json");
        response.setHeader("X-Verdict-Ready", completed.toString());
        response.end(JSON.stringify({
          verdict,
          confidence: scope?.confidence ?? null,
          ...timings,
          decodeMs: ocrStarted - decodeStarted,
          workerRoundTripMs: classificationStarted - ocrStarted,
          classificationMs: text ? completed - classificationStarted : null,
        }));
      } catch {
        response.writeHead(500).end();
      }
    });
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      assert(address && typeof address !== "string");
      for (const run of ["cold", "warm", "warm"]) {
        const started = performance.now();
        const response = await fetch(`http://127.0.0.1:${address.port}/verdict`, { signal: AbortSignal.timeout(30_000) });
        assert(response.ok, "Local verdict endpoint failed");
        const result = await response.json();
        const received = performance.now();
        const ready = Number(response.headers.get("X-Verdict-Ready"));
        assert(ready >= started && ready <= received);
        console.log(JSON.stringify({
          case: id, expected: sample.expected.verdict, run, ...result,
          verdictDeliveryMs: received - ready,
          totalMs: received - started,
        }));
        assert(result.verdict !== null, `OCR unavailable during ${id} ${run}`);
        assert(["runtimeInitMs", "decodeMs", "modelInitMs", "localOcrMs", "classificationMs"]
          .every(key => Number.isFinite(result[key]) && result[key] >= 0));
      }
    } finally {
      await Promise.all([
        new Promise<void>(resolve => server.close(() => resolve())),
        shutdownLocalReceiptOcr(),
      ]);
    }
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

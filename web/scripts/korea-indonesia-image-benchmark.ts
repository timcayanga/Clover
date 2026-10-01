import { readLocalReceiptOcrText } from "../lib/local-receipt-ocr-envelope";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { cpus } from "node:os";
import { readUploadedFileText, shutdownImportOcrWorkers } from "../lib/import-file-text.server";
import { parseReceiptText, assessReceiptPreviewQuality } from "../lib/split-bill";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => args.find(arg => arg.startsWith(name + "="))?.slice(name.length + 1) ?? fallback;
const manifestPath = option("--manifest", fileURLToPath(new URL("./fixtures/korea-indonesia-public/image-benchmark-manifest.json", import.meta.url)));
const imageRoot = option("--image-root", join(tmpdir(), "clover-regional-benchmark", "images"));
const output = option("--out", join(tmpdir(), "clover-regional-benchmark", `ocr-${Date.now()}.json`));
const transcriptRoot = join(dirname(output), basename(output, ".json") + "-transcripts");
const repeats = Number(option("--repeats", "2"));
assert.ok(Number.isInteger(repeats) && repeats >= 2 && repeats <= 5, "Use 2–5 rounds so warm latency is measurable");
type Sample = { id: string; country: string; path?: string; fileName?: string; sha256: string; expectedTotal: string; sourceUrl: string; datasetRow?: number; liveExpected?: { missing?: string[] } };
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const samples = (Array.isArray(manifest) ? manifest : manifest.samples) as Sample[];
assert.ok(samples.length > 0 && ["KR", "ID"].every(country => samples.some(s => s.country === country)));
assert.equal(new Set(samples.map(s => s.id)).size, samples.length);
const targets = { warmP95Ms: 30000, exactTotalCoverage: .95, unsafeFastAcceptance: 0 };
const hash = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

async function loadSample(sample: Sample) {
  const path = sample.path ?? resolve(imageRoot, basename(sample.fileName!));
  if (!existsSync(path)) {
    assert.ok(args.includes("--download"), `Image missing: ${path}. Re-run with --download to fetch public originals.`);
    let url = sample.sourceUrl;
    if (sample.country === "ID") {
      assert.ok(Number.isInteger(sample.datasetRow), "Missing source dataset row");
      const response = await fetch(`https://datasets-server.huggingface.co/rows?dataset=naver-clova-ix/cord-v2&config=default&split=train&offset=${sample.datasetRow}&length=1`, { signal: AbortSignal.timeout(30000) });
      assert.ok(response.ok, "Unable to fetch public CORD image reference");
      const row = (await response.json()).rows[0];
      assert.equal(row.row_idx, sample.datasetRow);
      url = row.row.image.src;
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    assert.ok(response.ok, `Public image download failed for ${sample.id}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(hash(bytes), sample.sha256, "Source image changed; do not replace ground truth automatically");
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes);
  }
  const bytes = readFileSync(path);
  assert.equal(hash(bytes), sample.sha256, `${sample.id}: source hash mismatch`);
  return bytes;
}
async function main() {
  const results: Array<{ id: string; country: string; round: number; engine: string; expected: string; actual: string | null; exact: boolean; safe: boolean; requiresReview?: boolean; fastPath: boolean; currency: string; ocrMs: number; totalMs: number; transcriptSha256: string; sourceSha256: string }> = [];
  // Download/read inputs before timing. Never use dataset labels to inform OCR.
  const inputs = [];
  for (const sample of samples) inputs.push({ sample, bytes: await loadSample(sample) });
  const startedAt = new Date().toISOString();
  const save = () => {
    const countries = ["KR", "ID"].map(country => {
      const entries = samples.filter(s => s.country === country).map(s => results.filter(r => r.id === s.id));
      const exact = entries.filter(rows => rows.length === repeats && rows.every(r => r.exact)).length;
      return { country, documents: entries.length, consistentlyExact: exact, coverage: exact / entries.length };
    });
    const warm = results.filter(r => r.round > 0).map(r => r.totalMs).sort((a,b) => a-b);
    const warmP95Ms = warm[Math.max(0, Math.ceil(warm.length * .95) - 1)] ?? null;
    const unsafeFastAcceptance = results.filter(r => !r.safe).length;
    const complete = results.length === samples.length * repeats;
    const accuracyPassed = complete && countries.every(c => c.coverage >= targets.exactTotalCoverage);
    const safetyPassed = unsafeFastAcceptance === 0;
    const speedPassed = complete && warmP95Ms !== null && warmP95Ms <= targets.warmP95Ms;
    const report = { startedAt, updatedAt: new Date().toISOString(), method: "Public original receipt images through readUploadedFileText + parseReceiptText. Downloads and input reads excluded; normalization/OCR/parsing included. No file cache, cloud AI, queue, persistence or customer account. Round 0 includes worker initialization; later rounds reuse workers. Model weights may already be cached on disk; cold model downloads are measured separately. This is a small development diagnostic, not production accuracy or full field accuracy. Total ground truth is not passed to OCR. Missing/uncertain currencies and other fields remain review-required.", environment: { node: process.version, cpu: cpus()[0]?.model }, targets, repeats, complete, accuracyPassed, safetyPassed, speedPassed, passed: accuracyPassed && safetyPassed && speedPassed, countries, warmP95Ms, unsafeFastAcceptance, results };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    return report;
  };
  try {
    for (let round = 0; round < repeats; round++) for (const { sample, bytes } of inputs) {
      const file = new File([bytes], `${sample.id}.jpg`, { type: "image/jpeg" });
      const start = performance.now();
      const text = await readUploadedFileText(file, undefined, { importMode: "receipt" });
      const ocrMs = performance.now() - start;
      const parsed = parseReceiptText(text);
      const totalMs = performance.now() - start;
      const exact = parsed.total === sample.expectedTotal;
      const fastPath = assessReceiptPreviewQuality(parsed).reliableForFastPath;
      const result = { engine: readLocalReceiptOcrText(text) === null ? "tesseract" : "ppocr-v5-local", id: sample.id, country: sample.country, round, expected: sample.expectedTotal, actual: parsed.total, exact, safe: !fastPath || (exact && !sample.liveExpected?.missing?.length), requiresReview: parsed.requiresReview, fastPath, currency: parsed.currency, ocrMs: +ocrMs.toFixed(1), totalMs: +totalMs.toFixed(1), transcriptSha256: hash(text), sourceSha256: sample.sha256 };
      results.push(result);
      // Originals may contain publisher-visible personal data. Keep complete OCR
      // transcripts only in local temporary storage, never source control/logs.
      mkdirSync(transcriptRoot, { recursive: true });
      writeFileSync(join(transcriptRoot, `${sample.id}-${round}.txt`), text);
      save(); console.log(JSON.stringify(result));
    }
  } finally { await shutdownImportOcrWorkers(); }
  const report = save();
  console.log(JSON.stringify({ accuracyPassed: report.accuracyPassed, safetyPassed: report.safetyPassed, speedPassed: report.speedPassed, countries: report.countries, warmP95Ms: report.warmP95Ms, report: output }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });

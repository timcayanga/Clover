import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseImportText, parseImportTextGenericOnly, hasReconciledBdoInlineLedger } from "../lib/import-parser";
import { parseReceiptText } from "../lib/split-bill";
import { readUploadedFileText, pdfTextLayerLooksSufficientForParsing } from "../lib/import-file-text.server";

import { detectStatementMetadataFromText } from "../lib/data-engine";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type CorpusCase = {
  id: string; source: string; sha256: string; kind: "statement" | "screenshot" | "receipt";
  representation: string; expectedMetadata?: Json; context?: Parameters<typeof parseImportText>[3]; expected: Json;
  provenance: { origin: string; reviewer: string; reviewedAt: string; status: string; basis: string };
};
const root = join(process.cwd(), "scripts/fixtures/reviewed-parser-corpus");
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

// Check specified semantic fields, exact ordered row/item multiplicity and
// exact decimal amounts. Internal diagnostic additions can remain additive.
export function assertReviewedResult(actual: unknown, expected: Json, label: string): void {
  if (Array.isArray(expected)) {
    assert(Array.isArray(actual), `${label}: expected array`);
    assert.equal(actual.length, expected.length, `${label}: occurrence count`);
    expected.forEach((value, i) => assertReviewedResult(actual[i], value, `${label}[${i}]`));
  } else if (expected !== null && typeof expected === "object") {
    assert(actual !== null && typeof actual === "object", `${label}: expected object`);
    const value = actual as Record<string, unknown>;
    for (const [key, required] of Object.entries(expected)) {
      if (key === "maxConfidence") {
        assert(typeof value.confidence === "number" && value.confidence <= Number(required), `${label}: confidence must remain capped`);
      } else if (key === "requiresCurrencyWarning") {
        assert(typeof value.currencyWarning === "string" && value.currencyWarning.length > 0, `${label}: missing currency warning`);
      } else if (key === "amount") {
        assert.equal(Number(value[key]).toFixed(2), required, `${label}.${key}`);
      } else assertReviewedResult(value[key], required, `${label}.${key}`);
    }
  } else assert.deepEqual(actual, expected, label);
}

async function main() {
  assert.equal(process.argv.length, 2, "No filters, skips or snapshot-update flags in the release corpus");
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as { schemaVersion: number; cases: CorpusCase[] };
  const lock = JSON.parse(readFileSync(join(root, "review-lock.json"), "utf8")) as Record<string, string>;
  assert.equal(manifest.schemaVersion, 1);
  assert(manifest.cases.length >= 23, "Reviewed baseline may only grow; removals require an explicit contract change");
  assert.equal(new Set(manifest.cases.map(c => c.id)).size, manifest.cases.length, "Duplicate corpus IDs");
  assert.deepEqual(Object.keys(lock).sort(), manifest.cases.map(c => c.id).sort(), "Unreviewed addition or removed case");
  assert.deepEqual(readdirSync(root).filter(f => !["manifest.json", "review-lock.json"].includes(f)).sort(), manifest.cases.map(c => c.source).sort(), "Every retained fixture must be registered");
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("Reviewed corpus forbids provider calls"); };
  const failures: string[] = [];
  let rows = 0;
  for (const c of manifest.cases) {
    try {
      assert.equal(basename(c.source), c.source, "Source must live in the corpus directory");
      assert(["statement", "screenshot", "receipt"].includes(c.kind), "Unknown corpus runner kind");
      assert.equal(c.provenance.status, "reviewed");
      assert.equal(c.provenance.origin, "synthetic", "Private documents belong in the preserved private corpus");
      assert(c.provenance.reviewer && c.provenance.reviewedAt && c.provenance.basis.length > 40 && c.representation);
      assert.equal(sha(JSON.stringify(c)), lock[c.id], `${c.id}: case changed without a review record`);
      const bytes = readFileSync(join(root, c.source));
      assert.equal(sha(bytes), c.sha256, "Source bytes changed after review");
      const ext = extname(c.source);
      const mime: Record<string, string> = { ".csv": "text/csv", ".tsv": "text/tab-separated-values", ".ofx": "application/x-ofx", ".mt940": "application/x-mt940", ".xml": "application/xml", ".json": "application/json", ".qif": "application/qif", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xls": "application/vnd.ms-excel", ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12", ".xlsb": "application/vnd.ms-excel.sheet.binary.macroEnabled.12", ".ods": "application/vnd.oasis.opendocument.spreadsheet" };
      const type = mime[ext] ?? "application/pdf";
      const text = [".xlsx", ".xls", ".xlsm", ".xlsb", ".ods"].includes(ext)
        ? await readUploadedFileText({ name: c.source, type, arrayBuffer: async () => Uint8Array.from(bytes).buffer })
        : bytes.toString("utf8");
      if (c.expectedMetadata) assertReviewedResult(detectStatementMetadataFromText(text), c.expectedMetadata, `${c.id}: metadata`);
      if (c.kind === "receipt") {
        const result = parseReceiptText(text);
        assertReviewedResult(result, c.expected, c.id);
        assert.equal(result.receiptText.trim(), text.trim(), "Receipt evidence must retain all source lines (outer whitespace is normalized)");
        rows += result.items.length;
      } else {
        const parse = (name: string) => c.kind === "screenshot"
          ? parseImportTextGenericOnly(text, name, "image/png", c.context)
          : parseImportText(text, name, type, c.context);
        const result = parse(c.source);
        assertReviewedResult(result, c.expected, c.id);
        for (const row of result) {
          assert(row.rawPayload && Object.keys(row.rawPayload).length, `${c.id}: source evidence removed`);
          assert(JSON.stringify(row.rawPayload).length > 30, `${c.id}: source evidence is empty`);
        }
        if (c.id.startsWith("eastwest-template-")) {
          assert(result.every(row => row.rawPayload?.balance == null), "Unverified template balance must not become source evidence");
          if (c.id.endsWith("blank-account")) assert(result.every(row => !row.accountNumber), "A blank account header must never borrow another template's identity");
        }
        if (c.id === "bdo-full-month-ledger") {
          assert(pdfTextLayerLooksSufficientForParsing(text), "Reconciled native BDO text must not be destroyed by OCR");
          assertReviewedResult(parse("renamed-unfamiliar.pdf"), c.expected, "renamed BDO source");
          assert.equal(hasReconciledBdoInlineLedger(text.replace("Deposits P 4,000.00", "Deposits P 4,001.00")), false, "Contradicting totals cannot enter the trusted native path");
          assert.equal(hasReconciledBdoInlineLedger(text.replaceAll("September 25", "September 31")), false, "Invalid calendar dates cannot enter the trusted native path");
        }
        rows += result.length;
      }
      console.log(`[PASS] reviewed corpus: ${c.id}`);
    } catch (error) { failures.push(`${c.id}: ${error instanceof Error ? error.message : error}`); }
  }
  assert.equal(networkCalls, 0, "Corpus must remain deterministic and offline");
  assert.deepEqual(failures, [], "Reviewed corpus failures");
  // Prove the comparison rejects exactly the regressions this gate protects.
  const truth = [{ amount: "25.00", currency: "PHP", accountNumber: "0001", rawPayload: { line: "original evidence" } }];
  for (const mutation of [[], [{ ...truth[0], amount: "24.00" }], [{ ...truth[0], currency: "USD" }], [{ ...truth[0], accountNumber: "1" }], [{ ...truth[0], rawPayload: {} }], [...truth, ...truth]]) {
    assert.throws(() => assertReviewedResult(mutation, truth, "deliberate regression"));
  }
  console.log(`Reviewed parser corpus passed: ${manifest.cases.length} sources; ${rows} transaction/item observations. Reviewer: Codex (source review), not a claim of user confirmation.`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

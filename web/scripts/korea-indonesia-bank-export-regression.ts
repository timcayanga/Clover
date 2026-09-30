import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseImportText, type ImportParseContext } from "../lib/import-parser";
import { decodeStructuredDelimitedBytes } from "../lib/structured-delimited-decoder";
import { validateImportFileBytes } from "../lib/import-file-validation";

type Case = {
  id: string; country: string; source: string; synthetic: boolean; fileName: string;
  input: string; sha256: string; bytesBase64?: string; bytesSha256?: string;
  expectedError?: boolean; expectedRows?: Record<string, unknown>[];
  review?: boolean; context?: ImportParseContext;
};
const corpus = JSON.parse(readFileSync(new URL("./fixtures/korea-indonesia-bank-exports/cases.json", import.meta.url), "utf8")) as {
  cases: Case[]; sources: { id: string }[];
};
const hash = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
const subset = (actual: unknown, expected: unknown, label: string) => {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    assert.ok(actual && typeof actual === "object", label);
    for (const [key, value] of Object.entries(expected)) subset((actual as Record<string, unknown>)[key], value, `${label}.${key}`);
  } else assert.deepEqual(actual, expected, label);
};
const failures: string[] = [];
let rowsChecked = 0;
for (const fixture of corpus.cases) {
  try {
    assert.equal(fixture.synthetic, true);
    assert.ok(corpus.sources.some(source => source.id === fixture.source));
    assert.equal(hash(fixture.input), fixture.sha256);
    let text = fixture.input;
    if (fixture.bytesBase64) {
      const bytes = Buffer.from(fixture.bytesBase64, "base64");
      assert.equal(hash(bytes), fixture.bytesSha256);
      text = decodeStructuredDelimitedBytes(bytes);
      assert.equal(text, fixture.input.replace(/^\uFEFF/, ""), "Real encoded bytes must decode without losing Hangul or numbers");
    }
    const json = fixture.fileName.endsWith(".json");
    const parse = () => parseImportText(text, fixture.fileName, json ? "application/json" : "text/csv", fixture.context);
    if (fixture.expectedError) {
      assert.throws(parse, /Nothing was added|safely|incomplete|conflicting|unsupported/i);
      continue;
    }
    const rows = parse();
    assert.equal(rows.length, fixture.expectedRows!.length, fixture.id);
    if (fixture.source !== "clover-synthetic") {
      assert.match(validateImportFileBytes({ bytes: Buffer.from(text), fileName: fixture.fileName, contentType: "application/json" }) ?? "", /not a recognized financial export/);
    }
    rows.forEach((row, index) => {
      subset(row, fixture.expectedRows![index], `${fixture.id}[${index}]`);
      assert.ok((row.parserConfidence ?? 0) > 0 && (row.parserConfidence ?? 101) <= 100);
      if (fixture.review) {
        assert.equal(row.rawPayload?.reviewRequired, true);
        assert.ok(String(row.rawPayload?.reviewReason ?? "").length > 0);
        assert.ok(row.confidence! < 80 && row.parserConfidence! < 80);
      }
      if (json) {
        const original = JSON.parse(text);
        assert.equal(row.rawPayload?.kind, "financial_exchange_transaction");
        assert.equal(row.rawPayload?.format, "json");
        assert.deepEqual(row.rawPayload?.sourceRecord, original.transactions[row.rawPayload?.sourceIndex as number]);
      } else assert.ok(Array.isArray(row.rawPayload?.sourceCells));
      rowsChecked++;
    });
    if (json && rows.length) {
      const validation = validateImportFileBytes({ bytes: Buffer.from(text), fileName: fixture.fileName, contentType: "application/json" });
      assert.equal(validation, null, "Supported fixtures must reach the parser through upload validation");
    }
  } catch (error) { failures.push(`${fixture.id}: ${error instanceof Error ? error.message : String(error)}`); }
}
assert.equal(new Set(corpus.cases.map(fixture => fixture.id)).size, corpus.cases.length);
if (failures.length) {
  console.error(failures.join("\n"));
  throw new Error(`${failures.length}/${corpus.cases.length} bank-export corpus cases failed`);
}
console.log(`Bank-export corpus passed: ${corpus.cases.length} synthetic cases (${corpus.cases.filter(fixture => fixture.country === "KR").length} Korean, ${corpus.cases.filter(fixture => fixture.country === "ID").length} Indonesian), ${rowsChecked} parsed rows; encoded bytes, raw provenance, review states and unsafe whole-file rejection verified.`);

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import sharp from "sharp";
import { cropReceiptVisualRegion } from "../lib/receipt-vision-package";
import { encodeLocalReceiptOcr } from "../lib/local-receipt-ocr-envelope";

const require = createRequire(import.meta.url);
for (const [name, exports] of [
  ["../lib/ai-consent", { maySendToCloudAi: async () => true }],
  ["../lib/clover-token-usage", { mayUseImportCloudAi: async () => true, calculateModelCloverTokens: () => 0 }],
] as const) {
  const path = require.resolve(name);
  require.cache[path] = { id: path, filename: path, loaded: true, exports } as NodeModule;
}
process.env.OPENAI_API_KEY = "qa-never-sent";

async function main() {
  const { parseImportTextWithOpenAIFallback } = await import("../lib/openai-import-parser");
  const bytes = await sharp({ create: { width: 700, height: 900, channels: 3, background: "#fff" } }).jpeg().toBuffer();
  const page = { page: 1, dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}` };
  const frame = encodeLocalReceiptOcr({
    text: "OFFICIAL RECEIPT\nTotal PHP 125.00\nCash PHP 150.00\nChange PHP 25.00",
    opticalLines: [
      { text: "OFFICIAL RECEIPT", box: [0.1, 0.1, 0.9, 0.14] },
      { text: "Total PHP 125.00", box: [0.1, 0.71, 0.9, 0.75] },
      { text: "Cash PHP 150.00", box: [0.1, 0.76, 0.9, 0.8] },
      { text: "Change PHP 25.00", box: [0.1, 0.81, 0.9, 0.85] },
    ],
  });
  const region = await cropReceiptVisualRegion(page, frame, ["total"]);
  assert(region, "Verified layout can isolate the total and tender block");
  const regionSize = await sharp(Buffer.from(region.dataUrl.split(",")[1]!, "base64")).metadata();
  assert.equal(regionSize.width, 700);
  assert(regionSize.height > 200 && regionSize.height < 350);
  assert.equal(await cropReceiptVisualRegion(page, frame, ["date"]), null);
  assert.equal(await cropReceiptVisualRegion(page, "Total PHP 125.00", ["total"]), null);
  const evidence = "OFFICIAL RECEIPT\nCLOVER CAFE\nPurchase Date: 2026-11-17\nTotal PHP 125.00";
  const compactResponse = {
    classification_verdict: { document_type: "receipt", visible_evidence: ["OFFICIAL RECEIPT"] },
    document_type: "receipt",
    image_quality: [],
    receipt_account_match: null,
    receipt_details: {
      receipt_type: "official_receipt", merchant_raw: "CLOVER CAFE", merchant_clean: "CLOVER CAFE",
      merchant_source_text: "CLOVER CAFE", merchant_source_kind: "business_header",
      transaction_date: "2026-11-17", transaction_time: null, currency: "PHP", currency_source_text: "Total PHP 125.00",
      total: 125, payment_method: null, confidence_score: 93,
      parser_evidence: { page: 1, source_text: evidence, reason: "Printed core fields" },
    },
  };
  for (const { fileName, text, difficult } of [
    { fileName: "capture.jpg", text: "", difficult: false },
    { fileName: "capture.jpg", text: "GCash transaction details\nSent to Clover Cafe", difficult: true },
  ]) {
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://api.openai.com/v1/responses");
      calls++;
      const request = JSON.parse(String(init?.body));
      const schema = request.text.format.schema;
      assert(!Object.hasOwn(schema.properties, "transactions"));
      assert(!Object.hasOwn(schema.properties.receipt_details.anyOf[0].properties, "line_items"));
      for (const field of ["merchant_raw", "transaction_date", "currency", "total", "parser_evidence"])
        assert(schema.properties.receipt_details.anyOf[0].required.includes(field));
      assert.match(JSON.stringify(request.input), /Defer itemization/);
      return new Response(JSON.stringify({ output_text: JSON.stringify(compactResponse) }));
    };
    const result = await parseImportTextWithOpenAIFallback({
      text, fileName, fileType: "image/jpeg", importMode: "receipt", pageImages: [page],
      receiptCoreOnly: true, forceFallback: true, consentUserId: "qa", detectedMetadata: null, parsedRows: [],
    });
    assert.equal(calls, 1);
    assert.equal(result?.audit.receiptCoreOnly, true);
    if (difficult) assert.match(result?.audit.schemaValidationResult ?? "", /difficulty=hard/);
    assert.equal(result?.classificationVerdict?.documentType, "receipt");
    assert.equal(result?.receiptDetails?.total, 125);
    assert.equal(result?.receiptDetails?.transaction_date, "2026-11-17");
    assert.equal(result?.receiptDetails?.currency, "PHP");
    assert.equal(result?.receiptDetails?.parser_evidence.source_text, evidence);
    assert.deepEqual(result?.receiptDetails?.line_items, []);
    assert.deepEqual(result?.rows, []);
  }
  let rereads = 0;
  globalThis.fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    rereads++;
    if (rereads === 1) return new Response(JSON.stringify({ output_text: JSON.stringify({
      ...compactResponse, receipt_details: { ...compactResponse.receipt_details, transaction_date: null },
    }) }));
    assert.match(JSON.stringify(request.input), /Read only these unresolved fields: date\./);
    return new Response(JSON.stringify({ output_text: JSON.stringify({
      ...compactResponse, receipt_details: { ...compactResponse.receipt_details, total: 999,
        parser_evidence: { ...compactResponse.receipt_details.parser_evidence, source_text: "Purchase Date: 2026-11-17" },
      },
    }) }));
  };
  const repaired = await parseImportTextWithOpenAIFallback({
    text: "", fileName: "receipt.jpg", fileType: "image/jpeg", importMode: "receipt",
    pageImages: [page], receiptCoreOnly: true, forceFallback: true, consentUserId: "qa", detectedMetadata: null, parsedRows: [],
  });
  assert.equal(rereads, 2);
  assert.equal(repaired?.receiptDetails?.transaction_date, "2026-11-17");
  assert.equal(repaired?.receiptDetails?.total, 125, "Targeted rereads must not overwrite resolved fields");
  const emptyCases = [
    { primary: {}, recover: true },
    { primary: { output_text: "unreadable JSON" }, recover: false },
    { primary: { output_text: JSON.stringify({ ...compactResponse, receipt_details: null,
      classification_verdict: { document_type: "statement", visible_evidence: ["Bank Statement"] },
    }) }, recover: false, expectedCalls: 1 },
  ];
  for (const { primary, recover, expectedCalls = 2 } of emptyCases) {
    let calls = 0;
    const requests = new Set<string>();
    globalThis.fetch = async (_input, init) => {
      calls++;
      const request = JSON.parse(String(init?.body));
      if (calls === 1) return new Response(JSON.stringify(primary));
      assert.equal(calls, 2, "Empty evidence must never enter a serial reread loop");
      assert.match(JSON.stringify(request.input), /EVIDENCE RECOVERY/);
      return new Response(JSON.stringify(recover ? { output_text: JSON.stringify(compactResponse) } : {}));
    };
    const params = {
      text: "", fileName: "receipt.jpg", fileType: "image/jpeg", importMode: "receipt" as const,
      pageImages: [page], receiptCoreOnly: true, forceFallback: true, consentUserId: "qa",
      detectedMetadata: null, parsedRows: [], receiptVisualRequests: requests,
    };
    const result = await parseImportTextWithOpenAIFallback(params);
    assert.equal(calls, expectedCalls);
    assert.equal(result?.receiptDetails?.total ?? null, recover ? 125 : null);
    await parseImportTextWithOpenAIFallback(params);
    assert.equal(calls, expectedCalls, "The same image and prompt must not dispatch again on another parser call");
  }
  console.log("Receipt first-call payload defers itemization and preserves the verified core.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });

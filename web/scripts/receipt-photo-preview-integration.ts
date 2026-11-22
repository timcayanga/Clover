// Run against the supplied Spirits Library JPEG. No database, provider, or object store is contacted.
import { statementPdf } from "./fixtures/synthetic-statement-pdf";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { withMobileRequestContext } from "../lib/mobile-request-context";
import { readUploadedFileText, shutdownImportOcrWorkers } from "../lib/import-file-text.server";
import { readLocalReceiptImage, shutdownLocalReceiptOcr } from "../lib/local-receipt-ocr.server";

const require = createRequire(import.meta.url);

async function verify() {
  assert(process.argv[2], "Pass the original Spirits Library JPEG path");
  const bytes = Uint8Array.from(await readFile(process.argv[2]));
  let retained = 0;
  let expectedBytes: Uint8Array = bytes;
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("Unexpected network call"); };
  process.env.OPENAI_API_KEY = "offline-test-only";
  require("next/server").after = () => {};
  const mocks = {
    "../lib/native-upload-store": { readReceiptUpload: async (id: string, user: string, workspace: string) => {
      assert.deepEqual([id, user, workspace], ["receipt-fixture", "qa", "qa"]);
      // The Android file picker can identify a JPEG only by its filename.
      return { name: "IMG_1000.JPG", type: "application/octet-stream", size: bytes.length, sourceBytes: bytes };
    } },
    "../lib/auth": { isLocalDevHost: async () => false },
    "../lib/split-bill-access": { getSplitBillCurrentUser: async () => ({ id: "qa", clerkUserId: "qa" }) },
    "../lib/clover-token-usage": { mayUseImportCloudAi: async () => false },
    "../lib/prisma": { prisma: { workspace: { findFirst: async () => ({ id: "qa" }) } } },
    "../lib/s3": { uploadObject: async (_key: string, original: Uint8Array) => {
      assert.deepEqual(original, expectedBytes);
      retained++;
    } },
  };
  for (const [moduleName, exports] of Object.entries(mocks)) {
    const path = require.resolve(moduleName);
    require.cache[path] = { id: path, filename: path, loaded: true, exports } as NodeModule;
  }
  const { POST } = await import("../app/api/split-bill-receipts/preview/route");
  const data = new FormData();
  data.append("file", new File([bytes], "IMG_1000.jpg", { type: "image/jpeg" }));
  const request = new Request("https://clover.ph/api/split-bill-receipts/preview", {
    method: "POST", headers: { origin: "https://clover.ph" }, body: data,
  });
  // A completed scan with no text must leave the worker available for the next upload.
  assert.equal(await readLocalReceiptImage({ data: Buffer.alloc(320 * 240 * 3, 255), width: 320, height: 240 }), null);
  // Generic Add and Transactions uploads can receive camera photos exported as PNG.
  const png = await require("sharp")(bytes).png().toBuffer();
  const { parseReceiptPhotoText } = await import("../lib/split-bill");
  const { resolvePositiveImportDocumentRoute } = await import("../lib/positive-import-route");
  const expectedItems = [
    ["Mocktail REFRESHING", "350.00"], ["Cavinti Fizz", "480.00"], ["Punch from the Past", "520.00"],
  ];
  for (const filename of ["IMG_0156.png", "image.png", "Screenshot 2026.png", "portfolio.png"]) {
    const file = new File([Uint8Array.from(png)], filename, { type: "image/png" });
    const text = await readUploadedFileText(file, undefined, { importMode: "statement", sourceBytes: png });
    assert.equal(resolvePositiveImportDocumentRoute(text)?.mode, "receipt", filename);
    const parsed = parseReceiptPhotoText(text);
    assert.equal(parsed.total, "1470.54", filename);
    assert.equal(parsed.serviceCharge, "120.54", filename);
    assert.deepEqual(parsed.items.map(item => [item.description, item.amount]), expectedItems, filename);
  }
  const nativeRequest = new Request(request.url + "?uploadId=receipt-fixture&workspaceId=qa", {
    method: "POST", headers: { origin: "https://clover.ph" },
  });
  for (const [method, upload] of [["multipart", request], ["native", nativeRequest]] as const) {
    const start = performance.now();
    const response = await withMobileRequestContext("qa", upload, () => POST(upload));
    const result = await response.json();
    assert.equal(response.status, 200, result.error);
    assert.equal(result.preview.total, "1470.54");
    assert.equal(result.preview.billDate.slice(0, 10), "2026-11-19");
    assert.equal(result.preview.serviceCharge, "120.54");
    assert.equal(result.preview.subtotal, "1350.00");
    assert.deepEqual(result.preview.items.map((item: { description: string; amount: string }) => [item.description, item.amount]), expectedItems);
    assert.equal(networkCalls, 0);
    console.log("PASS " + method + " split receipt preview, printed total, items, date and retained photo in", Math.round(performance.now() - start), "ms");
  }
  assert.equal(retained, 2);
  async function uploadPdf(source: Uint8Array) {
    const form = new FormData();
    form.set("file", new File([Buffer.from(source)], "receipt.pdf", {type:"application/octet-stream"}));
    const upload = new Request(request.url, {method:"POST", headers:{origin:"https://clover.ph"}, body:form});
    return withMobileRequestContext("qa", upload, () => POST(upload));
  }
  expectedBytes = statementPdf(["Green Cafe", "Official Receipt", "04-05-2026", "Currency: EUR", "Qty Item Unit Price Amount", "2 Tea 10,00 EUR 20,00 EUR", "Subtotal 20,00 EUR", "Total Amount 20,00 EUR"]);
  let rasterizations = 0;
  const info = console.info;
  console.info = (...args) => {
    if (args[0] === "[import-performance] PDF rasterization requested") rasterizations++;
    info(...args);
  };
  const quantityReceipt = expectedBytes;
  let pdf: Response;
  try {
    expectedBytes = statementPdf(["Green Cafe", "Official Receipt", "Tea 10.00", "Coffee 20.00", "Gross Amount 30.00", "Bill Amount 30.00"]);
    const simplePdf = await uploadPdf(expectedBytes);
    assert.equal(simplePdf.status, 200);
    const { preview } = await simplePdf.json();
    assert.equal(preview.total, "30.00");
    assert.deepEqual(preview.items.map((item: { description: string }) => item.description), ["Tea", "Coffee"]);
    assert.equal(rasterizations, 0, "Reconciling item prices, gross and payable should skip page rendering");
    expectedBytes = statementPdf(["Green Cafe", "Official Receipt", "Tea 10.00", "Coffee 20.00", "Total Amount 30.00", "Total Paid 30.00"]);
    const paid = await uploadPdf(expectedBytes);
    assert.equal(paid.status, 200);
    const paidDraft = (await paid.json()).preview;
    assert.equal(paidDraft.total, "30.00");
    assert.deepEqual(paidDraft.items.map((item: { description: string }) => item.description), ["Tea", "Coffee"]);
    assert.equal(rasterizations, 0);
    for (const rows of [
      ["Qty Item Unit Price Amount", "0.375 Coffee Beans 319.99 120.00", "1 Tea 25.00 25.00"],
      ["Item Qty Unit Price Amount", "Coffee Beans 0.375 319.99 120.00", "Tea 1 25.00 25.00"],
    ]) {
      expectedBytes = statementPdf(["Green Cafe", "Official Receipt", ...rows, "Subtotal 145.00", "Total Amount 145.00"]);
      const weighed = await uploadPdf(expectedBytes);
      assert.equal(weighed.status, 200);
      const weighedDraft = (await weighed.json()).preview;
      assert.equal(weighedDraft.total, "145.00");
      assert.equal(weighedDraft.items[0].description, "Coffee Beans");
      assert.equal(weighedDraft.items[0].quantity, 0.375);
      assert.equal(weighedDraft.items[0].unitPrice, "319.99");
      assert.equal(rasterizations, 0);
    }
    expectedBytes = statementPdf(["Green Cafe", "Official Receipt", "Currency: EUR", "Qty Item Unit Price Amount",
      "2 Tea EUR 10.00 EUR 20.00", "Subtotal EUR 20.00", "Total Amount EUR 20.00"]);
    const prefixed = await uploadPdf(expectedBytes);
    assert.equal(prefixed.status, 200);
    assert.equal((await prefixed.json()).preview.items[0]?.unitPrice, "10.00");
    for (const heading of ["Tax Invoice", "Commercial Invoice #012"]) {
      expectedBytes = statementPdf(["Green Cafe", heading, "Qty Item Amount", "2 Tea 20.00",
        "Subtotal EUR 20.00", "Total EUR 20.00", "Amount paid EUR 20.00"]);
      const paidInvoice = await uploadPdf(expectedBytes);
      assert.equal(paidInvoice.status, 200);
      assert.equal((await paidInvoice.json()).preview.total, "20.00");
    }
    expectedBytes = quantityReceipt;
    pdf = await uploadPdf(expectedBytes);
  } finally {
    console.info = info;
  }
  assert.equal(rasterizations, 0, "A complete one-page digital receipt should return its reconciled native text");
  assert.equal(pdf.status, 200);
  const {preview, reliableForScopedSplit} = await pdf.json();
  assert.equal(reliableForScopedSplit, false);
  assert.equal(preview.billDate, null);
  assert.equal(preview.total, "20.00");
  assert.deepEqual(preview.items.map((item: { description: string }) => item.description), ["Tea"]);
  expectedBytes = statementPdf(["Green Cafe", "Purchase Order No. PO-52", "2026-11-19", "Qty Item Amount",
    "1 Tea 20.00", "Subtotal 20.00", "Total PHP 20.00"]);
  const order = await uploadPdf(expectedBytes);
  assert.equal(order.status, 200);
  const orderDraft = await order.json();
  assert.equal(orderDraft.preview.requiresReview, true);
  assert.equal(orderDraft.reliableForScopedSplit, false);
  assert.equal(retained, 11);
  if (process.argv[3]) {
    const locked = await uploadPdf(await readFile(process.argv[3]));
    assert.equal(locked.status, 422);
    assert.equal((await locked.json()).code, "IMPORT_PASSWORD_REQUIRED");
    assert.equal(retained, 11);
  }
  console.log("PASS PDF receipt preserves payable and withholds ambiguous date");
}

verify().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await shutdownImportOcrWorkers();
  await shutdownLocalReceiptOcr();
});

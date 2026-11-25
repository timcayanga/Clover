// Run against the supplied Spirits Library JPEG. No database, provider, or object store is contacted.
import { statementPdf } from "./fixtures/synthetic-statement-pdf";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { withMobileRequestContext } from "../lib/mobile-request-context";
import { readUploadedFileText, shutdownImportOcrWorkers } from "../lib/import-file-text.server";
import { readLocalReceiptImage, shutdownLocalReceiptOcr } from "../lib/local-receipt-ocr.server";

const require = createRequire(import.meta.url);

async function verify() {
  assert(process.argv[2], "Pass the original Spirits Library JPEG path");
  const bytes = Uint8Array.from(await readFile(process.argv[2]));
  const cache = await mkdtemp(join(tmpdir(), "clover-single-read-"));
  let retained = 0;
  let expectedBytes: Uint8Array = bytes;
  let networkCalls = 0;
  let allowanceChecks = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("Unexpected network call"); };
  process.env.OPENAI_API_KEY = "offline-test-only";
  require("next/server").after = () => {};
  let qaUserId = "qa-single-read";
  const mocks = {
    "../lib/native-upload-store": { readReceiptUpload: async (id: string, user: string, workspace: string) => {
      assert.deepEqual([id, user, workspace], ["receipt-fixture", "qa", "qa"]);
      // The Android file picker can identify a JPEG only by its filename.
      return { name: "IMG_1000.JPG", type: "application/octet-stream", size: bytes.length, sourceBytes: bytes };
    } },
    "../lib/auth": { isLocalDevHost: async () => false },
    "../lib/split-bill-access": { getSplitBillCurrentUser: async () => ({ id: qaUserId, clerkUserId: "qa" }) },
    "../lib/clover-token-usage": { mayUseImportCloudAi: async () => { allowanceChecks++; return false; } },
    "../lib/prisma": { prisma: { workspace: { findFirst: async () => ({ id: "qa" }) } } },
    "../lib/s3": { getLocalImportObjectPath: (key: string) => join(cache, key), uploadObject: async (_key: string, original: Uint8Array) => {
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
  let cachedId: string | undefined;
  try {
    for (const label of ["fresh photo", "identical retry"]) {
      const url = request.url + "?progressive=1&workspaceId=qa&scope=main";
      const upload = new Request(url, { method:"POST", headers:{ origin:"https://clover.ph" }, body:data });
      const start = performance.now();
      const response = await withMobileRequestContext("qa", upload, () => POST(upload));
      const result = await response.json();
      assert.equal(response.status, 200, result.error);
      assert.equal(result.refining, false);
      assert.equal(result.preview.total, "1470.54");
      assert.equal(result.preview.currency, "PHP");
      assert.equal(result.preview.billDate?.slice(0,10), "2026-11-19");
      assert.match(result.preview.merchantName, /spirits library/i);
      assert.deepEqual(result.preview.items.map((row: {description:string; amount:string}) => [row.description,row.amount]),
        [["Mocktail REFRESHING","350.00"],["Cavinti Fizz","480.00"],["Punch from the Past","520.00"]]);
      assert.equal(result.preview.serviceCharge, "120.54");
      assert.ok(result.draftId);
      if (cachedId) assert.equal(result.draftId, cachedId);
      cachedId = result.draftId;
      assert.equal(retained, 1);
      assert.equal(networkCalls, 0);
      assert.equal(allowanceChecks, 0);
      console.log("PASS single-read preview", label, Math.round(performance.now() - start), "ms");
    }
    const blank = await require("sharp")({create:{width:360,height:480,channels:3,background:"white"}}).jpeg().toBuffer();
    const form = new FormData();
    form.set("file",new File([blank],"receipt.jpg",{type:"image/jpeg"}));
    const unreadable = new Request(request.url + "?progressive=1&workspaceId=qa", {
      method:"POST", headers:{origin:"https://clover.ph"}, body:form,
    });
    const response = await withMobileRequestContext("qa", unreadable, () => POST(unreadable));
    assert.equal(response.status,422);
    assert.equal(allowanceChecks,0);
    assert.equal(networkCalls,0);
  } finally {
    await rm(cache, {recursive:true, force:true});
  }
  qaUserId = "qa";
  retained = 0;
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
    assert.equal(result.preview.billDate?.slice(0,10), "2026-11-19");
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
    const cashReceipt = statementPdf(["Green Cafe", "2026-11-19", "Qty Description Unit Price Amount",
      "0.100 Green Tea 42 400.00 40.00", "0.200 Rice Bowl 300.00 60.00", "Total Qty 0.300",
      "Gross Amount 100.00", "Bill Amount 100.00", "Cash 150.00", "Change 50.00"]);
    const cashText = await readUploadedFileText(new File([Buffer.from(cashReceipt)], "receipt.pdf", { type: "application/pdf" }),
      undefined, { importMode: "receipt", sourceBytes: cashReceipt });
    assert.match(cashText, /0\.100 Green Tea 42/);
    assert.equal(rasterizations, 0, "A reconciled headingless cash receipt should skip OCR");
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
  if (process.env.CLOVER_QA_DISCOUNT_PHOTO) {
    qaUserId = "qa-discount";
    expectedBytes = new Uint8Array(await readFile(process.env.CLOVER_QA_DISCOUNT_PHOTO));
    const form = new FormData();
    form.append("file", new File([Buffer.from(expectedBytes)], "receipt.webp", { type: "image/webp" }));
    const upload = new Request(request.url, { method: "POST", headers: { origin: "https://clover.ph" }, body: form });
    const checksBefore = allowanceChecks;
    const response = await withMobileRequestContext("qa", upload, () => POST(upload));
    assert.equal(response.status, 200);
    const { preview, reliableForScopedSplit } = await response.json();
    assert.equal(preview.total, "896.01");
    assert.deepEqual(preview.items.map((item: { amount: string }) => item.amount), ["1065.00", "55.00"]);
    assert.equal(preview.requiresReview, true);
    assert.equal(reliableForScopedSplit, false);
    assert.equal(allowanceChecks, checksBefore, "Reconciled discounted purchases can open for review directly");
    console.log("PASS reconciled discount photo opens for review without a provider allowance check");
  }
  if (process.env.CLOVER_QA_QUANTITY_MARGIN_PHOTO) {
    qaUserId = "qa-quantity-margin";
    expectedBytes = new Uint8Array(await readFile(process.env.CLOVER_QA_QUANTITY_MARGIN_PHOTO));
    const form = new FormData();
    form.append("file", new File([Buffer.from(expectedBytes)], "receipt.jpg", { type: "image/jpeg" }));
    const upload = new Request(request.url, { method: "POST", headers: { origin: "https://clover.ph" }, body: form });
    const checksBefore = allowanceChecks;
    const response = await withMobileRequestContext("qa", upload, () => POST(upload));
    assert.equal(response.status, 200);
    const { preview } = await response.json();
    assert.equal(preview.total, "2511.00");
    assert.deepEqual(preview.items.map((item: { quantity?: number }) => item.quantity ?? null),
      [null, null, null, null, 1, 1, 2]);
    assert.equal(preview.requiresReview, true);
    assert.equal(allowanceChecks, checksBefore);
    console.log("PASS quantity margin preserves the payable and unreadable quantities in the receipt draft");
  }
  // Only "Scanned attachment" is selectable. The purchases are in the image.
  const hybrid = new Uint8Array(await readFile("scripts/fixtures/scanned-receipt-with-text-header.pdf"));
  const { readImportedFileTextWithCacheInfo } = await import("../lib/import-file-text.server");
  for (const importMode of ["statement", "receipt"]) {
    const result = await readImportedFileTextWithCacheInfo({
      fileName: "receipt.pdf", fileType: "application/pdf", storageKey: "fixture", sourceBytes: hybrid, importMode,
    });
    const draft = parseReceiptPhotoText(result.text);
    assert.equal(draft.total, "100.00");
    assert.deepEqual(draft.items.map(item => [item.description, item.amount]), [["Green Tea 42", "40.00"], ["Rice Bowl", "60.00"]]);
  }
  console.log("PASS PDF receipt preserves payable and withholds ambiguous date");
}

verify().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await shutdownImportOcrWorkers();
  await shutdownLocalReceiptOcr();
});

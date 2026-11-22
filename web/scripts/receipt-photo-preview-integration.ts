// Run against the supplied Spirits Library JPEG. No database, provider, or object store is contacted.
import { statementPdf } from "./fixtures/synthetic-statement-pdf";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { withMobileRequestContext } from "../lib/mobile-request-context";
import { shutdownImportOcrWorkers } from "../lib/import-file-text.server";
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
    assert.deepEqual(result.preview.items.map((item: { description: string }) => item.description),
      ["Mocktail REFRESHING", "Cavinti Fizz", "Punch from the Past"]);
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
  expectedBytes = statementPdf(["Green Cafe", "Official Receipt", "04-05-2026", "Currency: EUR", "Qty Item Description Amount", "2 Tea 20.00", "Subtotal 20.00", "Total Amount 20.00"]);
  let rasterizations = 0;
  const info = console.info;
  console.info = (...args) => {
    if (args[0] === "[import-performance] PDF rasterization requested") rasterizations++;
    info(...args);
  };
  const pdf = await uploadPdf(expectedBytes).finally(() => { console.info = info; });
  assert.equal(rasterizations, 0, "A complete one-page digital receipt should return its reconciled native text");
  assert.equal(pdf.status, 200);
  const {preview} = await pdf.json();
  assert.equal(preview.billDate, null);
  assert.equal(preview.total, "20.00");
  assert.deepEqual(preview.items.map((item: { description: string }) => item.description), ["Tea"]);
  assert.equal(retained, 3);
  if (process.argv[3]) {
    const locked = await uploadPdf(await readFile(process.argv[3]));
    assert.equal(locked.status, 422);
    assert.equal((await locked.json()).code, "IMPORT_PASSWORD_REQUIRED");
    assert.equal(retained, 3);
  }
  console.log("PASS PDF receipt preserves payable and withholds ambiguous date");
}

verify().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await shutdownImportOcrWorkers();
  await shutdownLocalReceiptOcr();
});

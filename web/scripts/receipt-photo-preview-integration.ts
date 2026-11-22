// Run against the supplied Spirits Library JPEG. No database, provider, or object store is contacted.
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
  let networkCalls = 0;
  globalThis.fetch = async () => { networkCalls++; throw new Error("Unexpected network call"); };
  process.env.OPENAI_API_KEY = "offline-test-only";
  require("next/server").after = () => {};
  const mocks = {
    "../lib/native-upload-store": { readReceiptUpload: async (id: string, user: string, workspace: string) => {
      assert.deepEqual([id, user, workspace], ["receipt-fixture", "qa", "qa"]);
      return { name: "IMG_1000.jpg", type: "image/jpeg", size: bytes.length, sourceBytes: bytes };
    } },
    "../lib/auth": { isLocalDevHost: async () => false },
    "../lib/split-bill-access": { getSplitBillCurrentUser: async () => ({ id: "qa", clerkUserId: "qa" }) },
    "../lib/clover-token-usage": { mayUseImportCloudAi: async () => false },
    "../lib/prisma": { prisma: { workspace: { findFirst: async () => ({ id: "qa" }) } } },
    "../lib/s3": { uploadObject: async (_key: string, original: Uint8Array) => {
      assert.deepEqual(original, bytes);
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
}

verify().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await shutdownImportOcrWorkers();
  await shutdownLocalReceiptOcr();
});

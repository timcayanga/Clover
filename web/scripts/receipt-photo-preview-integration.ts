// Run against the supplied Spirits Library JPEG. No database, provider, or object store is contacted.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { withMobileRequestContext } from "../lib/mobile-request-context";
import { shutdownImportOcrWorkers } from "../lib/import-file-text.server";
import { shutdownLocalReceiptOcr } from "../lib/local-receipt-ocr.server";

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
  const start = performance.now();
  const response = await withMobileRequestContext("qa", request, () => POST(request));
  const result = await response.json();
  assert.equal(response.status, 200, result.error);
  assert.equal(result.preview.total, "1470.54");
  assert.equal(result.preview.billDate.slice(0, 10), "2026-11-19");
  assert.equal(result.preview.serviceCharge, "120.54");
  assert.deepEqual(result.preview.items.map((item: { description: string }) => item.description),
    ["Mocktail REFRESHING", "Cavinti Fizz", "Punch from the Past"]);
  assert.equal(retained, 1);
  assert.equal(networkCalls, 0);
  console.log("PASS local split receipt preview, printed total, items, date and retained photo in", Math.round(performance.now() - start), "ms");
}

verify().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await shutdownImportOcrWorkers();
  await shutdownLocalReceiptOcr();
});

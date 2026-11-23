// PP-OCRv5 models from RapidAI. Only the pinned, hash-verified bytes may reach inference.
const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const modelSpecs = {
  detection: [
    "det/ch_PP-OCRv5_det_mobile.onnx",
    "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae",
  ],
  korean: [
    "rec/korean_PP-OCRv5_rec_mobile.onnx",
    "cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b",
  ],
  latin: [
    "rec/latin_PP-OCRv5_rec_mobile.onnx",
    "b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a",
  ],
};

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const packaged = path.join(__dirname, "../.receipt-ocr-models");
async function verifiedFile(target, sha) {
  const bytes = await fs.readFile(target).catch(error => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  return bytes && sha256(bytes) === sha ? bytes : null;
}
async function loadModelBytes(name) {
  const [file, sha] = modelSpecs[name];
  const bundled = await verifiedFile(path.join(packaged, sha + ".onnx"), sha);
  if (bundled) return bundled;
  const dir = path.join(os.tmpdir(), "clover-ocr-models-v1");
  const target = path.join(dir, sha + ".onnx");
  const cached = await verifiedFile(target, sha);
  if (cached) return cached;
  const response = await fetch(
    "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.9.2/onnx/PP-OCRv5/" +
      file,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok) throw new Error("OCR model download failed");
  if (
    !response.body ||
    Number(response.headers.get("content-length") || 0) >
      20 * 1024 * 1024
  )
    throw new Error("OCR model too large");
  const chunks = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 20 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("OCR model too large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length > 20 * 1024 * 1024 || sha256(bytes) !== sha)
    throw new Error("OCR model integrity check failed");
  await fs.mkdir(dir, { recursive: true });
  const temp = target + "." + randomUUID() + ".tmp";
  try {
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
  return bytes;
}
module.exports = { modelSpecs, loadModelBytes };
if (require.main === module) {
  (async () => {
    await fs.mkdir(packaged, { recursive: true });
    await Promise.all(Object.entries(modelSpecs).map(async ([name, [, sha]]) => {
      const bytes = await loadModelBytes(name);
      await fs.writeFile(path.join(packaged, sha + ".onnx"), bytes);
    }));
    console.log("Packaged three verified receipt OCR models.");
  })().catch(error => { console.error(error); process.exitCode = 1; });
}

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { validateImportFileBytes } from "@/lib/import-file-validation";
import { normalizeReceiptImageForVision } from "@/lib/import-file-text.server";

const root = process.cwd();
const clientSource = readFileSync(join(root, "lib/import-image-compression.ts"), "utf8");
const modalSource = readFileSync(join(root, "components/import-files-modal.tsx"), "utf8");
const serverSource = readFileSync(join(root, "lib/import-file-text.server.ts"), "utf8");
const nextConfigSource = readFileSync(join(root, "next.config.mjs"), "utf8");

assert.match(clientSource, /file\.size <= targetUploadBytes && !isHeicImportImage\(file\)/);
assert.match(modalSource, /isHeicImportImage\(file\) \|\| file\.size > Math\.min\(imageOptimizationTarget, MAX_IMPORT_FILE_SIZE\)/);
assert.match(serverSource, /nodeRequire\("heic-decode"\)[\s\S]{0,2000}?raw: \{ width: decoded\.width, height: decoded\.height, channels: 4 \}/);
assert.match(nextConfigSource, /serverExternalPackages: \[[^\]]*"heic-decode"[^\]]*"libheif-js"/);
assert.match(nextConfigSource, /node_modules\/heic-decode\/\*\*\/\*/);

const fixture = process.env.CLOVER_HEIC_FIXTURE ??
  "/Users/TimCayanga1/Documents/Avocado/Resized Store Photos/Flares & Fragrances/Trevi Series - Gel candle/IMG_8408.HEIC";

const main = async () => {
  if (existsSync(fixture)) {
    const bytes = await readFile(fixture);
    assert.equal(
      validateImportFileBytes({ fileName: "camera.HEIC", contentType: "image/heic", bytes }),
      null,
      "a real iPhone HEIC container should pass signature validation"
    );
    const normalized = await normalizeReceiptImageForVision({ bytes, fileName: "camera.HEIC", fileType: "image/heic" });
    const metadata = await sharp(normalized.buffer).metadata();
    assert.equal(normalized.mimeType, "image/jpeg");
    assert.equal(metadata.format, "jpeg");
    assert.ok(Math.max(metadata.width ?? 0, metadata.height ?? 0) <= 1_800);
    assert.ok(normalized.buffer.length < bytes.length);
    console.log(`Real HEIC conversion passed (${bytes.length} -> ${normalized.buffer.length} bytes).`);
  }

  console.log("Image format conversion regression passed.");
};

void main();

import { encodeImportImage } from "../lib/import-image-encoding";
import { getBoundedImportImagePreview, validateImportImageDecode } from "@/lib/import-image-validation.server";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { validateImportFileBytes } from "@/lib/import-file-validation";
import { findImportImageTextRegion } from "@/lib/import-image-text-region";
import { needsExpandedReceiptText, normalizeReceiptImageForVision } from "@/lib/import-file-text.server";

const root = process.cwd();
const clientSource = readFileSync(join(root, "lib/import-image-compression.ts"), "utf8");
const modalSource = readFileSync(join(root, "components/import-files-modal.tsx"), "utf8");
const nextConfigSource = readFileSync(join(root, "next.config.mjs"), "utf8");

assert.match(clientSource, /file\.size <= targetUploadBytes && !isHeicImportImage\(file\)/);
assert.match(modalSource, /isHeicImportImage\(file\) \|\| file\.size > Math\.min\(imageOptimizationTarget, MAX_IMPORT_FILE_SIZE\)/);
assert.match(readFileSync(join(root, "lib/import-image-validation.server.ts"), "utf8"), /require\("heic-decode"\)/);
assert.match(nextConfigSource, /serverExternalPackages: \[[^\]]*"heic-decode"[^\]]*"libheif-js"/);
assert.match(nextConfigSource, /node_modules\/heic-decode\/\*\*\/\*/);

const importProcessSource = readFileSync(join(root, "app/api/imports/[importId]/process/route.ts"), "utf8");
const receiptPreviewSource = readFileSync(join(root, "app/api/split-bill-receipts/preview/route.ts"), "utf8");
assert.match(importProcessSource, /await validateImportImageDecode\(validationInput\)[\s\S]*?if \(byteValidationError\)[\s\S]*?return importJsonResponse[\s\S]*?const uploadPromise = uploadObject/);
assert.match(receiptPreviewSource, /await validateImportImageDecode\(validationInput\)[\s\S]*?if \(byteValidationError\)[\s\S]*?return NextResponse\.json[\s\S]*?await readUploadedFileText/);

const fixture = process.env.CLOVER_HEIC_FIXTURE ??
  "/Users/TimCayanga1/Documents/Avocado/Resized Store Photos/Flares & Fragrances/Trevi Series - Gel candle/IMG_8408.HEIC";

const main = async () => {
  const pixelsWithMargins = { data: Buffer.alloc(400 * 800 * 3, 255), width: 400, height: 800 };
  for (const [x, y] of [[125, 120], [270, 620]]) pixelsWithMargins.data[(y * 400 + x) * 3] = 0;
  assert.deepEqual(findImportImageTextRegion(pixelsWithMargins), { left: 109, top: 104, width: 178, height: 533 });
  pixelsWithMargins.data[(750 * 400 + 120) * 3] = 254; // Faint footer still counts.
  const region = findImportImageTextRegion(pixelsWithMargins);
  assert(region && region.top + region.height > 750);
  pixelsWithMargins.data[0] = 254;
  pixelsWithMargins.data[pixelsWithMargins.data.length - 1] = 254;
  assert.equal(findImportImageTextRegion(pixelsWithMargins), null, "Keep edge-to-edge evidence in frame");

  const complete = "CLOVER CAFE\nOfficial Receipt\nDate: 2026-11-15\nLatte PHP 125.00\nTotal PHP 125.00";
  assert.equal(needsExpandedReceiptText(complete), false);
  assert.equal(needsExpandedReceiptText(complete.replace("Date: 2026-11-15\n", "")), true);
  assert.equal(needsExpandedReceiptText(complete.replace("Total PHP 125.00", "Total unreadable")), true);
  assert.equal(needsExpandedReceiptText(complete + "\nTotal No of Items: 8"), true);

  const receipt = Buffer.from('<svg width="1200" height="4200" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="4200" fill="white"/><text x="40" y="4160" font-size="21">2026-11-17 · PHP 125.50</text></svg>');
  const transforms: number[][] = [];
  const upload = await encodeImportImage(1200, 4200, true, 100, async (width, height, quality) => {
    transforms.push([width, height, quality]);
    const jpeg = await sharp(receipt).resize(width, height).jpeg({ quality: Math.round(quality * 100) }).toBuffer();
    return new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
  });
  assert.deepEqual(transforms, [[800, 2800, 0.9]]);
  assert(upload.size > 100, "A soft byte target should not reduce resolution a second time");
  const uploadBytes = new Uint8Array(await upload.arrayBuffer());
  const ocrPreview = await getBoundedImportImagePreview(uploadBytes);
  assert.deepEqual([ocrPreview.width, ocrPreview.height], [800, 2800]);
  assert.equal(await validateImportImageDecode({ fileName: "receipt.jpg", bytes: uploadBytes }), null);
  assert.equal(ocrPreview, await getBoundedImportImagePreview(uploadBytes));
  await encodeImportImage(600, 900, true, 750_000, async (width, height) => {
    assert.deepEqual([width, height], [600, 900], "Do not upscale small receipt captures");
    return new Blob(["jpeg"], { type: "image/jpeg" });
  });

  const oriented = await sharp({ create: { width: 3200, height: 400, channels: 3, background: "#234567" } })
    .withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const pending = getBoundedImportImagePreview(oriented);
  assert.equal(pending, getBoundedImportImagePreview(oriented));
  assert.equal(await validateImportImageDecode({ fileName: "portrait.jpg", bytes: oriented }), null);
  const preview = await pending;
  assert.deepEqual([preview.width, preview.height], [350, 2800]);
  assert.equal(preview.data.length, 350 * 2800 * 3);
  const options = { bytes: oriented, fileName: "portrait.jpg", fileType: "image/jpeg" };
  const [first, second] = await Promise.all([normalizeReceiptImageForVision(options), normalizeReceiptImageForVision(options)]);
  assert.equal(first, second);
  assert.equal((await sharp(first.buffer).metadata()).height, 1800);

  const pixels = Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * 137 + (i >> 3) * 31) % 256));
  for (const format of ["jpeg", "png", "webp"] as const) {
    const bytes = await sharp(pixels, { raw: { width: 64, height: 64, channels: 3 } }).toFormat(format).toBuffer();
    const input = { fileName: `upload.${format}`, contentType: `image/${format}`, bytes };
    assert.equal(validateImportFileBytes(input), null);
    assert.equal(await validateImportImageDecode(input), null);
    const truncated = { ...input, bytes: bytes.subarray(0, Math.floor(bytes.length * 0.75)) };
    assert.equal(validateImportFileBytes(truncated), null, "Corrupt image retains its format signature");
    if (format === "jpeg") assert.equal((await sharp(truncated.bytes).metadata()).width, 64);
    assert.match((await validateImportImageDecode(truncated)) ?? "", /Retake the photo/);
  }
  assert.match((await validateImportImageDecode({
    fileName: "upload.png", bytes: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'/>"),
  })) ?? "", /Retake the photo/);
  assert.equal(await validateImportImageDecode({ fileName: "transactions.csv", bytes: Buffer.from("Date,Amount") }), null);

  if (existsSync(fixture)) {
    const bytes = await readFile(fixture);
    assert.equal(
      validateImportFileBytes({ fileName: "camera.HEIC", contentType: "image/heic", bytes }),
      null,
      "a real iPhone HEIC container should pass signature validation"
    );
    const validationInput = { fileName: "camera.HEIC", contentType: "image/heic", bytes };
    assert.equal(await validateImportImageDecode(validationInput), null, "A valid HEIC should pass pixel validation");
    assert.match((await validateImportImageDecode({ ...validationInput, bytes: bytes.subarray(0, 64) })) ?? "", /Retake the photo/);
    const normalized = await normalizeReceiptImageForVision({ bytes, fileName: "camera.HEIC", fileType: "image/heic" });
    const metadata = await sharp(normalized.buffer).metadata();
    assert.equal(normalized.mimeType, "image/jpeg");
    assert.equal(metadata.format, "jpeg");
    assert.ok(Math.max(metadata.width ?? 0, metadata.height ?? 0) <= 1_800);
    if (!process.env.CLOVER_HEIC_FIXTURE) assert.ok(normalized.buffer.length < bytes.length);
    console.log(`Real HEIC conversion passed (${bytes.length} -> ${normalized.buffer.length} bytes).`);
  }

  console.log("Image format conversion regression passed.");
};

void main();

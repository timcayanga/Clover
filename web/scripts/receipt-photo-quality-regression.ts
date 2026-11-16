import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, relative, sep } from "node:path";
import sharp from "sharp";
import { getBoundedImportImagePreview } from "../lib/import-image-validation.server";
import { readImportedFileImageDataUrls, readUploadedFileText, shutdownImportOcrWorkers } from "../lib/import-file-text.server";
import { parseReceiptPhotoText } from "../lib/split-bill";

const printed = "268.80";
const lines = [
  "CLOVER CAFE",
  "OFFICIAL RECEIPT",
  "Date: 2026-11-15",
  "Quantity  Description           Amount",
  "2         Espresso          PHP 160.00",
  "1         Butter Roll        PHP 80.00",
  "Subtotal                    PHP 240.00",
  "Service Charge               PHP 28.80",
  "GRAND TOTAL",
  "PHP 268.80",
  "Thank you for your purchase!",
];
const width = 820;
const height = 680;
const artwork = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#fff9ed"/>
  <g fill="#27221f" font-family="monospace" font-size="32" xml:space="preserve">
    ${lines.map((line, index) => `<text x="54" y="${75 + index * 49}">${line}</text>`).join("")}
  </g>
</svg>`);
type Fixture = { id: string; bytes: Uint8Array; extension?: string; total?: string; hard?: boolean };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  globalThis.fetch = async () => { throw new Error("Photo quality QA does not call a provider"); };
  const original = await sharp(artwork).png().toBuffer();
  const exifRotated = await sharp(original).rotate(270).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  const folded = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <path d="M0 412 L820 420 L820 452 L0 446Z" fill="#594337" opacity=".25"/>
    <path d="M0 408 L820 416" stroke="#fff" stroke-opacity=".55" stroke-width="7"/>
    </svg>`);
  const glare = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><radialGradient id="shine"><stop offset="0" stop-color="white" stop-opacity=".87"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="540" cy="348" rx="240" ry="150" fill="url(#shine)"/>
    </svg>`);
  const cases: Fixture[] = [
    { id: "clean", bytes: original, hard: true },
    { id: "exif_rotation", bytes: exifRotated, extension: ".jpg", hard: true },
    { id: "untagged_rotation", bytes: await sharp(original).rotate(90).png().toBuffer() },
    { id: "fold_shadow", hard: true, bytes: await sharp(original).composite([{ input: folded }]).png().toBuffer() },
    { id: "glare", hard: true, bytes: await sharp(original).composite([{ input: glare }]).png().toBuffer() },
    { id: "faded_ink", hard: true, bytes: await sharp(original).linear(0.38, 155).png().toBuffer() },
    { id: "oblique_view", hard: true, bytes: await sharp(original).affine([[.94, .15], [-.06, 1]], { background: "#fff9ed" }).png().toBuffer() },
    { id: "clipped_total", bytes: await sharp(original).extract({ left: 0, top: 0, width, height: 500 }).png().toBuffer() },
  ];

  if (process.argv.includes("--originals")) {
    const root = await realpath(process.env.CLOVER_RECEIPT_SAMPLES_ROOT ?? join(homedir(), "Documents", "Receipt Samples"));
    const labels = process.env.CLOVER_RECEIPT_LABELS ??
      join(homedir(), "Documents", "Clover File Organization", "Receipt Photo QA", "original-receipt-labels.json");
    const corpus = JSON.parse(await readFile(labels, "utf8")) as { cases: Array<{
      id: string; sourcePath: string; sha256: string; total: { state: string; value?: string };
    }> };
    for (const [id, condition] of [
      ["photo-02", "original_perspective"], ["photo-06", "original_faded"],
      ["photo-08", "original_fold"], ["photo-10", "original_cropped_header"],
    ]) {
      const label = corpus.cases.find(item => item.id === id);
      assert(label?.total.state === "observed" && label.total.value);
      const path = await realpath(join(root, label.sourcePath));
      assert(["Actual Receipts", "Organized Samples"].some(folder => relative(root, path).startsWith(folder + sep)));
      const bytes = await readFile(path);
      assert.equal(digest(bytes), label.sha256);
      cases.push({ id: condition, extension: extname(path), bytes, total: label.total.value });
    }
  }

  try {
    for (const fixture of cases) {
      const input = Uint8Array.from(fixture.bytes);
      const originalHash = digest(input);
      const extension = fixture.extension ?? ".png";
      const fileName = "photo" + extension;
      const fileType = extension === ".webp" ? "image/webp" : extension === ".png" ? "image/png" : "image/jpeg";
      const params = { storageKey: "not-stored", sourceBytes: input, fileName, fileType, importMode: "receipt" };
      const [corrected, originalView] = await Promise.all([
        readImportedFileImageDataUrls(params),
        readImportedFileImageDataUrls({ ...params, view: "original-view" }),
      ]);
      assert.equal(corrected.length, 1);
      assert.equal(originalView.length, 1);
      assert.notEqual(corrected[0].dataUrl, originalView[0].dataUrl);
      const preview = await getBoundedImportImagePreview(input);
      const color = Buffer.from(originalView[0].dataUrl.split(",")[1], "base64");
      const colorMeta = await sharp(color).metadata();
      assert.deepEqual([colorMeta.width, colorMeta.height], [preview.width, preview.height], "Full-color view preserves the whole oriented frame");
      if (fixture.id === "exif_rotation") assert.deepEqual([preview.width, preview.height], [width, height]);

      const text = await readUploadedFileText(new File([input], fileName, { type: fileType }), undefined, { importMode: "receipt", sourceBytes: input });
      const result = parseReceiptPhotoText(text);
      assert.equal(digest(input), originalHash, "Neither OCR view rewrites original bytes");
      const exact = result.total === (fixture.total ?? printed);
      console.log("RECEIPT_QUALITY_SAMPLE", JSON.stringify({
        case: fixture.id, exact, totalReadable: result.total !== null, reviewRequired: result.requiresReview === true || !result.total,
      }));
      if (fixture.hard) assert(exact, `Expected exact total for ${fixture.id}`);
      if (fixture.id === "clipped_total") assert.equal(result.total, null, "Never fill a clipped total from a subtotal or a sum");
    }
  } finally {
    await shutdownImportOcrWorkers();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });

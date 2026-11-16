import type { BrowserImportRequest } from "./import-browser-work";
import { encodeImportImage } from "./import-image-encoding";
import { hasPdfEncryptionMarker } from "./import-pdf-encryption";
import { decodeStructuredDelimitedBytes } from "./structured-delimited-decoder";

async function prepareImage(file: File, receipt: boolean, targetBytes: number) {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") {
    return null;
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const canvas = new OffscreenCanvas(1, 1);
    return await encodeImportImage(bitmap.width, bitmap.height, receipt, targetBytes, async (width, height, quality) => {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Image canvas is unavailable.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      return canvas.convertToBlob({ type: "image/jpeg", quality });
    });
  } finally {
    bitmap.close();
  }
}

self.addEventListener("message", async (event: MessageEvent<BrowserImportRequest>) => {
  const request = event.data;
  try {
    if (request.kind === "image") {
      self.postMessage(await prepareImage(request.file, request.receipt, request.targetBytes));
      return;
    }

    const bytes = new Uint8Array(await request.file.arrayBuffer());
    self.postMessage(request.kind === "delimited"
      ? decodeStructuredDelimitedBytes(bytes)
      : hasPdfEncryptionMarker(bytes));
  } catch {
    self.postMessage(null);
  }
});

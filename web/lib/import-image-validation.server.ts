import { createRequire } from "node:module";
import { isUploadPhoto, RECEIPT_IMAGE_MAX_EDGE } from "../../shared/native-upload";

const require = createRequire(import.meta.url);
const maxPixels = 64_000_000;
const supportedFormats = new Set(["jpeg", "png", "webp", "heif", "gif", "bmp"]);
const invalidImage = "Clover couldn't open this image. Retake the photo or export a fresh copy and upload it again.";

const oversizedImage = "This image is too large to open. Resize it or take a new photo and upload it again.";

export type ImagePreview = { data: Buffer; width: number; height: number };
const previews = new WeakMap<Uint8Array, Promise<ImagePreview>>();

export function getBoundedImportImagePreview(bytes: Uint8Array) {
  const existing = previews.get(bytes);
  if (existing) return existing;

  const pending = createPreview(bytes);
  previews.set(bytes, pending);
  return pending;
}

async function createPreview(input: Uint8Array): Promise<ImagePreview> {
  if (!input.length) throw new Error(invalidImage);
  const { default: sharp } = await import("sharp");
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const image = sharp(bytes, { failOn: "warning", limitInputPixels: maxPixels, animated: true });
  const metadata = await image.metadata().catch(() => null);
  if (!metadata || !supportedFormats.has(metadata.format)) throw new Error(invalidImage);
  const { width, height } = metadata;
  if (!width || !height || width * Math.max(height, (metadata.pageHeight ?? height) * (metadata.pages ?? 1)) > maxPixels) {
    throw new Error(oversizedImage);
  }

  const bound = { width: RECEIPT_IMAGE_MAX_EDGE, height: Math.max(1, Math.floor(RECEIPT_IMAGE_MAX_EDGE / (metadata.pages ?? 1))), fit: "inside",
    withoutEnlargement: true, fastShrinkOnLoad: false } as const;
  const materialize = async (source: ReturnType<typeof sharp>) => {
    const { data, info } = await source.resize(bound).flatten({ background: "#fff" })
      .removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    if (info.width > RECEIPT_IMAGE_MAX_EDGE || info.height > RECEIPT_IMAGE_MAX_EDGE || info.channels !== 3) throw new Error(invalidImage);
    return { data, width: info.width, height: info.height };
  };

  try {
    return await materialize(image.autoOrient());
  } catch {
    if (metadata.format !== "heif" || metadata.compression !== "hevc") throw new Error(invalidImage);
    try {
      const decodeHeic = require("heic-decode") as (input: { buffer: Buffer }) => Promise<{
        width: number;
        height: number;
        data: Uint8ClampedArray;
      }>;
      const decoded = await decodeHeic({ buffer: bytes });
      if (decoded.width <= 0 || decoded.height <= 0 || decoded.width * decoded.height > maxPixels ||
          decoded.data.length !== decoded.width * decoded.height * 4) throw new Error(invalidImage);
      // libheif applies the HEIF transforms before returning pixels.
      return await materialize(sharp(Buffer.from(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength), {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
      }));
    } catch {
      throw new Error(invalidImage);
    }
  }
}

export async function validateImportImageDecode(params: {
  fileName: string;
  contentType?: string | null;
  bytes: Uint8Array;
}) {
  if (!isUploadPhoto(params.fileName, params.contentType)) return null;
  try {
    await getBoundedImportImagePreview(params.bytes);
    return null;
  } catch (error) {
    return error instanceof Error && error.message === oversizedImage ? oversizedImage : invalidImage;
  }
}

"use client";

import { isImageImportFile } from "@/lib/import-file-helpers";

export const MAX_IMPORT_IMAGE_SOURCE_SIZE = 16 * 1024 * 1024;
export const IMPORT_IMAGE_TARGET_SIZE = 3_500_000;
export const RECEIPT_IMPORT_IMAGE_TARGET_SIZE = 750_000;

export type ImportImageOptimizationProfile = "default" | "receipt";

export const isHeicImportImage = (file: Pick<File, "name" | "type">) =>
  /\.(?:heic|heif)$/i.test(file.name) || /image\/hei[cf](?:-sequence)?/i.test(file.type);

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Clover could not prepare this photo."));
    };
    image.src = objectUrl;
  });

const encodeJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Clover could not prepare this photo."))),
      "image/jpeg",
      quality
    );
  });

const jpegName = (fileName: string) => {
  const stem = fileName.replace(/\.[^.]+$/, "") || "clover-photo";
  return `${stem}.jpg`;
};

export const optimizeImportImage = async (
  file: File,
  maxUploadBytes: number,
  profile: ImportImageOptimizationProfile = "default"
) => {
  const isReceiptProfile = profile === "receipt";
  const targetUploadBytes = Math.min(
    isReceiptProfile ? RECEIPT_IMPORT_IMAGE_TARGET_SIZE : IMPORT_IMAGE_TARGET_SIZE,
    maxUploadBytes
  );
  if (!isImageImportFile(file) || (file.size <= targetUploadBytes && !isHeicImportImage(file))) {
    return file;
  }

  if (file.size > MAX_IMPORT_IMAGE_SOURCE_SIZE) {
    throw new Error("This photo is larger than 16 MB. Please choose a smaller photo.");
  }

  const image = await loadImage(file);
  // The server's core receipt reader uses a 1120px visual budget and its
  // optional detail reader uses 1440px. Match that upper bound in the browser
  // so mobile users do not upload pixels Clover immediately discards.
  // Statement screenshots keep the larger canvas because their tables are denser.
  let maxDimension = isReceiptProfile ? 1_440 : 2_600;
  let quality = isReceiptProfile ? 0.82 : 0.9;
  let output: Blob | null = null;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Clover could not prepare this photo.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    output = await encodeJpeg(canvas, quality);
    if (output.size <= targetUploadBytes) {
      break;
    }

    maxDimension = Math.max(isReceiptProfile ? 1_120 : 1_400, Math.round(maxDimension * 0.82));
    quality = Math.max(0.68, quality - 0.06);
  }

  if (!output || output.size > maxUploadBytes) {
    throw new Error("Clover could not make this photo small enough to upload. Please crop it and try again.");
  }

  return new File([output], jpegName(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
};

export const optimizeImportImages = async (
  files: File[],
  maxUploadBytes: number,
  profile: ImportImageOptimizationProfile = "default"
) => {
  const optimized: File[] = [];
  // Decode one camera image at a time to avoid a memory spike when a user
  // selects several high-resolution photos on a phone.
  for (const file of files) {
    optimized.push(await optimizeImportImage(file, maxUploadBytes, profile));
  }
  return optimized;
};

"use client";

import { isImageImportFile } from "@/lib/import-file-helpers";
import { runBrowserImportWork } from "./import-browser-work";
import { encodeImportImage } from "./import-image-encoding";

import { IMPORT_PHOTO_MAX_SIZE } from "../../shared/native-upload";
export const MAX_IMPORT_IMAGE_SOURCE_SIZE = IMPORT_PHOTO_MAX_SIZE;
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
    throw new Error("This photo is larger than 25 MB. Please choose a smaller photo.");
  }

  let output = await runBrowserImportWork({ kind: "image", file, receipt: isReceiptProfile, targetBytes: targetUploadBytes });
  if (output?.type !== "image/jpeg" || output.size === 0) {
    // The existing server import can accept the original within its upload limit.
    if (file.size <= maxUploadBytes) return file;

    // Older browsers still need a way to resize photos too large to send as-is.
    const image = await loadImage(file);
    const canvas = document.createElement("canvas");
    output = await encodeImportImage(image.naturalWidth, image.naturalHeight, isReceiptProfile, targetUploadBytes, (width, height, quality) => {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Clover could not prepare this photo.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, width, height);
      return encodeJpeg(canvas, quality);
    });
  }

  // Avoid replacing a compatible original with a larger lossy re-encode.
  if (isReceiptProfile && file.size <= maxUploadBytes && output.size >= file.size && !isHeicImportImage(file)) {
    return file;
  }
  if (output.size > maxUploadBytes && file.size <= maxUploadBytes) return file;
  if (output.size > maxUploadBytes) {
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

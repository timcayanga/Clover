const IMAGE_IMPORT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"] as const;
const IMAGE_IMPORT_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

// Clover uploads support structured documents and common image files.
// The same accepted formats are used by public imports and training/sample tooling.
export const PUBLIC_IMPORT_EXTENSIONS = [".pdf", ".csv", ...IMAGE_IMPORT_EXTENSIONS] as const;
export const PUBLIC_IMPORT_CONTENT_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
  ...IMAGE_IMPORT_CONTENT_TYPES,
]);

export const TRAINING_IMAGE_EXTENSIONS = [...IMAGE_IMPORT_EXTENSIONS, ".pdf"] as const;
export const TRAINING_IMAGE_CONTENT_TYPES = new Set([
  "application/pdf",
  ...IMAGE_IMPORT_CONTENT_TYPES,
]);

import { PUBLIC_IMPORT_CONTENT_TYPES, PUBLIC_IMPORT_EXTENSIONS, TRAINING_IMAGE_CONTENT_TYPES, TRAINING_IMAGE_EXTENSIONS } from "@/lib/import-format-policies";
import type { ImportImageMode } from "@/lib/import-image-mode";

export const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;

const getFileExtension = (fileName: string) => {
  const trimmed = fileName.trim().toLowerCase();
  const index = trimmed.lastIndexOf(".");
  return index >= 0 ? trimmed.slice(index) : "";
};

export const isSupportedImportFile = (
  fileName: string,
  contentType?: string | null,
  options?: {
    importMode?: ImportImageMode | null;
  }
) => {
  const extension = getFileExtension(fileName);
  const normalizedContentType = (contentType ?? "").trim().toLowerCase();

  if (PUBLIC_IMPORT_EXTENSIONS.includes(extension as (typeof PUBLIC_IMPORT_EXTENSIONS)[number]) || PUBLIC_IMPORT_CONTENT_TYPES.has(normalizedContentType)) {
    return true;
  }

  if (!options?.importMode) {
    return false;
  }

  return TRAINING_IMAGE_EXTENSIONS.includes(extension as (typeof TRAINING_IMAGE_EXTENSIONS)[number]) || TRAINING_IMAGE_CONTENT_TYPES.has(normalizedContentType);
};

export const validateImportFile = (params: {
  fileName: string;
  fileSize: number;
  contentType?: string | null;
  importMode?: ImportImageMode | null;
}) => {
  if (!params.fileName.trim()) {
    return "File name is required.";
  }

  if (!Number.isFinite(params.fileSize) || params.fileSize <= 0) {
    return "File is empty.";
  }

  if (params.fileSize > MAX_IMPORT_FILE_SIZE) {
    return "Import files must be 2 MB or smaller.";
  }

  if (!isSupportedImportFile(params.fileName, params.contentType, { importMode: params.importMode ?? null })) {
    return params.importMode
      ? "Only PDF, CSV, and common image files are supported for this import mode."
      : "Only PDF, CSV, and common image files are supported.";
  }

  return null;
};

export const validateImportFileMetadata = (params: { fileName: string; contentType?: string | null; importMode?: ImportImageMode | null }) => {
  if (!params.fileName.trim()) {
    return "File name is required.";
  }

  if (!isSupportedImportFile(params.fileName, params.contentType, { importMode: params.importMode ?? null })) {
    return params.importMode
      ? "Only PDF, CSV, and common image files are supported for this import mode."
      : "Only PDF, CSV, and common image files are supported.";
  }

  return null;
};

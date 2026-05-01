export const MAX_IMPORT_FILE_SIZE = 8 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = [".pdf", ".csv", ".tsv", ".json", ".jpg", ".jpeg", ".png", ".webp"];
const SUPPORTED_CONTENT_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/tab-separated-values",
  "text/plain",
  "application/json",
  "text/json",
  "application/vnd.ms-excel",
  "application/octet-stream",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const getFileExtension = (fileName: string) => {
  const trimmed = fileName.trim().toLowerCase();
  const index = trimmed.lastIndexOf(".");
  return index >= 0 ? trimmed.slice(index) : "";
};

export const isSupportedImportFile = (fileName: string, contentType?: string | null) => {
  const extension = getFileExtension(fileName);
  const normalizedContentType = (contentType ?? "").trim().toLowerCase();

  return SUPPORTED_EXTENSIONS.includes(extension) || SUPPORTED_CONTENT_TYPES.has(normalizedContentType);
};

export const validateImportFile = (params: {
  fileName: string;
  fileSize: number;
  contentType?: string | null;
}) => {
  if (!params.fileName.trim()) {
    return "File name is required.";
  }

  if (!Number.isFinite(params.fileSize) || params.fileSize <= 0) {
    return "File is empty.";
  }

  if (params.fileSize > MAX_IMPORT_FILE_SIZE) {
    return "Import files must be 8 MB or smaller.";
  }

  if (!isSupportedImportFile(params.fileName, params.contentType)) {
    return "Only PDF, CSV, TSV, JSON, JPEG, PNG, and WebP files are supported.";
  }

  return null;
};

export const validateImportFileMetadata = (params: { fileName: string; contentType?: string | null }) => {
  if (!params.fileName.trim()) {
    return "File name is required.";
  }

  if (!isSupportedImportFile(params.fileName, params.contentType)) {
    return "Only PDF, CSV, TSV, JSON, JPEG, PNG, and WebP files are supported.";
  }

  return null;
};

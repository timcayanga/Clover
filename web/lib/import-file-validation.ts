export const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = [".pdf", ".csv", ".tsv"];
const SUPPORTED_CONTENT_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/tab-separated-values",
  "text/plain",
  "application/vnd.ms-excel",
  "application/octet-stream",
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
    return "Import files must be 2 MB or smaller.";
  }

  if (!isSupportedImportFile(params.fileName, params.contentType)) {
    return "Only PDF, CSV, and TSV files are supported.";
  }

  return null;
};

export const validateImportFileMetadata = (params: { fileName: string; contentType?: string | null }) => {
  if (!params.fileName.trim()) {
    return "File name is required.";
  }

  if (!isSupportedImportFile(params.fileName, params.contentType)) {
    return "Only PDF, CSV, and TSV files are supported.";
  }

  return null;
};

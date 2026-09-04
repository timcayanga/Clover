const IMAGE_IMPORT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"] as const;
export const FINANCIAL_EXCHANGE_IMPORT_EXTENSIONS = [".ofx", ".qfx", ".qif", ".mt940", ".sta", ".xml", ".json"] as const;
export const FINANCIAL_EXCHANGE_IMPORT_CONTENT_TYPES = new Set([
  "application/x-ofx",
  "application/vnd.intu.qfx",
  "application/qif",
  "text/qif",
  "application/x-mt940",
  "text/mt940",
  "application/xml",
  "text/xml",
  "application/json",
]);
export const SPREADSHEET_IMPORT_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".xlsb", ".ods"] as const;
export const SPREADSHEET_IMPORT_CONTENT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  "application/vnd.oasis.opendocument.spreadsheet",
]);
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
export const PUBLIC_IMPORT_EXTENSIONS = [".pdf", ".csv", ".tsv", ...FINANCIAL_EXCHANGE_IMPORT_EXTENSIONS, ...SPREADSHEET_IMPORT_EXTENSIONS, ...IMAGE_IMPORT_EXTENSIONS] as const;
export const PUBLIC_IMPORT_CONTENT_TYPES = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
  "text/tab-separated-values",
  ...FINANCIAL_EXCHANGE_IMPORT_CONTENT_TYPES,
  ...SPREADSHEET_IMPORT_CONTENT_TYPES,
  ...IMAGE_IMPORT_CONTENT_TYPES,
]);

export const TRAINING_IMAGE_EXTENSIONS = [...IMAGE_IMPORT_EXTENSIONS, ".pdf"] as const;
export const TRAINING_IMAGE_CONTENT_TYPES = new Set([
  "application/pdf",
  ...IMAGE_IMPORT_CONTENT_TYPES,
]);

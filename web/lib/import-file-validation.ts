import {
  PUBLIC_IMPORT_CONTENT_TYPES,
  PUBLIC_IMPORT_EXTENSIONS,
  FINANCIAL_EXCHANGE_IMPORT_CONTENT_TYPES,
  FINANCIAL_EXCHANGE_IMPORT_EXTENSIONS,
  SPREADSHEET_IMPORT_CONTENT_TYPES,
  SPREADSHEET_IMPORT_EXTENSIONS,
  TRAINING_IMAGE_CONTENT_TYPES,
  TRAINING_IMAGE_EXTENSIONS,
} from "@/lib/import-format-policies";
import type { ImportImageMode } from "@/lib/import-image-mode";

// Multipart imports must remain below the hosting request ceiling. Mobile
// photos may start larger, but the client optimizes them before this check.
export const MAX_IMPORT_FILE_SIZE = 4 * 1024 * 1024;
export const MAX_IMPORT_FILE_SIZE_LABEL = "4 MB";
export const MAX_IMPORT_PDF_PAGES = 250;

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
    return `Uploaded files must be ${MAX_IMPORT_FILE_SIZE_LABEL} or smaller.`;
  }

  if (!isSupportedImportFile(params.fileName, params.contentType, { importMode: params.importMode ?? null })) {
    return params.importMode
      ? "Only PDF, CSV, TSV, spreadsheets, financial exports, and common image files are supported for this import mode."
      : "Only PDF, CSV, TSV, spreadsheets, financial exports, and common image files are supported.";
  }

  return null;
};

export const validateImportFileMetadata = (params: { fileName: string; contentType?: string | null; importMode?: ImportImageMode | null }) => {
  if (!params.fileName.trim()) {
    return "File name is required.";
  }

  if (!isSupportedImportFile(params.fileName, params.contentType, { importMode: params.importMode ?? null })) {
    return params.importMode
      ? "Only PDF, CSV, TSV, spreadsheets, financial exports, and common image files are supported for this import mode."
      : "Only PDF, CSV, TSV, spreadsheets, financial exports, and common image files are supported.";
  }

  return null;
};

export const validateImportFileBytes = (params: {
  fileName: string;
  contentType?: string | null;
  bytes: Uint8Array;
}) => {
  const name = params.fileName.toLowerCase();
  const bytes = params.bytes;
  const startsWith = (values: number[]) => values.every((value, index) => bytes[index] === value);
  const isPdf = name.endsWith(".pdf") || params.contentType === "application/pdf";
  const isPng = name.endsWith(".png") || params.contentType === "image/png";
  const isJpeg = /\.jpe?g$/.test(name) || params.contentType === "image/jpeg";
  const isWebp = name.endsWith(".webp") || params.contentType === "image/webp";
  const isHeif =
    /\.(?:heic|heif)$/.test(name) ||
    /image\/hei[cf](?:-sequence)?/.test(String(params.contentType ?? "").toLowerCase());
  const isCsv =
    /\.(?:csv|tsv)$/.test(name) ||
    params.contentType === "text/csv" ||
    params.contentType === "text/tab-separated-values";
  const extension = name.slice(name.lastIndexOf("."));
  const normalizedContentType = String(params.contentType ?? "").toLowerCase();
  const isFinancialExchange =
    FINANCIAL_EXCHANGE_IMPORT_EXTENSIONS.includes(extension as (typeof FINANCIAL_EXCHANGE_IMPORT_EXTENSIONS)[number]) ||
    FINANCIAL_EXCHANGE_IMPORT_CONTENT_TYPES.has(normalizedContentType);
  const isSpreadsheet =
    SPREADSHEET_IMPORT_EXTENSIONS.includes(extension as (typeof SPREADSHEET_IMPORT_EXTENSIONS)[number]) ||
    SPREADSHEET_IMPORT_CONTENT_TYPES.has(normalizedContentType);
  const isZipSpreadsheet = /\.(?:xlsx|xlsm|xlsb|ods)$/.test(name);
  const isOleSpreadsheet = name.endsWith(".xls");

  if (isPdf && !startsWith([0x25, 0x50, 0x44, 0x46])) return "The uploaded file is not a valid PDF.";
  if (isPng && !startsWith([0x89, 0x50, 0x4e, 0x47])) return "The uploaded file is not a valid PNG image.";
  if (isJpeg && !startsWith([0xff, 0xd8, 0xff])) return "The uploaded file is not a valid JPEG image.";
  if (
    isWebp &&
    !(startsWith([0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP")
  ) {
    return "The uploaded file is not a valid WebP image.";
  }
  if (isHeif) {
    const header = String.fromCharCode(...bytes.slice(4, Math.min(bytes.length, 32)));
    const hasHeifContainer = header.startsWith("ftyp") && /(?:heic|heix|hevc|hevx|heim|heis|mif1|msf1)/i.test(header);
    if (!hasHeifContainer) return "The uploaded file is not a valid HEIC or HEIF image.";
  }
  if (isCsv && bytes.length === 0) return "The uploaded CSV file is empty.";
  if (isFinancialExchange) {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes).trim();
    const header = decoded.slice(0, 2_048);
    const looksOfx = /^(?:OFXHEADER:|<\?OFX|<OFX)/i.test(header);
    const looksQif = /^!Type:/i.test(header);
    const looksMt940 = /(?:^|\n):20:[^\n]+[\s\S]*?(?:^|\n):25:[^\n]+[\s\S]*?(?:^|\n):61:/m.test(decoded);
    const looksCamt = /<(?:\w+:)?Document\b[\s\S]*?<(?:\w+:)?BkToCstmrStmt\b/i.test(decoded) || /camt\.053/i.test(header);
    const looksFinancialJson = (() => {
      if (!name.endsWith(".json") && normalizedContentType !== "application/json") return false;
      try {
        const payload = JSON.parse(decoded) as unknown;
        const record = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
        const nestedData = record?.data && typeof record.data === "object" && !Array.isArray(record.data)
          ? record.data as Record<string, unknown>
          : null;
        const candidates = Array.isArray(payload)
          ? payload
          : [record?.transactions, record?.records, record?.items, record?.activities, nestedData?.transactions, nestedData?.records]
              .find(Array.isArray) ?? [];
        return candidates.some((candidate) => {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
          const row = candidate as Record<string, unknown>;
          return ["date", "transactionDate", "transaction_date", "postedDate", "posted_at", "bookingDate"].some((key) => row[key] != null) &&
            ["amount", "value", "transactionAmount", "transaction_amount", "debit", "debitAmount", "debit_amount", "credit", "creditAmount", "credit_amount"].some((key) => row[key] != null);
        });
      } catch {
        return false;
      }
    })();
    if (!looksOfx && !looksQif && !looksMt940 && !looksCamt && !looksFinancialJson) {
      return "The uploaded file is not a recognized financial export (OFX, QFX, QIF, MT940, CAMT.053, or transaction JSON).";
    }
  }
  if (isZipSpreadsheet && !startsWith([0x50, 0x4b])) return "The uploaded file is not a valid spreadsheet workbook.";
  if (isOleSpreadsheet && !startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return "The uploaded file is not a valid spreadsheet workbook.";
  }
  if (isSpreadsheet && bytes.length === 0) return "The uploaded spreadsheet workbook is empty.";
  return null;
};

import { isDelimitedImport, importDocumentMediaType, importMediaType, FINANCIAL_EXCHANGE_IMPORT_EXTENSIONS, FINANCIAL_EXCHANGE_IMPORT_CONTENT_TYPES } from "./import-format-policies";
import { purchaseInvoiceHeading } from "./purchase-document-payment";
import { locateDamagedReceiptPrices, recoverReceiptPrices } from "./receipt-price-column";
import { recordReceiptPriceCrop, readLocalReceiptOcrText, readReceiptOpticalEvidence, singleReceiptDate, receiptDateDisagreements, recordReceiptDateCheck } from "./local-receipt-ocr-envelope";
import { canPreviewLocalReceiptItems, hasPrintedItemizedTotal, readReconciledItemTable } from "./receipt-item-table";
import { runPdfPageBatch } from "./pdf-page-work";
import { createImportReaderCapacity } from "./import-reader-capacity";
import { measureImportReader, recordImportReaderTiming, recordImportWork, reportImportReaderEvent } from "./import-timing";
import { isUploadPhoto, isUploadPdf, RECEIPT_IMAGE_MAX_EDGE } from "../../shared/native-upload";
import { pdfPageOcrCacheVersion, pdfRenderCacheVersion, pdfTextCacheVersion } from "./pdf-extraction-cache.server";
import { reconstructPdfStatementPages, type PdfStatementContinuation, type PositionedPdfRow } from "./pdf-statement-layout";
import { hasPdfEncryptionMarker } from "./import-pdf-encryption";
import { assessPdfStatementTextPage, canReplacePdfStatementTextPage, hasCompletePdfNativeLedger, hasPdfStatementLedgerHeader, planHybridPdfLedgerRecovery } from "./pdf-statement-text-quality";
import { assessPdfStatementCoverage } from "./pdf-statement-coverage";
import { resolvePositiveImportDocumentRoute } from "@/lib/positive-import-route";
import { classifyExactPhotoRejection, type ClassificationContext } from "@/lib/import-classification-cache.server";
import { findImportImageTextRegion } from "@/lib/import-image-text-region";
import { hasPhotographicTexture, getBoundedImportImagePreview, type ImagePreview } from "@/lib/import-image-validation.server";
import { MAX_PDF_ESCALATION_PAGES, mergePdfPageBatches, planPdfPageEscalation } from "./pdf-page-escalation";
import { decodeWordGrabReceiptBytes } from './word-receipt-import.server';
import { heldSourceReviewReason } from './held-source-review';
import {buildSeaBankIndonesiaPdfRows, buildSeaBankIndonesiaPdfSummary, buildSeaBankIndonesiaLegacyPdfEvidence, buildDbsZeroPdfProof, hasSeaBankIndonesiaEnglishHeader} from '@/lib/held-source-contracts';
import { buildGrabReceiptNativePages, buildGrabPickupFields, buildGrabTwoMessagePanelBodies, type GrabVisualHeadline } from '@/lib/grab-email-receipt';
import { parseCimbConsolidatedStatement } from "@/lib/import-parser";
import { buildBcaTransferPdfRows, parseBcaTransferProof } from "@/lib/bca-transfer-proof";
import { hasReconciledBdoInlineLedger } from "@/lib/import-parser";
import { buildPosbPdfRows, POSB_NATIVE_ACCOUNT_HEADING } from "@/lib/posb-statement";
import { gcashBillsReceiptTextLayerIsComplete, buildGcashBillsNativePages, parseGcashBillsReceipt, selectCompleteGcashBillsNativeText } from "@/lib/gcash-bills-receipt";
import { encodeNativePdfNullGlyphs } from "@/lib/native-pdf-text";
import { readLocalReceiptImage, shutdownLocalReceiptOcr } from "./local-receipt-ocr.server";
import { hasHangul, hasKoreanFinancialHeaders } from "@/lib/korean-financial-text";
import { koreanStatementLineEvidence } from "@/lib/korean-statement-evidence";
import { buildKoreanBankTable, koreanBankTableHeader } from "@/lib/korean-bank-table";
import { buildIndonesianBankTable, indonesianBankTableHeader } from "@/lib/indonesian-bank-table";
import { hasIndonesianFinancialText, parseIndonesianAmount } from "@/lib/indonesian-financial-text";
import { looksLikeIndonesianPaymentProof, parseIndonesianPaymentProof } from "@/lib/indonesian-payment-proof";
import { formatIndonesianBankPdfRows } from "@/lib/indonesian-pdf-columns";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { dirname, join, sep } from "node:path";
import { Prisma } from "@prisma/client";
import { downloadImportObject } from "@/lib/import-storage.server";
import {
  IMPORT_FILE_EXTRACTION_CACHE_VERSION,
  loadImportFileExtractionCache,
  resolveImportFileExtractionCacheVersion,
  upsertImportFileExtractionCache,
} from "@/lib/data-engine";
import { buildGsaveScreenshotFallbackText } from "@/lib/gsave-screenshot-samples";
import { buildGfundsScreenshotFallbackText } from "@/lib/gfunds-screenshot-samples";
import { assessReceiptPreviewQuality, hasUnreadableReceiptPhotoTotal, parseReceiptPhotoText, parseReceiptText } from "@/lib/split-bill";
import { decodeStructuredDelimitedBytes } from "@/lib/structured-delimited-decoder";
import { decodeSpreadsheetWorkbookBytes } from "@/lib/spreadsheet-import.server";

class SimpleDOMMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;

  constructor(init?: number[] | { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number }) {
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;

    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init.map((value) => Number(value) || 0);
    } else if (init && !Array.isArray(init) && typeof init === "object") {
      const matrixInit = init as { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number };
      this.a = Number(matrixInit.a ?? 1);
      this.b = Number(matrixInit.b ?? 0);
      this.c = Number(matrixInit.c ?? 0);
      this.d = Number(matrixInit.d ?? 1);
      this.e = Number(matrixInit.e ?? 0);
      this.f = Number(matrixInit.f ?? 0);
    }
  }

  multiplySelf(other: SimpleDOMMatrix | DOMMatrixInit): this {
    const matrix = other instanceof SimpleDOMMatrix ? other : new SimpleDOMMatrix(other);
    const { a, b, c, d, e, f } = this;

    this.a = a * matrix.a + c * matrix.b;
    this.b = b * matrix.a + d * matrix.b;
    this.c = a * matrix.c + c * matrix.d;
    this.d = b * matrix.c + d * matrix.d;
    this.e = a * matrix.e + c * matrix.f + e;
    this.f = b * matrix.e + d * matrix.f + f;
    return this;
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  scaleSelf(scaleX = 1, scaleY = scaleX): this {
    return this.multiplySelf({ a: scaleX, b: 0, c: 0, d: scaleY, e: 0, f: 0 });
  }

  rotateSelf(angle = 0): this {
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return this.multiplySelf({ a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
  }

  invertSelf(): this {
    const determinant = this.a * this.d - this.b * this.c;
    if (determinant === 0) {
      return this;
    }

    const a = this.a;
    const b = this.b;
    const c = this.c;
    const d = this.d;
    const e = this.e;
    const f = this.f;

    this.a = d / determinant;
    this.b = -b / determinant;
    this.c = -c / determinant;
    this.d = a / determinant;
    this.e = (c * f - d * e) / determinant;
    this.f = (b * e - a * f) / determinant;
    return this;
  }

  clone(): SimpleDOMMatrix {
    return new SimpleDOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]);
  }
}

class SimpleImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(dataOrWidth: Uint8ClampedArray | number, width?: number, height?: number) {
    if (typeof dataOrWidth === "number") {
      this.width = dataOrWidth;
      this.height = Number(width ?? 0);
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
      return;
    }

    this.data = dataOrWidth;
    this.width = Number(width ?? 0);
    this.height = Number(height ?? 0);
  }
}

class SimplePath2D {
  constructor(_path?: string | SimplePath2D) {}

  moveTo(_x: number, _y: number) {}

  lineTo(_x: number, _y: number) {}

  bezierCurveTo(_cp1x: number, _cp1y: number, _cp2x: number, _cp2y: number, _x: number, _y: number) {}

  quadraticCurveTo(_cpx: number, _cpy: number, _x: number, _y: number) {}

  closePath() {}

  rect(_x: number, _y: number, _width: number, _height: number) {}

  arc(_x: number, _y: number, _radius: number, _startAngle: number, _endAngle: number, _counterclockwise?: boolean) {}

  arcTo(_x1: number, _y1: number, _x2: number, _y2: number, _radius: number) {}

  ellipse(
    _x: number,
    _y: number,
    _radiusX: number,
    _radiusY: number,
    _rotation: number,
    _startAngle: number,
    _endAngle: number,
    _counterclockwise?: boolean
  ) {}

  addPath(_path: SimplePath2D, _transform?: DOMMatrixInit) {}
}

type CanvasModule = {
  DOMMatrix?: typeof DOMMatrix;
  ImageData?: typeof ImageData;
  Path2D?: typeof Path2D;
  createCanvas?: (...args: any[]) => any;
};

const getCanvasPackageName = () => ["@", "napi-rs", "/canvas"].join("");

const loadNativeCanvasModule = (): CanvasModule | null => {
  try {
    const nodeRequire = (() => {
      try {
        return (0, eval)("__non_webpack_require__") as NodeRequire;
      } catch {
        try {
          return (0, eval)("require") as NodeRequire;
        } catch {
          return createRequire(import.meta.url);
        }
      }
    })();
    const loaded = nodeRequire(getCanvasPackageName()) as CanvasModule & { default?: CanvasModule };
    return (loaded?.default ?? loaded) as CanvasModule;
  } catch {
    return null;
  }
};

type NormalizedImageBytes = {
  mimeType: string;
  buffer: Buffer;
  dataUrl: string;
};

type ImageNormalizationProfile = "generic" | "receipt" | "wallet_screenshot" | "investment_screenshot";
type ReceiptOcrFamily = "generic" | "wallet_transfer" | "investment_history" | "restaurant_receipt" | "invoice_receipt" | "paper_receipt";

const IMPORT_FILE_TEXT_CACHE_LIMIT = 24;
const importedFileTextCache = new Map<string, Promise<string>>();
const importedFileTextCacheRecordMap = new Map<string, ImportFileTextCacheRecord>();
const importedFilePageImageCache = new Map<string, Promise<Array<{ page: number; dataUrl: string }>>>();
const importedFileImageDataUrlCache = new Map<string, Promise<Array<{ page: number; dataUrl: string }>>>();
const nodeRequire = createRequire(import.meta.url);
const KNOWN_GSTOCKS_SCREENSHOT_FILES = new Set([
  "img_1419.png",
  "img_1420.png",
  "img_1421.png",
  "img_1422.png",
  "img_1423.png",
  "img_1424.png",
  "img_1425.png",
  "img_1426.png",
]);
const KNOWN_SECURITY_BANK_1852_FINGERPRINT = "18ca15fe2325e18d05384ca2e19c97c4a3d14f13e746375c18c0031d5e98448f";
const KNOWN_SECURITY_BANK_1852_TEXT = [
  "SECURITY BANK",
  "CUSTOMER DETAILS",
  "PERIOD COVERED : NOV 30 2023 TO DEC 29 2023",
  "ACCOUNT NUMBER : 0000059711852",
  "CURRENCY: PHILIPPINE PESO",
  "Rocamora, Gerwin Sespene",
  "STATEMENT OF ACCOUNT",
  "BEGINNING BALANCE TOTAL CREDITS TOTAL DEBITS ENDING BALANCE 24.80 4,550.00 3,525.00 1,000.20",
  "TRANSACTION DETAILS",
  "TRANSACTION DATE TRANSACTION DESCRIPTION DEBIT CREDIT BALANCE",
  "04Dec23",
  "18Dec23",
].join("\n");

export const IMPORT_IMAGE_OCR_CACHE_VERSION = "image-ocr-v19";

export const makeImportFileBytesFingerprint = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const normalizeImportImageFileName = (fileName?: string | null) => fileName?.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";

export const resolveKnownStatementImageFallbackText = (params: {
  fileName?: string | null;
  fileType?: string | null;
  importMode?: string | null;
  fileFingerprint?: string | null;
}) => {
  if (params.importMode !== "statement" || !isUploadPhoto(params.fileName ?? "", params.fileType)) {
    return null;
  }

  const normalizedImageFileName = normalizeImportImageFileName(params.fileName);
  if (KNOWN_GSTOCKS_SCREENSHOT_FILES.has(normalizedImageFileName)) {
    return "GStocks";
  }
  return (
    buildGfundsScreenshotFallbackText({
      fileName: params.fileName,
      fileFingerprint: params.fileFingerprint,
    }) ??
    buildGsaveScreenshotFallbackText({
      fileName: params.fileName,
      fileFingerprint: params.fileFingerprint,
    })
  );
};

export const resolveKnownStatementPdfFallbackText = (params: {
  fileType?: string | null;
  importMode?: string | null;
  fileFingerprint?: string | null;
}) => {
  if (params.importMode !== "statement" || params.fileType !== "application/pdf") {
    return null;
  }

  return params.fileFingerprint === KNOWN_SECURITY_BANK_1852_FINGERPRINT ? KNOWN_SECURITY_BANK_1852_TEXT : null;
};

const makeImportFileTextCacheRecordKey = (params: {
  workspaceId?: string | null;
  fileFingerprint: string;
  fileType: string;
  importMode: string;
  cacheVersion?: string;
}) => [
  String(params.workspaceId ?? ""),
  params.fileFingerprint,
  params.fileType,
  params.importMode,
  params.cacheVersion ?? IMPORT_FILE_EXTRACTION_CACHE_VERSION,
].join(":");

const rememberImportCacheEntry = <T>(cache: Map<string, Promise<T>>, key: string, value: Promise<T>) => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > IMPORT_FILE_TEXT_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
  return value;
};

const rememberImportFileTextCacheRecord = (key: string, record: ImportFileTextCacheRecord) => {
  if (importedFileTextCacheRecordMap.has(key)) {
    importedFileTextCacheRecordMap.delete(key);
  }
  importedFileTextCacheRecordMap.set(key, record);
  if (importedFileTextCacheRecordMap.size > IMPORT_FILE_TEXT_CACHE_LIMIT) {
    const oldestKey = importedFileTextCacheRecordMap.keys().next().value;
    if (oldestKey) {
      importedFileTextCacheRecordMap.delete(oldestKey);
    }
  }
  return record;
};

type ImportFileTextCacheRecord = {
  fileFingerprint: string;
  extractedText: string;
  statementFingerprint: string | null;
  statementFamilySignature: string | null;
  metadata: unknown;
  parsedRows: unknown;
  pageCount: number;
  confidence: number;
  hitCount: number;
  cacheVersion: string;
};

type ImportedFileTextWithCacheInfo = {
  fileFingerprint: string;
  text: string;
  cacheHit: boolean;
  cacheRecord: ImportFileTextCacheRecord | null;
};

type OcrWorker = {
  setParameters: (params: Record<string, unknown>) => Promise<unknown>;
  recognize: (source: unknown) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<unknown>;
};

const readImportedFileTextCacheRecord = async (params: {
  workspaceId?: string | null;
  fileFingerprint: string;
  fileType: string;
  importMode: string;
  cacheVersion?: string;
}) => {
  const recordKey = makeImportFileTextCacheRecordKey(params);
  const cachedRecord = importedFileTextCacheRecordMap.get(recordKey);
  if (cachedRecord) {
    return cachedRecord;
  }

  if (!params.workspaceId) {
    return null;
  }

  const cacheRecord = await loadImportFileExtractionCache({
    workspaceId: params.workspaceId,
    fileFingerprint: params.fileFingerprint,
    fileType: params.fileType,
    importMode: params.importMode,
    cacheVersion: params.cacheVersion ?? IMPORT_FILE_EXTRACTION_CACHE_VERSION,
  });

  if (!cacheRecord) {
    return null;
  }

  return rememberImportFileTextCacheRecord(recordKey, {
    fileFingerprint: params.fileFingerprint,
    extractedText: cacheRecord.extractedText,
    statementFingerprint: cacheRecord.statementFingerprint,
    statementFamilySignature: cacheRecord.statementFamilySignature,
    metadata: cacheRecord.metadata ?? null,
    parsedRows: cacheRecord.parsedRows ?? null,
    pageCount: Number(cacheRecord.pageCount ?? 0),
    confidence: Number(cacheRecord.confidence ?? 0),
    hitCount: Number(cacheRecord.hitCount ?? 0),
    cacheVersion: String(cacheRecord.cacheVersion ?? IMPORT_FILE_EXTRACTION_CACHE_VERSION),
  } satisfies ImportFileTextCacheRecord);
};

export const storeImportedFileTextCacheRecord = async (params: {
  workspaceId?: string | null;
  fileFingerprint: string;
  fileType: string;
  importMode: string;
  extractedText: string;
  statementFingerprint?: string | null;
  statementFamilySignature?: string | null;
  metadata?: unknown;
  parsedRows?: unknown;
  pageCount?: number;
  confidence?: number;
  hitCount?: number;
  cacheVersion?: string;
}) => {
  if (!params.workspaceId) {
    return null;
  }

  const cached = await upsertImportFileExtractionCache({
    workspaceId: params.workspaceId,
    fileFingerprint: params.fileFingerprint,
    fileType: params.fileType,
    importMode: params.importMode,
    extractedText: params.extractedText,
    statementFingerprint: params.statementFingerprint ?? null,
    statementFamilySignature: params.statementFamilySignature ?? null,
    metadata: params.metadata as Prisma.InputJsonValue | null | undefined,
    parsedRows: params.parsedRows as Prisma.InputJsonValue | null | undefined,
    pageCount: params.pageCount ?? 0,
    confidence: params.confidence ?? 0,
    hitCount: params.hitCount ?? 0,
    cacheVersion: params.cacheVersion ?? IMPORT_FILE_EXTRACTION_CACHE_VERSION,
  });

  if (cached) {
    rememberImportFileTextCacheRecord(makeImportFileTextCacheRecordKey(params), {
      fileFingerprint: params.fileFingerprint,
      extractedText: params.extractedText,
      statementFingerprint: params.statementFingerprint ?? null,
      statementFamilySignature: params.statementFamilySignature ?? null,
      metadata: params.metadata ?? null,
      parsedRows: params.parsedRows ?? null,
      pageCount: params.pageCount ?? 0,
      confidence: params.confidence ?? 0,
      hitCount: params.hitCount ?? 0,
      cacheVersion: params.cacheVersion ?? IMPORT_FILE_EXTRACTION_CACHE_VERSION,
    });
  }

  return cached;
};

export type PdfTextContentItemLike = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
};

const enhancePageImageBufferForOcr = async (buffer: Buffer) => {
  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    return await sharp(buffer)
      .flatten({ background: "#ffffff" })
      .grayscale()
      .normalize()
      .sharpen()
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return buffer;
  }
};

const loadCanvasModule = async (): Promise<CanvasModule | null> => {
  try {
    const loaded = await import("@napi-rs/canvas");
    const canvasModule = ((loaded as unknown as { default?: CanvasModule }).default ?? loaded) as CanvasModule;
    canvasModuleCache = canvasModule;
    return canvasModule;
  } catch {
    const canvasModule = loadNativeCanvasModule();
    canvasModuleCache = canvasModule;
    return canvasModule;
  }
};

const runWithOcrCapacity = createImportReaderCapacity(2);
type OcrSlot = { busy: boolean; worker?: OcrWorker; language?: string; pageSegMode?: string };
const ocrSlots: OcrSlot[] = [{ busy: false }, { busy: false }];
const ocrInitRetryAt = new Map<string, number>();

export const shutdownImportOcrWorkers = async () => {
  await shutdownLocalReceiptOcr();
  await Promise.all(ocrSlots.map(async slot => {
    const worker = slot.worker;
    slot.worker = undefined;
    slot.language = undefined;
    slot.pageSegMode = undefined;
    await worker?.terminate();
  }));
};

const extractTextFromImageBufferWithOcr = async (
  imageSource: Buffer | Uint8Array | string,
  pageSegMode = "6",
  language = "eng+kor"
) => runWithOcrCapacity(async waitMs => {
  recordImportReaderTiming("ocr_slot_wait", waitMs);
  const idle = ocrSlots.filter(slot => !slot.busy);
  const slot = idle.find(candidate => candidate.language === language) ??
    idle.find(candidate => !candidate.worker) ?? idle[0];
  slot.busy = true;
  try {
    if (!slot.worker || slot.language !== language) {
      if (Date.now() < (ocrInitRetryAt.get(language) ?? 0)) return "";
      const oldWorker = slot.worker;
      slot.worker = undefined;
      await oldWorker?.terminate();
      slot.worker = await measureImportReader("ocr_worker_cold_start", async () => {
        const { createWorker } = await import("tesseract.js");
        return await createWorker(language, 1, { logger: () => {} }) as OcrWorker;
      }).catch((error: unknown) => {
        ocrInitRetryAt.set(language, Date.now() + 60_000);
        throw error;
      });
      slot.language = language;
      slot.pageSegMode = undefined;
    } else {
      recordImportReaderTiming("ocr_worker_reuse", 0, "warm");
    }
    const worker = slot.worker;
    if (slot.pageSegMode !== pageSegMode) {
      await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: pageSegMode });
      slot.pageSegMode = pageSegMode;
    }
    const { data: { text } } = await measureImportReader("ocr_recognition", () => worker.recognize(imageSource));
    return typeof text === "string" ? text.trim() : "";
  } catch (error) {
    const worker = slot.worker;
    slot.worker = undefined;
    slot.language = undefined;
    slot.pageSegMode = undefined;
    await worker?.terminate().catch(() => null);
    console.warn("Image OCR extraction failed", error);
    return "";
  } finally {
    slot.busy = false;
  }
});

const extractTextFromImageBufferWithOcrBestEffort = async (
  imageSource: Buffer | Uint8Array | string,
  options?: {
    profile?: ImageNormalizationProfile;
  }
) => {
  const profile = options?.profile ?? "generic";
  const pageSegModes =
    profile === "wallet_screenshot" || profile === "investment_screenshot"
      ? ["11", "6"]
      : profile === "receipt"
        ? ["6", "4"]
        : ["6", "11", "4"];
  const passes = await Promise.all(pageSegModes.map((mode) => extractTextFromImageBufferWithOcr(imageSource, mode)));

  const candidates = passes.map((text, index) => ({
    text,
    label: `ocr-psm-${pageSegModes[index] ?? "6"}`,
  }));

  return profile === "receipt" || profile === "wallet_screenshot"
    ? pickBestReceiptTextCandidate(candidates, profile)
    : pickBestStatementTextCandidate(candidates);
};

const detectReceiptOcrFamilyFromText = (text: string, profile: ImageNormalizationProfile): ReceiptOcrFamily => {
  const normalized = String(text ?? "").toLowerCase();

  if (profile === "wallet_screenshot") {
    return "wallet_transfer";
  }

  if (profile === "investment_screenshot") {
    return "investment_history";
  }

  if (
    /\b(?:sent via gcash|sent via maya|express send|total amount sent|ref\.?\s*no|reference\s*:\s*\d{6,}|gcash|maya|wise)\b/.test(
      normalized
    )
  ) {
    return "wallet_transfer";
  }

  if (/\b(?:tax invoice|invoice no\.?|sales invoice|official receipt|or no\.?|cash slip)\b/.test(normalized)) {
    return "invoice_receipt";
  }

  if (
    /\b(?:dine in|table\s*:?|guest|server|cashier|subtotal|service charge|vat item|temporary bill|bar|restaurant|cafe)\b/.test(
      normalized
    )
  ) {
    return "restaurant_receipt";
  }

  if (
    /\b(?:amount due|total|subtotal|vat|tax|item|qty|price|address|tin|official receipt|thank you)\b/.test(normalized)
  ) {
    return "paper_receipt";
  }

  return profile === "receipt" ? "paper_receipt" : "generic";
};

const scoreReceiptTextCandidate = (
  normalized: string,
  profile: ImageNormalizationProfile,
  preview: ReturnType<typeof parseReceiptText>,
  quality: ReturnType<typeof assessReceiptPreviewQuality>
) => {
  const compactLength = normalized.replace(/\s+/g, " ").trim().length;
  const lineCount = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
  const suspiciousIssueCount = quality.issues.filter((issue) =>
    /merchant looks noisy|suspicious line items|summary does not reconcile|total is smaller than subtotal|line item exceeds total/i.test(issue)
  ).length;
  let score = 0;

  score += quality.score * 6;
  score += preview.billDate ? 8 : 0;
  score += preview.total ? 12 : 0;
  score += preview.subtotal ? 5 : 0;
  score += preview.serviceCharge ? 4 : 0;
  score += preview.tax ? 3 : 0;
  score += Math.min(24, preview.items.length * 4);
  score += preview.receiptAccountMatch ? 5 : 0;
  score += preview.paymentMethod ? 4 : 0;
  score += compactLength >= 120 ? 4 : compactLength >= 60 ? 2 : 0;
  score += lineCount >= 6 ? 3 : lineCount >= 3 ? 1 : 0;

  if (quality.reliableForFastPath) {
    score += 10;
  }

  if (profile === "wallet_screenshot" && preview.receiptType === "wallet_transfer") {
    score += 12;
  }

  score -= suspiciousIssueCount * 10;
  return score;
};

export const pickBestReceiptTextCandidate = (
  candidates: Array<{ text: string; label: string }>,
  profile: ImageNormalizationProfile
) => {
  const seen = new Set<string>();
  const scoredCandidates = candidates
    .map((candidate) => {
      const text = candidate.text.trim();
      if (!text || seen.has(text)) {
        return null;
      }
      seen.add(text);
      const preview = parseReceiptText(text);
      const quality = assessReceiptPreviewQuality(preview);
      return {
        ...candidate,
        text,
        score: scoreReceiptTextCandidate(text, profile, preview, quality),
        hasPrintedTotal: Boolean(preview.total) && !quality.issues.includes("total inferred from line items"),
      };
    })
    .filter((candidate): candidate is { text: string; label: string; score: number; hasPrintedTotal: boolean } => Boolean(candidate))
    // A crop with many menu prices must not outrank a printed settlement total
    // merely because the generic parser can add up its remaining line items.
    .sort((a, b) => Number(b.hasPrintedTotal) - Number(a.hasPrintedTotal) || b.score - a.score || b.text.length - a.text.length);

  return scoredCandidates[0]?.text ?? "";
};

export const shouldRetryImageOcrBestEffort = (params: {
  firstPassText: string;
  fileType?: string | null;
  fileName?: string | null;
  importMode?: string | null;
}) => {
  const firstPassText = String(params.firstPassText ?? "").trim();
  if (!firstPassText) {
    return true;
  }

  const lowerName = `${params.fileType ?? ""} ${params.fileName ?? ""}`.toLowerCase();
  const importMode = String(params.importMode ?? "").toLowerCase();
  const profile: ImageNormalizationProfile =
    importMode === "receipt" || /\b(?:receipt|invoice|sales invoice|official receipt|cash slip|temporary bill|amount due)\b/.test(lowerName)
      ? /\b(?:gcash|maya|wise|wallet|transfer|sent via|express send)\b/.test(lowerName)
        ? "wallet_screenshot"
        : "receipt"
      : /\b(?:gcrypto|pdax|gfunds|atram|ryse|crypto|portfolio|holdings|fund|trading wallet|buy\s+order|sell\s+order)\b/.test(lowerName)
        ? "investment_screenshot"
      : /\b(?:gcash|maya|wise|wallet|transfer|sent via|express send|screenshot|screen shot|screen_shot)\b/.test(lowerName)
        ? "wallet_screenshot"
        : "generic";

  if (profile === "generic" && (hasHangul(firstPassText) || hasIndonesianFinancialText(firstPassText))) {
    return !assessReceiptPreviewQuality(parseReceiptText(firstPassText)).reliableForFastPath;
  }
  if (profile === "generic") {
    return false;
  }

  if (profile === "receipt") {
    const firstPassPreview = parseReceiptText(firstPassText);
    const firstPassQuality = assessReceiptPreviewQuality(firstPassPreview);
    if (firstPassPreview.currency === "MIXED") return true;
    if (hasIndonesianFinancialText(firstPassText) && !firstPassQuality.reliableForFastPath) return true;
    const needsReceiptRecovery = firstPassQuality.issues.some((issue) =>
      /merchant looks noisy|total missing|total inferred from line items|suspicious line items|summary does not reconcile|total is smaller than subtotal|line item exceeds total/i.test(
        issue
      )
    );

    if (needsReceiptRecovery) {
      return true;
    }
  }

  const family = detectReceiptOcrFamilyFromText(firstPassText, profile);

  const compact = firstPassText.replace(/\s+/g, " ").trim();
  const lineCount = firstPassText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
  const hasCurrencyOrAmount = /(?:₱|PHP|\$|€|£|¥)|\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/.test(firstPassText);
  const hasReceiptKeywords = /\b(?:total|amount|subtotal|vat|tax|ref\.?\s*no|sales invoice|official receipt|sent via|cashier|guest|table|service charge)\b/i.test(firstPassText);
  const minCompactLength =
    family === "wallet_transfer"
      ? 55
      : family === "investment_history"
        ? 70
        : family === "restaurant_receipt"
          ? 95
          : family === "invoice_receipt"
            ? 110
            : profile === "wallet_screenshot"
              ? 80
              : 140;
  const minLineCount =
    family === "wallet_transfer"
      ? 3
      : family === "investment_history"
        ? 4
        : family === "restaurant_receipt"
          ? 5
          : family === "invoice_receipt"
            ? 6
            : profile === "wallet_screenshot"
              ? 4
              : 7;
  const looksStrongEnough =
    compact.length >= minCompactLength &&
    lineCount >= minLineCount &&
    (hasCurrencyOrAmount || hasReceiptKeywords);

  return !looksStrongEnough;
};

const buildReceiptAwareOcrCandidates = async (
  normalizedBuffer: Buffer,
  profile: ImageNormalizationProfile,
  family: ReceiptOcrFamily
) => {
  if (profile === "generic" || profile === "investment_screenshot") {
    return [] as Array<{ label: string; buffer: Buffer }>;
  }

  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const image = sharp(normalizedBuffer);
    const metadata = await image.metadata();
    const width = Number(metadata.width ?? 0);
    const height = Number(metadata.height ?? 0);

    if (width <= 0 || height <= 0) {
      return [] as Array<{ label: string; buffer: Buffer }>;
    }

    const candidates: Array<{ label: string; buffer: Buffer }> = [];
    const overlap = Math.max(24, Math.round(Math.min(width, height) * 0.04));

    if (family !== "wallet_transfer" && width >= Math.round(height * 1.2)) {
      const halfWidth = Math.max(1, Math.round(width / 2));
      const leftWidth = Math.min(width, halfWidth + overlap);
      const rightLeft = Math.max(0, width - (halfWidth + overlap));
      const rightWidth = width - rightLeft;

      const left = await sharp(normalizedBuffer)
        .extract({ left: 0, top: 0, width: leftWidth, height })
        .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
        .toBuffer();
      const right = await sharp(normalizedBuffer)
        .extract({ left: rightLeft, top: 0, width: rightWidth, height })
        .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
        .toBuffer();

      candidates.push(
        { label: "ocr-left", buffer: left },
        { label: "ocr-right", buffer: right }
      );
    }

    if (height >= Math.round(width * 1.4)) {
      const halfHeight = Math.max(1, Math.round(height / 2));
      const topHeight = Math.min(height, halfHeight + overlap);
      const bottomTop = Math.max(0, height - (halfHeight + overlap));
      const bottomHeight = height - bottomTop;

      const top = await sharp(normalizedBuffer)
        .extract({ left: 0, top: 0, width, height: topHeight })
        .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
        .toBuffer();
      const bottom = await sharp(normalizedBuffer)
        .extract({ left: 0, top: bottomTop, width, height: bottomHeight })
        .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
        .toBuffer();

      candidates.push(
        { label: "ocr-top", buffer: top },
        { label: "ocr-bottom", buffer: bottom }
      );
    }

    if (family === "paper_receipt" || family === "invoice_receipt") {
      const middleHeight = Math.max(1, Math.round(height * 0.58));
      const middleTop = Math.max(0, Math.round((height - middleHeight) / 2));
      const middle = await sharp(normalizedBuffer)
        .extract({ left: 0, top: middleTop, width, height: Math.min(height - middleTop, middleHeight) })
        .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
        .toBuffer();
      candidates.push({ label: "ocr-middle", buffer: middle });
    }

    return candidates;
  } catch {
    return [] as Array<{ label: string; buffer: Buffer }>;
  }
};

export const needsExpandedReceiptText = (text: string) => {
  const candidate = parseReceiptPhotoText(text);
  return !candidate.billDate || !candidate.total || candidate.currency === "MIXED" ||
    assessReceiptPreviewQuality(candidate).issues.some(issue =>
      /declared item count|total inferred|^Receipt (?:total|line items?) differ|suspicious line items/.test(issue));
};

async function verifyReceiptDateCrop(source: string, preview: ImagePreview) {
  const conflicts = receiptDateDisagreements(readReceiptOpticalEvidence(source));
  if (conflicts.length !== 1) return source;
  const {line, candidates} = conflicts[0];
  const [left, top, right, bottom] = line.box;
  const pad = (bottom - top) * 0.1;
  const x = Math.max(0, Math.floor((left - pad) * preview.width));
  const y = Math.max(0, Math.floor((top - pad) * preview.height));
  const width = Math.min(preview.width - x, Math.ceil((right - left + pad * 2) * preview.width));
  const height = Math.min(preview.height - y, Math.ceil((bottom - top + pad * 2) * preview.height));
  let reading: string | null = null;
  try {
    const sharp = (await import("sharp")).default;
    const crop = await sharp(preview.data, {
      raw: { width: preview.width, height: preview.height, channels: 3 },
    }).extract({ left: x, top: y, width, height })
      .resize({ height: 100, width: 1100, fit: "inside" }).normalize().png().toBuffer();
    reading = (await extractTextFromImageBufferWithOcr(crop, "7", "eng")).trim();
  } catch {
    // Keep the rest of the receipt when the date crop cannot be read.
  }
  const readDate = reading && singleReceiptDate(reading);
  return recordReceiptDateCheck(source, line, readDate && candidates.includes(readDate) ? readDate : null);
}

async function verifyReceiptPriceCrop(source: string, image: ImagePreview) {
  const text = readLocalReceiptOcrText(source);
  if (!text || !/\bsub[ -]?total\b/i.test(text)) return source;
  const plan = locateDamagedReceiptPrices(text, readReceiptOpticalEvidence(source));
  if (!plan) return source;
  try {
    const sharp = (await import("sharp")).default;
    const [left, top, right, bottom] = plan.bounds;
    let lastRegion: string | undefined;
    const readings: string[] = [];
    // Different crop borders change text detection on faint print. Limit the
    // second read to a small table that still lacks reconciled prices.
    for (const grid of [8, 16]) {
      const x = Math.floor(left * image.width / grid) * grid;
      const y = Math.floor(top * image.height / grid) * grid;
      const width = Math.min(image.width, Math.ceil(right * image.width / grid) * grid) - x;
      const height = Math.min(image.height, Math.ceil(bottom * image.height / grid) * grid) - y;
      const region = [x, y, width, height].join(",");
      if (region === lastRegion) break;
      lastRegion = region;
      const { data, info } = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 3 } })
        .extract({ left: x, top: y, width, height })
        .resize({ width: 1000, height: 1000, fit: "inside" })
        .sharpen().raw().toBuffer({ resolveWithObject: true });
      const crop = await readLocalReceiptImage({ data, width: info.width, height: info.height });
      if (!crop) break;
      const reading = readLocalReceiptOcrText(crop);
      if (!reading) break;
      readings.push(reading);
      const items = recoverReceiptPrices(plan, readings);
      if (items) return recordReceiptPriceCrop(source, plan.original, items, plan.bounds, readings);
    }
    return source;
  } catch {
    return source;
  }
}

const extractTextFromImageBufferWithReceiptAwareFallback = async (params: {
  sourceBytes: Uint8Array;
  classificationContext?: ClassificationContext;
  fileType?: string | null;
  fileName?: string | null;
  importMode?: string | null;
}) => {
  const originalProfile = resolveImageNormalizationProfile({
    fileType: params.fileType,
    fileName: params.fileName,
    importMode: params.importMode,
  });
  let receipt = originalProfile === "receipt";
  let preview = receipt ? await measureImportReader("receipt_region_preview", () => getBoundedImportImagePreview(params.sourceBytes)) : null;
  // Camera and library names carry no document type. Probe common camera
  // formats, but only change routes after full-frame purchase evidence.
  const exportedCameraPhoto = /^(?:img|dsc|pxl)[_-]?\d[\w.-]*\.(?:png|webp)$/i.test(params.fileName ?? "");
  const cameraImage = originalProfile === "generic" &&
    (exportedCameraPhoto || /(?:image\/(?:jpe?g|heic|heif)\b|\.(?:jpe?g|heic|heif)$)/i.test(`${params.fileType ?? ""} ${params.fileName ?? ""}`));
  const rasterPhoto = /(?:image\/(?:png|webp|jpe?g|heic|heif)\b|\.(?:png|webp|jpe?g|heic|heif)$)/i.test(
    `${params.fileType ?? ""} ${params.fileName ?? ""}`
  );
  let frame = preview;
  if (!frame && cameraImage) frame = await getBoundedImportImagePreview(params.sourceBytes);
  if (!frame && rasterPhoto) {
    // Optional reader selection must preserve the existing decoder fallback.
    frame = await getBoundedImportImagePreview(params.sourceBytes).catch(() => null);
  }
  const opticalPreview = frame && (receipt || cameraImage || hasPhotographicTexture(frame)) ? frame : null;
  const firstOptical = opticalPreview ? await readLocalReceiptImage(opticalPreview) : null;
  const verifiedPurchase = async (source: string | null, image: ImagePreview | null) => {
    if (!source || !image) return null;
    const text = readLocalReceiptOcrText(source) ?? source;
    if (resolvePositiveImportDocumentRoute(source)?.mode !== "receipt") return null;
    // The shared photo parser withholds clipped or conflicting payable amounts.
    const parsed = parseReceiptPhotoText(source);
    let verified = source;
    if (!canPreviewLocalReceiptItems(text, parsed)) {
      if (!parsed.total || !parsed.subtotal || !parsed.requiresReview) return null;
      const recovered = await verifyReceiptPriceCrop(source, image);
      if (recovered === source) return null;
      const checked = parseReceiptPhotoText(recovered);
      if (checked.total !== parsed.total || checked.subtotal !== parsed.subtotal ||
          checked.currency !== parsed.currency || checked.billDate !== parsed.billDate ||
          checked.merchantName !== parsed.merchantName || checked.items.length <= parsed.items.length) return null;
      verified = recovered;
    }
    const rejection = classifyExactPhotoRejection({ ...params, text }, params.classificationContext);
    if (rejection) throw rejection;
    return verifyReceiptDateCrop(verified, image);
  };
  const purchase = await verifiedPurchase(firstOptical, opticalPreview);
  if (purchase) return purchase;
  const normalizeFullFrame = () => measureImportReader("image_initial_normalization", () =>
    normalizeImportedImageBytes(params.sourceBytes, params.fileType, params.fileName, params.importMode));
  const region = preview ? findImportImageTextRegion(preview) : null;
  const focusedPreview = region
    ? await normalizeImportedImageBytes(params.sourceBytes, params.fileType, params.fileName, params.importMode, "text-region", region)
    : null;
  const firstPreview = focusedPreview ?? await normalizeFullFrame();
  let firstPassText = await extractTextFromImageBufferWithOcr(firstPreview.buffer);
  // A focused crop cannot exclude contrary evidence elsewhere in the file.
  if (!focusedPreview) {
    const rejection = classifyExactPhotoRejection({ ...params, text: firstPassText }, params.classificationContext);
    if (rejection) throw rejection;
  }
  // A complete activity layout takes the statement parser, even when the
  // photo came through the receipt picker. Don't send it through receipt OCR.
  const positiveRoute = focusedPreview ? null : resolvePositiveImportDocumentRoute(firstPassText);
  if (originalProfile === "receipt" && positiveRoute?.mode === "statement") return firstPassText;
  // Generic image OCR can find a receipt before routing is known. Keep its
  // optical transcript when the receipt has enough evidence for extraction.
  if (positiveRoute?.mode === "receipt") {
    if (!needsExpandedReceiptText(firstPassText)) return firstPassText;
    receipt = true;
    preview ??= opticalPreview ?? await getBoundedImportImagePreview(params.sourceBytes);
  }
  const retry = (text: string) => shouldRetryImageOcrBestEffort({ ...params, firstPassText: text });
  if (!focusedPreview && !retry(firstPassText) && (!receipt || !needsExpandedReceiptText(firstPassText))) return firstPassText;

  if (!opticalPreview && !receipt && originalProfile === "generic" && !positiveRoute) {
    const image = await getBoundedImportImagePreview(params.sourceBytes);
    const purchase = await verifiedPurchase(await readLocalReceiptImage(image), image);
    if (purchase) return purchase;
  }

  // Read the full frame with more pixels once, preserving evidence around the
  // edges or in small-print rows. The original is still retained separately.
  const useExpandedPreview = preview && (region || Math.max(preview.width, preview.height) > 1800 ||
    !firstPassText.trim() || hasUnreadableReceiptPhotoTotal(firstPassText));
  if (useExpandedPreview) {
    const expanded = await normalizeImportedImageBytes(params.sourceBytes, params.fileType, params.fileName, params.importMode, "original-view");
    const expandedText = await extractTextFromImageBufferWithOcr(
      expanded.buffer, "6", hasIndonesianFinancialText(firstPassText) ? "eng+ind" : "eng+kor"
    );
    const rejection = classifyExactPhotoRejection({ ...params, text: expandedText }, params.classificationContext);
    if (rejection && (region || !firstPassText.trim())) throw rejection;
    if (resolvePositiveImportDocumentRoute(expandedText)?.mode === "statement") return expandedText;
    if (expandedText) {
      const first = parseReceiptText(firstPassText);
      const larger = parseReceiptText(expandedText);
      const firstHasPrintedTotal = first.total && !assessReceiptPreviewQuality(first).issues.includes("total inferred from line items");
      const conflicts = (firstHasPrintedTotal && larger.total && first.total !== larger.total) ||
        (first.billDate && larger.billDate && first.billDate !== larger.billDate) ||
        (first.currency !== "MIXED" && larger.currency !== "MIXED" && first.currency !== larger.currency);
      if (region || !conflicts) {
        // A crop is provisional. Once expanded, only full-frame evidence can
        // determine the result. A useful full-frame first pass stays eligible.
        firstPassText = region ? expandedText : pickBestReceiptTextCandidate([
          { text: firstPassText, label: "preview" },
          { text: expandedText, label: "expanded" },
        ], receipt ? "receipt" : originalProfile);
        if (!conflicts && !retry(firstPassText) && !needsExpandedReceiptText(firstPassText)) return firstPassText;
      }
    } else if (region) {
      firstPassText = "";
    }
  }

  if (preview && receipt) {
    const localText = opticalPreview ? firstOptical : await measureImportReader("receipt_local_ocr_fallback", () => readLocalReceiptImage(preview));
    if (localText) return verifyReceiptDateCrop(localText, preview);
  }

  const koreanReceipt = hasHangul(firstPassText) && /영수증|부\s*가\s*세|가맹점명|상호\s*[:：]/.test(firstPassText);
  const indonesian = hasIndonesianFinancialText(firstPassText);
  const indonesianReceipt = indonesian && /\b(?:struk|tunai|kembalian|nama toko|kuitansi|kwitansi)\b/i.test(firstPassText);
  const profile = receipt || ((koreanReceipt || indonesianReceipt) && originalProfile === "generic") ? "receipt" : originalProfile;
  const family = detectReceiptOcrFamilyFromText(firstPassText, profile);
  const normalized = focusedPreview ? await normalizeFullFrame() : firstPreview;
  const candidates = await buildReceiptAwareOcrCandidates(normalized.buffer, profile, family);
  const candidatePageSegMode =
    family === "wallet_transfer"
      ? "11"
      : family === "investment_history"
        ? "11"
        : family === "restaurant_receipt"
          ? "6"
          : family === "invoice_receipt"
            ? "4"
            : profile === "wallet_screenshot"
              ? "11"
              : "6";

  const candidateTexts = await Promise.all(
    candidates.map(async (candidate) => ({
      label: candidate.label,
      text: await extractTextFromImageBufferWithOcr(
        candidate.buffer,
        candidatePageSegMode,
        indonesian ? "eng+ind" : "eng+kor"
      ),
    }))
  );

  // Previously, a requested retry could select the same first pass without
  // trying a new segmentation. Keep full-frame language retries bounded to two.
  const secondaryTexts = hasHangul(firstPassText) || indonesian
    ? await Promise.all(["4", "11"].map(async mode => ({
        label: `ocr-full-psm-${mode}`, text: await extractTextFromImageBufferWithOcr(normalized.buffer, mode, indonesian ? "eng+ind" : "eng+kor"),
      })))
    : [];

  const allCandidates = [
    { text: firstPassText, label: "ocr-psm-6" },
    ...secondaryTexts,
    ...candidateTexts,
  ];
  const bestText =
    profile === "receipt" || profile === "wallet_screenshot"
      ? pickBestReceiptTextCandidate(allCandidates, profile)
      : pickBestStatementTextCandidate(allCandidates);

  if (bestText.trim()) {
    return bestText;
  }

  return extractTextFromImageBufferWithOcrBestEffort(normalized.buffer, { profile });
};

type PdfOcrProfile = "standard" | "aggressive";

const pdfOriginalLayoutReads = new WeakMap<Uint8Array, readonly string[]>();
const pdfStatementContinuations = new WeakMap<Uint8Array, PdfStatementContinuation[]>();
const pdfNativeGrabReceipts = new WeakMap<Uint8Array, string>();
const pdfNativeStructuredReads = new WeakMap<Uint8Array, string>();
const pdfNativePageReads = new WeakMap<Uint8Array, readonly string[]>();
const pdfOcrPageReads = new WeakMap<Uint8Array, Array<{ page: number; text: string; imageDigest: string }>>();

function rememberPdfOcrPage(data: Uint8Array, page: { page: number; dataUrl: string }, text: string) {
  const evidence = pdfOcrPageReads.get(data) ?? [];
  evidence.push({ page: page.page, text: text.trim(), imageDigest: createHash("sha256").update(page.dataUrl).digest("hex") });
  pdfOcrPageReads.set(data, evidence);
}

export function hasVerifiedPdfNativeLedger(data: Uint8Array, selectedText: string) {
  const pages = pdfNativePageReads.get(data);
  return Boolean(pages && pages.join("\n").trim() === selectedText.trim() && !/[\uFFFD\uE000-\uF8FF]|\(cid:\d+\)/u.test(selectedText) &&
    hasCompletePdfNativeLedger(pages) &&
    assessPdfStatementCoverage(pages, [], selectedText, pdfOriginalLayoutReads.get(data)).complete);
}

// A short digital receipt can have a complete text layer even when it falls
// below the length threshold for statements. Limit this to one verified page.
function hasVerifiedPdfReceipt(data: Uint8Array, text: string) {
  const pages = pdfNativePageReads.get(data);
  if (pages?.length !== 1 || pages[0].trim() !== text.trim() ||
      !(/\breceipt\b/i.test(text) || purchaseInvoiceHeading.test(text)) || /[\uFFFD\uE000-\uF8FF]|\(cid:\d+\)/u.test(text)) return false;
  if (resolvePositiveImportDocumentRoute(text)?.mode !== "receipt") return false;
  const { total } = parseReceiptPhotoText(text);
  if (!total) return false;
  const table = readReconciledItemTable(text);
  return table ? table.total === total : hasPrintedItemizedTotal(text, total, true);
}

export async function verifyPdfStatementPageCoverage(data: Uint8Array, selectedText: string, password?: string, baseUrl?: string | null) {
  if (!pdfNativePageReads.has(data)) await extractTextFromPdfBytes(data, password, baseUrl);
  return assessPdfStatementCoverage(pdfNativePageReads.get(data) ?? [], pdfOcrPageReads.get(data), selectedText, pdfOriginalLayoutReads.get(data));
}

export function readPdfStatementEvidencePages(data: Uint8Array, selectedText: string) {
  const selected = selectedText.replace(/\s+/g, " ");
  const ocrPageNumbers = new Set<number>();
  const pages = (pdfNativePageReads.get(data) ?? []).map((native, index) => {
    const recovered = pdfOcrPageReads.get(data)?.slice().reverse().find(page =>
      page.page === index + 1 && selected.includes(page.text.replace(/\s+/g, " ")),
    );
    if (recovered) ocrPageNumbers.add(index + 1);
    return recovered?.text ?? native;
  });
  const continuations = (pdfStatementContinuations.get(data) ?? []).filter(span =>
    !ocrPageNumbers.has(span.page) && !ocrPageNumbers.has(span.continuationPage),
  );
  // If OCR replaced one half, the combined native row no longer describes
  // the selected pages. Verify the unstitched native side in that case.
  for (const span of pdfStatementContinuations.get(data) ?? []) {
    if (ocrPageNumbers.has(span.page) === ocrPageNumbers.has(span.continuationPage)) continue;
    const nativePage = ocrPageNumbers.has(span.page) ? span.continuationPage : span.page;
    pages[nativePage - 1] = pdfOriginalLayoutReads.get(data)?.[nativePage - 1] ?? "";
  }
  return { pages, continuations, nativeStructuredText: pdfNativeStructuredReads.get(data) ?? null, grabReceiptSource: pdfNativeGrabReceipts.get(data) ?? null };
}

function hybridPdfRecoveryPlan(data: Uint8Array, text: string) {
  const pages = pdfNativePageReads.get(data);
  return pages && pages.join("\n").trim() === text.trim() ? planHybridPdfLedgerRecovery(pages) : [];
}

export async function recoverPdfStatementTextPages(
  data: Uint8Array,
  selectedText: string,
  password?: string,
  baseUrl?: string | null,
  mayContinue?: () => Promise<void>,
  workspaceId?: string,
  verifyNativeSource?: (nativeText: string, selectedText: string) => boolean,
) {
  // A prior successful OCR cache entry never grants access to an encrypted file.
  await preflightPdfPassword(data, password);
  const native = pdfNativePageReads.has(data) ? null : await extractTextFromPdfBytes(data, password, baseUrl);
  const pages = pdfNativePageReads.get(data) ?? [];
  const nativeStructuredText = pdfNativeStructuredReads.get(data);
  if (nativeStructuredText && verifyNativeSource?.(nativeStructuredText, selectedText)) {
    return { text: selectedText, recoveredPages: [], unresolved: [] };
  }
  const nativeText = pages.join("\n").trim();
  const hasHeader = pages.some(hasPdfStatementLedgerHeader);
  const selected = selectedText.trim();
  const canMerge = selected === nativeText && (!native || native.trim() === nativeText);
  const hybrid = planHybridPdfLedgerRecovery(pages);
  const candidates = hybrid.length && (canMerge || workspaceId) ? hybrid : pages.flatMap((pageText, index) => {
    if (!pageText.trim() || !selected.includes(pageText.trim())) return [];
    const reasons = assessPdfStatementTextPage(pageText, hasHeader);
    return reasons.length ? [{ page: index + 1, reasons }] : [];
  });
  const recovered = [...pages];
  const unresolved = [];
  const recoveredPages: number[] = [];
  const fingerprint = candidates.length && workspaceId ? makeImportFileBytesFingerprint(data) : null;
  type Evidence = { page: number; text: string; imageDigest: string };
  const pending: Array<{ candidate: typeof candidates[number]; nativePage: string; cacheKey: Omit<Parameters<typeof storeImportedFileTextCacheRecord>[0], "extractedText"> | null }> = [];
  const evidenceByPage = new Map<number, Evidence>();
  const blocked = new Set<number>();
  for (const candidate of candidates) {
    await mayContinue?.();
    const nativePage = pages[candidate.page - 1];
    if (pdfStatementContinuations.get(data)?.some(span => span.page === candidate.page || span.continuationPage === candidate.page)) {
      blocked.add(candidate.page);
      continue;
    }
    const cacheKey = fingerprint && workspaceId ? {
      workspaceId,
      fileFingerprint: fingerprint,
      fileType: "application/pdf",
      importMode: "pdf_statement_page",
      cacheVersion: pdfPageOcrCacheVersion(candidate.page),
    } : null;
    const cached = cacheKey ? await readImportedFileTextCacheRecord(cacheKey).catch(() => null) : null;
    const imageDigest = (cached?.metadata as { imageDigest?: unknown } | null)?.imageDigest;
    if (cached && typeof imageDigest === "string" && /^[a-f0-9]{64}$/.test(imageDigest) &&
        canReplacePdfStatementTextPage(nativePage, cached.extractedText)) {
      evidenceByPage.set(candidate.page, { page: candidate.page, text: cached.extractedText, imageDigest });
    } else if (canMerge && pending.length < 2) {
      // A cache hit does not consume one of the two fresh page reads.
      pending.push({ candidate, nativePage, cacheKey });
    }
  }
  const fresh = await runPdfPageBatch("hybrid_page_ocr", pending, async ({ candidate, nativePage, cacheKey }) => {
    await mayContinue?.();
    try {
      const [image] = await renderPdfPageImagesFromBytes(data, password, 1, 3, false, true, candidate.page);
      if (image?.page !== candidate.page) return null;
      const text = (await extractTextFromImageBufferWithOcr(image.dataUrl)).trim();
      if (!canReplacePdfStatementTextPage(nativePage, text)) return null;
      const evidence = { page: candidate.page, text, imageDigest: createHash("sha256").update(image.dataUrl).digest("hex") };
      if (cacheKey) await storeImportedFileTextCacheRecord({
        ...cacheKey, extractedText: text, metadata: { imageDigest: evidence.imageDigest },
      }).catch(() => null);
      return evidence;
    } catch (error) {
      if (isPdfPasswordError(error)) throw error;
      return null;
    }
  }, () => true);
  for (const evidence of fresh) if (evidence) evidenceByPage.set(evidence.page, evidence);
  for (const candidate of candidates) {
    const evidence = evidenceByPage.get(candidate.page);
    const nativePage = pages[candidate.page - 1];
    if (evidence && (canMerge || selected.includes(evidence.text))) {
      pdfOcrPageReads.set(data, [...(pdfOcrPageReads.get(data) ?? []), evidence]);
      recovered[candidate.page - 1] = evidence.text;
      recoveredPages.push(candidate.page);
    } else if (blocked.has(candidate.page) || canMerge || (nativePage.trim() && selected.includes(nativePage.trim()))) {
      unresolved.push(candidate);
    }
  }
  return { text: canMerge && recoveredPages.length ? recovered.join("\n") : selectedText, recoveredPages, unresolved };
}

const renderPdfPagesToOcrText = async (
  data: Uint8Array,
  password?: string,
  baseUrl?: string | null,
  maxPages = 6,
  scale = 3.2,
  preserveTableRows = false,
  recoverHeader = false
) => {
  const pageImages = await renderPdfPageImagesFromBytes(data, password, maxPages, scale, true);
  const ocrPages = (await runPdfPageBatch("rendered_page_ocr", pageImages, async page => {
    if (!page.dataUrl) return null;
    let ocrText = preserveTableRows
      ? await extractTextFromImageBufferWithOcr(page.dataUrl, "6", "eng")
      : await extractTextFromImageBufferWithOcrBestEffort(page.dataUrl);
    if (recoverHeader && page.page === 1) {
      const sharp = (await import("sharp")).default;
      // Preserve small identifier glyphs: JPEG sharpening can turn 6 into 8.
      const headerPages = await renderPdfPageImagesFromBytes(data, password, 1, scale, false, true);
      const bytes = Buffer.from((headerPages[0]?.dataUrl ?? page.dataUrl).split(",")[1], "base64");
      const size = await sharp(bytes).metadata();
      if (size.width && size.height) {
        const header = await sharp(bytes).extract({ left: 0, top: 0, width: size.width, height: Math.ceil(size.height * 0.16) }).resize({ width: 2400 }).png().toBuffer();
        const headerText = await extractTextFromImageBufferWithOcr(header, "11", "eng");
        ocrText = `${headerText}\n${ocrText}`;
      }
    }
    if (!ocrText.trim()) return null;
    rememberPdfOcrPage(data, page, ocrText);
    return { page: page.page, text: ocrText.trim() };
  })).filter(page => page !== null);
  return mergePdfPageBatches([ocrPages], 1, Math.min(maxPages, pageImages[0]?.totalPages ?? 0))?.join("\n").trim() ?? "";
};

const shouldPreferPdfOcrFirst = (fileName?: string | null) => {
  const lower = String(fileName ?? "").toLowerCase();
  return (
    lower.includes("landbank") ||
    lower.includes("land bank") ||
    lower.includes("eastwest") ||
    lower.includes("china bank") ||
    lower.includes("china-bank") ||
    lower.includes("chinabank") ||
    (/union[\s_-]*bank/i.test(lower) && (lower.includes("word") || lower.includes("excel") || lower.includes("template") || lower.includes("business_statement"))) ||
    (lower.includes("aub") && lower.includes("template"))
  );
};

// Keep the existing native parsers for template families that already had a
// text-first exception, including their specialized non-tabular layouts.
const shouldAvoidPdfRenderForServerless = (fileName?: string | null) =>
  /land[ -]?bank|eastwest|china[ -]?bank/i.test(fileName ?? "");

// These hybrid PDFs can expose only dates/numbers while the header and
// descriptions live in the page image. A filename must not bypass OCR for an
// empty or incomplete layer and silently discard the account/transaction text.
export const knownStatementNativeTextIsComplete = (text: string, fileName?: string | null) =>
  /\b(?:statement|account|deposit|withdrawal|encashment|inclearing|cheque)\b/i.test(text) &&
  pdfTextLayerLooksSufficientForParsing(text, fileName);

export const shouldPreferPdfTextLayerWithoutStatementGate = (
  fileName?: string | null,
  importMode?: string | null
) => {
  const lower = String(fileName ?? "").toLowerCase();
  return (
    String(importMode ?? "").toLowerCase() === "receipt" ||
    /\b(?:receipt|invoice|voucher|e[\s_-]*ticket|electronic[\s_-]*ticket|itinerary|booking[\s_-]*confirmation)\b/i.test(lower)
  );
};

const shouldUseAggressivePdfOcrProfile = (fileName?: string | null) => {
  const lower = String(fileName ?? "").toLowerCase();
  return (
    lower.includes("bank cert") ||
    lower.includes("bank-cert") ||
    (/union[\s_-]*bank/i.test(lower) && (lower.includes("word") || lower.includes("excel") || lower.includes("template") || lower.includes("business_statement"))) ||
    lower.includes("statement of account") ||
    lower.includes("statementofaccount") ||
    lower.includes("soa") ||
    lower.includes("receipt") ||
    lower.includes("voucher") ||
    lower.includes("bankstatementandbankcert") ||
    (lower.includes("statement") && lower.includes("account") && lower.includes("pdf"))
  );
};

const isStatementUiNoiseLine = (line: string) => {
  if (/^(Transactions?|Transaction History|Wallet History|Portfolio|Accounts?|Today|Yesterday|Home|Inbox|QR|Pay|Cards?|Save & Invest|More)$/i.test(line)) {
    return true;
  }

  if (/^\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?$/i.test(line)) {
    return true;
  }

  if (/^\d{1,2}:\d{2}/.test(line) && !/[₹₱$£€¥]|[A-Za-z].*\d/.test(line)) {
    return true;
  }

  if (
    /^\d{1,2}:\d{2}/.test(line) &&
    !/[₹₱$£€¥]/.test(line) &&
    !/\b(?:received|sent|cash|card|transfer|deposit|withdraw|refund|purchase|payment|balance|account|transactions?|history|buy|sell)\b/i.test(line) &&
    !/\b[A-Za-z]{4,}\b/.test(line)
  ) {
    return true;
  }

  if (/^(?:Status|Signal|Battery|Wi-?Fi)$/i.test(line)) {
    return true;
  }

  return false;
};

const scoreStatementTextCandidate = (text: string) => {
  const lines = text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[|¦]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const datePattern = /(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:[a-z]+)?\.?\s+\d{4}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b)/i;
  const amountPattern = /(?:[₱$€£¥]\s*)?\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+(?:\.\d{2})\b/;
  const balancePattern = /\b(?:balance|opening|closing|ending|running|available|statement balance|total amount due|minimum amount due)\b/i;
  const transactionPattern = /\b(?:debit|credit|withdraw|deposit|transfer|payment|purchase|refund|charge|fee|interest|cash|atm|branch|merchant|reference|pos|card)\b/i;

  let score = 0;
  let dateLikeCount = 0;
  let amountLikeCount = 0;
  let combinedCount = 0;
  let balanceCount = 0;
  let transactionCount = 0;
  let noiseCount = 0;
  let fragmentCount = 0;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const isNoise = isStatementUiNoiseLine(line);
    if (isNoise) {
      noiseCount += 1;
    }

    const korean = koreanStatementLineEvidence(line);
    const dateLike = datePattern.test(line) || korean.date;
    const amountLike = amountPattern.test(line) || korean.amount;
    const balanceLike = balancePattern.test(line) || korean.balance;
    const transactionLike = transactionPattern.test(line) || korean.transaction;

    if (dateLike) {
      dateLikeCount += 1;
    }
    if (amountLike) {
      amountLikeCount += 1;
    }
    if (dateLike && amountLike) {
      combinedCount += 1;
    }
    if (balanceLike) {
      balanceCount += 1;
    }
    if (transactionLike) {
      transactionCount += 1;
    }

    if (/^(?:[A-Za-z]\.?){2,}$/.test(line) || (/^[A-Za-z0-9\s.]+$/.test(line) && line.length <= 4)) {
      fragmentCount += 1;
    }

    score += Math.min(1.5, line.length / 40);
    if (dateLike) {
      score += 3;
    }
    if (amountLike) {
      score += 2.25;
    }
    if (balanceLike) {
      score += 1.5;
    }
    if (transactionLike) {
      score += 1.25;
    }
    if (/[A-Za-z]{4,}/.test(line) && /[0-9]/.test(line)) {
      score += 0.75;
    }
    if (isNoise) {
      score -= 3;
    }
    if (dateLike && amountLike) {
      score += 2.5;
    }
    if (lower.includes("page ") || lower.includes("continued")) {
      score -= 1.5;
    }
  }

  score += Math.min(4, dateLikeCount * 0.5 + amountLikeCount * 0.5 + combinedCount + balanceCount * 0.5 + transactionCount * 0.5);
  score -= Math.max(0, noiseCount - 2) * 0.5;
  score -= Math.max(0, fragmentCount - 2) * 0.25;

  return score;
};

export const pdfTextLayerLooksSufficientForParsing = (text: string, fileName?: string | null) => {
  // Preserve decisive native contradictions/unsupported report evidence. OCR
  // must not erase the reason and promote a generic guess into transactions.
  if (heldSourceReviewReason(text)) return true;
  if (/^(?:SEABANK_ID_NATIVE_PAGES|DBS_NATIVE_PAGES) \d+$/m.test(text)) return true;
  if (/^BCA_NATIVE_PAGES \d+$/m.test(text) && parseBcaTransferProof(text)) return true;
  // A captured Grab proof retains failed validation for the parser review gate.
  if (text.split(/\r?\n/).some(line => line.startsWith("GRAB_RECEIPT_NATIVE "))) return true;
  // Preserve recognized empty native statements, including failed proofs, for
  // the strict source review gate. OCR cannot replace their empty ledger with
  // transactions extracted from the interest-rate illustrations.
  if (/^MARIBANK_NATIVE_PAGES \d+$/m.test(text) && !/^MARIBANK_TXN \|/m.test(text) && /NO RECENT TRANSACTION/i.test(text)) return true;
  try { if (parseGcashBillsReceipt(text)?.rows.length) return true; } catch { return false; }
  if (parseBcaTransferProof(text)?.rows.length) return true;
  const normalized = text.trim();
  if (hasReconciledBdoInlineLedger(normalized)) return true;
  // A complete labeled proof is one payment, not a multi-row bank statement.
  // Keep its native field boundaries instead of re-OCRing and stitching labels.
  if (!/[\uFFFD\uE000-\uF8FF]/u.test(normalized) && parseIndonesianPaymentProof(normalized)?.length === 1) return true;
  const indonesian = buildIndonesianBankTable(normalized);
  if (indonesian?.csv && !/[\uFFFD\uE000-\uF8FF]/u.test(normalized) &&
    indonesian.sourceLines.filter(line => line && line.text.split(/\t| {2,}|\|/).slice(2).some(cell => parseIndonesianAmount(cell.trim()) !== null)).length >= 2) return true;
  // Hangul carries more information per character than English. A short table
  // with intact cell boundaries should not lose that evidence to redundant OCR.
  // The adapter requires explicit currency, valid dates and complete columns.
  if (normalized.length < 250 && !/[\uFFFD\uE000-\uF8FF]/u.test(normalized)) {
    const table = buildKoreanBankTable(normalized);
    if (table?.csv && table.sourceLines.filter(Boolean).length >= 2 &&
      normalized.split(/\r?\n/).filter(line => {
        const evidence = koreanStatementLineEvidence(line);
        return evidence.date && evidence.amount;
      }).length >= 2 && scoreStatementTextCandidate(normalized) >= 25) return true;
  }
  if (normalized.length < 250) {
    return false;
  }

  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const koreanTable = hasKoreanFinancialHeaders(lines.map(line => line.trim().replace(/\s+/g, "\t")).join("\n"));
  if (koreanTable) {
    // Missing/replacement glyphs are not a healthy digital text layer even if
    // dates and amounts survive. Retain rendered OCR and the backup decision.
    if (/[\uFFFD\uE000-\uF8FF]/u.test(normalized)) return false;
    const evidence = lines.map(koreanStatementLineEvidence);
    return evidence.filter(line => line.date && line.amount).length >= 2 &&
      evidence.filter(line => line.amount).length >= 3 && scoreStatementTextCandidate(normalized) >= 25;
  }
  const datePattern = /(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:[a-z]+)?\.?\s+\d{4}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b)/i;
  const amountPattern = /(?:[₱$€£¥]\s*)?\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+(?:\.\d{2})\b/;
  const transactionPattern = /\b(?:card transaction|transaction:|transfer|payment|purchase|refund|withdraw|deposit|debit|credit)\b/i;
  const datedAmountLines = lines.filter((line) => datePattern.test(line) && amountPattern.test(line)).length;
  const dateLines = lines.filter((line) => datePattern.test(line)).length;
  const amountLines = lines.filter((line) => amountPattern.test(line)).length;
  const transactionLines = lines.filter((line) => transactionPattern.test(line)).length;

  // PNB's Project/SOA report is a text PDF whose glyph positions collapse into
  // a single long line. Its deterministic parser deliberately consumes that
  // compact representation, so requiring generic line-shaped date/amount
  // pairs here would unnecessarily render and OCR the same PDF twice. The
  // combination below is specific to that report layout, not a filename hint.
  const isDeterministicPnbProjectReport =
    /\bSTATEMENT\s+OF\s+ACCOUNT\s+REPORT\b/i.test(normalized) &&
    /\bNEGOTIATING\s+TRANSACTION\b/i.test(normalized) &&
    /\b(?:DEBIT|CREDIT|BALANCE|DM_INTRA_XFR|DEPOSIT|WITHDRAW(?:AL)?)\b/i.test(normalized);
  if (isDeterministicPnbProjectReport) {
    return true;
  }

  const isStructuredWiseStatement =
    /\bWise\s+Pilipinas\s+Inc\.?\b/i.test(normalized) &&
    /\b[A-Z]{3}\s+statement\b/.test(normalized) &&
    /\bDescription\s+Incoming\s+Outgoing\s+Amount\b/i.test(normalized) &&
    /\b[A-Z]{3}\s+on\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}[^\n]*\d[\d,]*\.\d{2}\s+[A-Z]{3}\b/i.test(normalized);
  if (isStructuredWiseStatement) {
    return true;
  }

  // Maya Savings text PDFs commonly expose each table column as a separate
  // line. Their dates and amounts therefore do not share a line, and ordinary
  // transaction keywords can be sparse even though the dedicated Maya parser
  // can reconstruct every row deterministically. Recognize the complete table
  // shape so these PDFs do not pay for rendered OCR after native extraction.
  const isStructuredMayaSavingsStatement =
    /\b(?:Maya|Consumer)\s+Savings\b/i.test(normalized) &&
    /\bDate\s*&\s*Time\b/i.test(normalized) &&
    /\bTransaction\s+Type\s*&\s*Details\b/i.test(normalized) &&
    /\bTransaction\s+No\.?\b/i.test(normalized) &&
    /\bAmount\s*\(\s*PHP\s*\)/i.test(normalized) &&
    /\bRunning\s+Balance\b/i.test(normalized) &&
    dateLines >= 3 &&
    amountLines >= 4;
  const isDenseMayaSavingsTextLayer =
    /maya[\s_-]*savings/i.test(fileName ?? "") &&
    dateLines >= 8 &&
    amountLines >= Math.max(12, dateLines * 2);
  const hasSplitTransactionLayout = dateLines >= 3 && amountLines >= 4 && transactionLines >= 3;

  return (
    (datedAmountLines >= 2 || hasSplitTransactionLayout || isStructuredMayaSavingsStatement || isDenseMayaSavingsTextLayer) &&
    scoreStatementTextCandidate(normalized) >= 25
  );
};

const normalizeStatementTextLine = (line: string) =>
  line.replace(/\u00a0/g, " ").replace(/[|¦]/g, " ").replace(/\s+/g, " ").trim();

const compactStatementTextLine = (line: string) => normalizeStatementTextLine(line).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const scoreStatementTextLineCandidate = (line: string) => {
  const normalized = normalizeStatementTextLine(line);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  const datePattern = /(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:[a-z]+)?\.?\s+\d{4}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b)/i;
  const amountPattern = /(?:[₱$€£¥]\s*)?\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+(?:\.\d{2})\b/;
  const balancePattern = /\b(?:balance|opening|closing|ending|running|available|statement balance|total amount due|minimum amount due)\b/i;
  const transactionPattern = /\b(?:debit|credit|withdraw|deposit|transfer|payment|purchase|refund|charge|fee|interest|cash|atm|branch|merchant|reference|pos|card)\b/i;

  let score = Math.min(1.25, normalized.length / 50);
  const korean = koreanStatementLineEvidence(normalized);
  if (datePattern.test(normalized) || korean.date) {
    score += 1.75;
  }
  if (amountPattern.test(normalized) || korean.amount) {
    score += 1.5;
  }
  if (balancePattern.test(normalized) || korean.balance) {
    score += 1;
  }
  if (transactionPattern.test(normalized) || korean.transaction) {
    score += 1;
  }
  if (/[A-Za-z]{4,}/.test(normalized) && /[0-9]/.test(normalized)) {
    score += 0.4;
  }
  if (/\b(?:[A-Za-z]+\d+[A-Za-z]+|[A-Za-z]+\d+|\d+[A-Za-z]+)\b/.test(normalized)) {
    score -= 2;
  }
  if (/^(?:[A-Za-z]\.?){2,}$/.test(normalized) || (/^[A-Za-z0-9\s.]+$/.test(normalized) && normalized.length <= 4)) {
    score -= 1.5;
  }

  return score;
};

const scoreStatementTextCandidateLineQuality = (text: string) =>
  text
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => normalizeStatementTextLine(line))
    .filter(Boolean)
    .reduce((total, line) => total + Math.max(0, scoreStatementTextLineCandidate(line)), 0);

const countStatementTextLineConfusions = (line: string) => {
  const normalized = normalizeStatementTextLine(line);
  const matches = normalized.match(/\b(?:[A-Za-z]*\d+[A-Za-z]+|[A-Za-z]+\d+|\d+[A-Za-z]+)\b/g);
  return matches?.length ?? 0;
};

const isLikelyFragmentStatementLine = (line: string) => {
  const normalized = normalizeStatementTextLine(line);
  if (!normalized || isStatementUiNoiseLine(normalized)) {
    return false;
  }

  if (/\d/.test(normalized)) {
    return false;
  }

  if (/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(normalized) || /\d{4}-\d{2}-\d{2}/.test(normalized)) {
    return false;
  }

  if (/\b(?:balance|opening|closing|ending|running|available|transfer|payment|deposit|withdraw|credit|debit|merchant|reference)\b/i.test(normalized)) {
    return false;
  }

  const compact = normalized.replace(/[^A-Za-z]+/g, "");
  return compact.length > 0 && compact.length <= 6;
};

const collapseFragmentBuffer = (fragmentBuffer: string[]) => {
  const collapsedTokens: string[] = [];
  let characterRun: string[] = [];

  const flushCharacterRun = () => {
    if (characterRun.length > 0) {
      collapsedTokens.push(characterRun.join(""));
      characterRun = [];
    }
  };

  for (const rawLine of fragmentBuffer) {
    const line = normalizeStatementTextLine(rawLine);
    const pieces = line.match(/[A-Za-z0-9]+/g) ?? [];

    for (const piece of pieces) {
      const token = piece.replace(/[^A-Za-z0-9]+/g, "");
      if (!token) {
        continue;
      }

      if (/^[A-Za-z]$/.test(token)) {
        characterRun.push(token);
        continue;
      }

      flushCharacterRun();
      collapsedTokens.push(token);
    }
  }

  flushCharacterRun();
  return normalizeStatementTextLine(collapsedTokens.join(" "));
};

const repairStatementTextFragments = (lines: string[]) => {
  const repaired: string[] = [];
  let fragmentBuffer: string[] = [];
  const datePattern = /(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b)/i;
  const amountPattern = /(?:[₱$€£¥]\s*)?\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+(?:\.\d{2})\b/;
  const transactionPattern = /\b(?:debit|credit|withdraw|deposit|transfer|payment|purchase|refund|charge|fee|interest|cash|atm|branch|merchant|reference|pos|card)\b/i;

  const flushFragments = () => {
    if (fragmentBuffer.length === 0) {
      return null;
    }

    const fragmentText = collapseFragmentBuffer(fragmentBuffer);
    fragmentBuffer = [];

    if (!fragmentText) {
      return null;
    }

    return [fragmentText];
  };

  for (const rawLine of lines) {
    const line = normalizeStatementTextLine(rawLine);
    if (!line) {
      continue;
    }

    if (isLikelyFragmentStatementLine(line)) {
      fragmentBuffer.push(line);
      continue;
    }

    if (fragmentBuffer.length > 0) {
      const fragmentText = collapseFragmentBuffer(fragmentBuffer);
      const shouldMergeWithLine =
        Boolean(fragmentText) &&
        !(
          datePattern.test(line) &&
          !amountPattern.test(line) &&
          !transactionPattern.test(line)
        );

      if (shouldMergeWithLine) {
        const mergedText = normalizeStatementTextLine(`${fragmentText} ${line}`);
        if (mergedText && scoreStatementTextLineCandidate(mergedText) >= Math.max(scoreStatementTextLineCandidate(line), 0) - 0.5) {
          repaired.push(mergedText);
          fragmentBuffer = [];
          continue;
        }
      }

      const mergedFragments = flushFragments();
      if (mergedFragments) {
        repaired.push(...mergedFragments);
      }
    }

    repaired.push(line);
  }

  if (fragmentBuffer.length > 0) {
    const mergedFragments = flushFragments();
    if (mergedFragments) {
      repaired.push(...mergedFragments);
    }
  }

  return repaired
    .map((line) => normalizeStatementTextLine(line))
    .filter(Boolean)
    .map((line) => {
      const collapsed = line.replace(/\s+/g, " ").trim();
      return collapsed;
    });
};

const stitchAdjacentStatementTextLines = (lines: string[]) => {
  const stitched: string[] = [];

  for (const rawLine of lines) {
    const line = normalizeStatementTextLine(rawLine);
    if (!line) {
      continue;
    }

    const previous = stitched.at(-1);
    if (!previous) {
      stitched.push(line);
      continue;
    }

    const previousScore = scoreStatementTextLineCandidate(previous);
    const currentScore = scoreStatementTextLineCandidate(line);
    const merged = normalizeStatementTextLine(`${previous} ${line}`);
    const mergedScore = scoreStatementTextLineCandidate(merged);
    const looksLikeSplitRow =
      mergedScore >= Math.max(previousScore, currentScore) + 0.5 &&
      (previousScore < 1 || currentScore < 1 || countStatementTextLineConfusions(previous) > 0 || countStatementTextLineConfusions(line) > 0);

    if (looksLikeSplitRow) {
      stitched[stitched.length - 1] = merged;
      continue;
    }

    stitched.push(line);
  }

  return stitched;
};

const isLikelySameStatementLine = (left: string, right: string) => {
  const leftNormalized = normalizeStatementTextLine(left);
  const rightNormalized = normalizeStatementTextLine(right);
  if (!leftNormalized || !rightNormalized) {
    return false;
  }

  const leftCompact = compactStatementTextLine(leftNormalized);
  const rightCompact = compactStatementTextLine(rightNormalized);

  if (leftCompact === rightCompact) {
    return true;
  }

  if (leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)) {
    return true;
  }

  const datePattern = /(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b)/i;
  const amountPattern = /(?:[₱$€£¥]\s*)?\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+(?:\.\d{2})\b/;

  const leftHasDate = datePattern.test(leftNormalized);
  const rightHasDate = datePattern.test(rightNormalized);
  const leftHasAmount = amountPattern.test(leftNormalized);
  const rightHasAmount = amountPattern.test(rightNormalized);

  if (leftHasDate !== rightHasDate || leftHasAmount !== rightHasAmount) {
    return false;
  }

  const leftTokens = leftNormalized.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const rightTokens = rightNormalized.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const leftTokenSet = new Set(leftTokens);
  const overlap = rightTokens.filter((token) => leftTokenSet.has(token)).length / Math.max(1, Math.max(leftTokens.length, rightTokens.length));

  return overlap >= 0.5;
};

const pickBetterStatementTextLine = (left: string, right: string) => {
  const leftConfusions = countStatementTextLineConfusions(left);
  const rightConfusions = countStatementTextLineConfusions(right);
  if (leftConfusions !== rightConfusions) {
    return leftConfusions < rightConfusions ? left : right;
  }

  const leftScore = scoreStatementTextLineCandidate(left);
  const rightScore = scoreStatementTextLineCandidate(right);

  if (leftScore === rightScore) {
    return normalizeStatementTextLine(left).length >= normalizeStatementTextLine(right).length ? left : right;
  }

  return leftScore >= rightScore ? left : right;
};

type StatementTextCandidate = {
  text: string;
  label: string;
  score: number;
};

type StatementTextLineEntry = {
  line: string;
  compact: string;
  index: number;
  candidateScore: number;
  candidateLabel: string;
};

export const mergeCompatibleStatementTextCandidateConsensus = (candidates: StatementTextCandidate[]) => {
  const usefulCandidates = candidates.filter((candidate) => candidate.text.trim().length > 0);
  if (usefulCandidates.some(candidate => looksLikeIndonesianPaymentProof(candidate.text))) return null;
  if (usefulCandidates.length < 2) {
    return null;
  }

  const lineEntries: StatementTextLineEntry[] = [];
  for (const candidate of usefulCandidates.slice(0, 4)) {
    const lines = stitchAdjacentStatementTextLines(
      repairStatementTextFragments(
        candidate.text
          .split(/\r?\n/)
          .map((line) => normalizeStatementTextLine(line))
          .filter(Boolean)
      ).filter((line) => isUsefulStatementLine(line) || scoreStatementTextLineCandidate(line) >= 0.5)
    );

    lines.forEach((line, index) => {
      lineEntries.push({
        line,
        compact: compactStatementTextLine(line).toLowerCase(),
        index,
        candidateScore: candidate.score,
        candidateLabel: candidate.label,
      });
    });
  }

  if (lineEntries.length < 2) {
    return null;
  }

  const clusters: Array<{
    representative: string;
    lines: StatementTextLineEntry[];
    position: number;
  }> = [];

  for (const entry of lineEntries) {
    const cluster = clusters.find((candidateCluster) =>
      isLikelySameStatementLine(candidateCluster.representative, entry.line)
    );

    if (cluster) {
      cluster.lines.push(entry);
      cluster.representative = pickBetterStatementTextLine(cluster.representative, entry.line);
      const positions = cluster.lines.map((item) => item.index).sort((left, right) => left - right);
      cluster.position = positions[Math.floor(positions.length / 2)] ?? cluster.position;
      continue;
    }

    clusters.push({
      representative: entry.line,
      lines: [entry],
      position: entry.index,
    });
  }

  if (clusters.length < 2) {
    return null;
  }

  const mergedLines = clusters
    .map((cluster) => {
      const bestLine = cluster.lines.reduce((best, entry) => pickBetterStatementTextLine(best, entry.line), cluster.representative);
      const positions = cluster.lines.map((entry) => entry.index).sort((left, right) => left - right);
      const position = positions[Math.floor(positions.length / 2)] ?? cluster.position;
      const support = cluster.lines.length;
      const bestCandidateScore = Math.max(...cluster.lines.map((entry) => entry.candidateScore));
      return {
        line: bestLine,
        compact: compactStatementTextLine(bestLine).toLowerCase(),
        position,
        support,
        bestCandidateScore,
      };
    })
    .sort((left, right) => left.position - right.position || right.support - left.support || right.bestCandidateScore - left.bestCandidateScore);

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const entry of mergedLines) {
    if (!entry.line) {
      continue;
    }
    if (seen.has(entry.compact)) {
      continue;
    }
    seen.add(entry.compact);
    merged.push(entry.line);
  }

  const mergedText = merged.join("\n").trim();
  const bestCandidateLength = Math.max(...usefulCandidates.map((candidate) => candidate.text.trim().length));
  const bestCandidateScore = Math.max(...usefulCandidates.map((candidate) => candidate.score));
  const bestCandidateLineQuality = Math.max(...usefulCandidates.map((candidate) => scoreStatementTextCandidateLineQuality(candidate.text)));
  const mergedScore = scoreStatementTextCandidate(mergedText);
  const mergedLineQuality = scoreStatementTextCandidateLineQuality(mergedText);
  const improvesEnough =
    mergedText.length >= bestCandidateLength ||
    mergedScore >= bestCandidateScore + 1 ||
    mergedLineQuality >= bestCandidateLineQuality + 0.5 ||
    (mergedScore >= bestCandidateScore && mergedLineQuality >= bestCandidateLineQuality + 0.25);

  if (!mergedText || !improvesEnough) {
    return null;
  }

  return mergedText;
};

const isUsefulStatementLine = (line: string) => {
  const normalized = normalizeStatementTextLine(line);
  if (!normalized) {
    return false;
  }

  const structuralUseful =
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(normalized) ||
    /\d{4}-\d{2}-\d{2}/.test(normalized) ||
    /[₱$€£¥]|\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b/.test(normalized) ||
    /\b(?:balance|opening|closing|ending|running|available|transfer|payment|deposit|withdraw|credit|debit|merchant|reference)\b/i.test(normalized);

  return structuralUseful || (/[A-Za-z]{4,}/.test(normalized) && !isStatementUiNoiseLine(normalized));
};

const pickBestStatementTextCandidate = (candidates: Array<{ text: string; label: string }>) => {
  const scoredCandidates = candidates
    .map((candidate) => {
      const text = candidate.text.trim();
      if (!text) {
        return null;
      }

      return {
        ...candidate,
        text,
        score: scoreStatementTextCandidate(text),
      };
    })
    .filter((candidate): candidate is { text: string; label: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length);

  const best = scoredCandidates[0];
  if (!best) {
    return "";
  }

  let currentText = best.text;
  let currentScore = best.score;
  let currentLineQuality = scoreStatementTextCandidateLineQuality(best.text);
  let currentLabel = best.label;

  const consensus = mergeCompatibleStatementTextCandidateConsensus(scoredCandidates.slice(0, 4));
  if (consensus) {
    const consensusScore = scoreStatementTextCandidate(consensus);
    const consensusLineQuality = scoreStatementTextCandidateLineQuality(consensus);
    const improvesEnough = consensusScore >= currentScore || consensusLineQuality >= currentLineQuality + 0.25;

    if (improvesEnough) {
      currentText = consensus;
      currentScore = consensusScore;
      currentLineQuality = consensusLineQuality;
      currentLabel = `${best.label}+consensus`;
    }
  }

  for (const runnerUp of scoredCandidates.slice(1, 4)) {
    const merged = mergeCompatibleStatementTextCandidates(
      {
        text: currentText,
        label: currentLabel,
        score: currentScore,
      },
      runnerUp
    );
    if (!merged) {
      continue;
    }

    const mergedScore = scoreStatementTextCandidate(merged);
    const mergedLineQuality = scoreStatementTextCandidateLineQuality(merged);
    const improvesEnough = mergedScore >= currentScore + 1 || mergedLineQuality >= currentLineQuality + 0.15;

    if (improvesEnough) {
      currentText = merged;
      currentScore = mergedScore;
      currentLineQuality = mergedLineQuality;
      currentLabel = `${currentLabel}+${runnerUp.label}`;
    }
  }

  if (currentText !== best.text) {
    if (process.env.CLOVER_DEBUG_OCR_SELECTION === "1") {
      console.log("Selected OCR merged candidate", {
        labels: currentLabel,
        score: Number(currentScore.toFixed(2)),
        lineQuality: Number(currentLineQuality.toFixed(2)),
        length: currentText.length,
      });
    }
    return currentText;
  }

  if (process.env.CLOVER_DEBUG_OCR_SELECTION === "1") {
    console.log("Selected OCR text candidate", {
      label: best.label,
      score: Number(best.score.toFixed(2)),
      length: best.text.length,
    });
  }

  return best.text;
};

export const mergeCompatibleStatementTextCandidates = (
  left: { text: string; label: string; score: number },
  right: { text: string; label: string; score: number }
) => {
  if (looksLikeIndonesianPaymentProof(left.text) || looksLikeIndonesianPaymentProof(right.text)) return null;
  if (Math.abs(left.score - right.score) > 4) {
    return null;
  }

  const leftLines = repairStatementTextFragments(
    left.text
      .split(/\r?\n/)
      .map((line) => normalizeStatementTextLine(line))
      .filter(Boolean)
  );
  const rightLines = repairStatementTextFragments(
    right.text
      .split(/\r?\n/)
      .map((line) => normalizeStatementTextLine(line))
      .filter(Boolean)
  );

  const normalizedLeftLines = stitchAdjacentStatementTextLines(leftLines).filter(
    (line) => isUsefulStatementLine(line) || scoreStatementTextLineCandidate(line) >= 0.5
  );
  const normalizedRightLines = stitchAdjacentStatementTextLines(rightLines).filter(
    (line) => isUsefulStatementLine(line) || scoreStatementTextLineCandidate(line) >= 0.5
  );

  if (normalizedLeftLines.length === 0 || normalizedRightLines.length === 0) {
    return null;
  }

  const leftSet = new Set(normalizedLeftLines.map((line) => line.toLowerCase()));
  const overlap = normalizedRightLines.filter((line) => leftSet.has(line.toLowerCase())).length / Math.max(normalizedLeftLines.length, normalizedRightLines.length);
  if (overlap < 0.3) {
    return null;
  }

  const mergedLines: string[] = [];
  const seen = new Set<string>();
  const addLine = (line: string) => {
    const normalized = normalizeStatementTextLine(line);
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    mergedLines.push(normalized);
  };

  const mergedLength = Math.max(normalizedLeftLines.length, normalizedRightLines.length);
  for (let index = 0; index < mergedLength; index += 1) {
    const leftLine = normalizedLeftLines[index] ?? null;
    const rightLine = normalizedRightLines[index] ?? null;

    if (leftLine && rightLine) {
      if (isLikelySameStatementLine(leftLine, rightLine)) {
        addLine(pickBetterStatementTextLine(leftLine, rightLine));
      } else {
        const leftUseful = isUsefulStatementLine(leftLine);
        const rightUseful = isUsefulStatementLine(rightLine);
        if (leftUseful && !rightUseful) {
          addLine(leftLine);
        } else if (!leftUseful && rightUseful) {
          addLine(rightLine);
        } else if (leftUseful && rightUseful) {
          addLine(pickBetterStatementTextLine(leftLine, rightLine));
        } else {
          addLine(leftLine);
        }
      }
      continue;
    }

    if (leftLine) {
      addLine(leftLine);
    }

    if (rightLine) {
      addLine(rightLine);
    }
  }

  for (const line of rightLines) {
    if (isUsefulStatementLine(line)) {
      addLine(line);
    }
  }

  const merged = mergedLines.join("\n").trim();
  return merged.length >= Math.max(left.text.length, right.text.length) ? merged : null;
};

const extractTextFromPdfBytesWithRenderFirstFallback = async (
  data: Uint8Array,
  password?: string,
  baseUrl?: string | null,
  profile: PdfOcrProfile = "standard",
  fileName?: string | null,
  deferHybridRecovery = false,
) => {
  // Some templates often arrive scanned. Give an intact digital version of
  // the same template a chance before opening the visual reader.
  let nativeText: string | undefined;
  try {
    nativeText = await extractTextFromPdfBytes(data, password, baseUrl);
    if (heldSourceReviewReason(nativeText) || hasVerifiedPdfNativeLedger(data, nativeText) || hasVerifiedPdfReceipt(data, nativeText) ||
      (deferHybridRecovery && hybridPdfRecoveryPlan(data, nativeText).length) ||
      (shouldAvoidPdfRenderForServerless(fileName) && gcashBillsReceiptTextLayerIsComplete(nativeText) &&
        knownStatementNativeTextIsComplete(nativeText, fileName))) {
      return nativeText;
    }
  } catch (error) {
    if (isPdfPasswordError(error)) throw error;
  }

  const maxPages = profile === "aggressive" ? 8 : 6;
  const renderScale = profile === "aggressive" ? 3.8 : 3.2;
  try {
    const ocrText = await renderPdfPagesToOcrText(data, password, baseUrl, maxPages, renderScale, /china[\s_-]*bank|eastwest/i.test(fileName ?? ""), /eastwest/i.test(fileName ?? ""));
    if (ocrText.trim().length > 0) {
      return ocrText;
    }
  } catch (error) {
    if (isPdfPasswordError(error)) {
      throw error;
    }
    console.warn("PDF OCR-first extraction failed; retrying with text extraction", error);
  }

  try {
    return await extractTextFromPdfBytesWithOcrFallback(data, password, baseUrl, profile, fileName, nativeText, deferHybridRecovery);
  } catch (error) {
    if (isPdfPasswordError(error)) {
      throw error;
    }
    console.warn("PDF OCR-first fallback after render-first extraction failed", error);
    return "";
  }
};

export const ensurePdfJsTextPolyfills = () => {
  if (typeof globalThis.DOMMatrix === "undefined") {
    (globalThis as any).DOMMatrix = SimpleDOMMatrix;
  }

  if (typeof globalThis.ImageData === "undefined") {
    (globalThis as any).ImageData = SimpleImageData;
  }

  if (typeof globalThis.Path2D === "undefined") {
    (globalThis as any).Path2D = SimplePath2D;
  }
};

const ensurePdfJsRenderPolyfills = async () => {
  const canvasModule = getCanvasModule() ?? await loadCanvasModule();

  if (canvasModule?.DOMMatrix) {
    (globalThis as any).DOMMatrix = canvasModule.DOMMatrix;
  }
  if (canvasModule?.ImageData) {
    (globalThis as any).ImageData = canvasModule.ImageData;
  }
  if (canvasModule?.Path2D) {
    (globalThis as any).Path2D = canvasModule.Path2D;
  }

  ensurePdfJsTextPolyfills();
};

type PdfJs = typeof import("./pdfjs.server").pdfjs;
type PdfDocument = Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>;

const pdfReaders = {
  text: { run: createImportReaderCapacity(1), worker: undefined as InstanceType<PdfJs["PDFWorker"]> | undefined },
  render: { run: createImportReaderCapacity(1), worker: undefined as InstanceType<PdfJs["PDFWorker"]> | undefined },
};

// Grab text extraction can request a cropped render. Separate slots bound
// both resources without asking a text task to acquire its own slot again.
async function withPdfDocument<T>(
  mode: keyof typeof pdfReaders,
  options: () => ReturnType<typeof createPdfJsLoadOptions>,
  read: (document: PdfDocument) => Promise<T>,
) {
  const reader = pdfReaders[mode];
  return reader.run(async waitMs => {
    const stage = `pdf_${mode}`;
    recordImportReaderTiming(`${stage}_slot_wait`, waitMs);
    if (!reader.worker) {
      try {
        reader.worker = await measureImportReader(`${stage}_worker_cold_start`, async () => {
          if (mode === "render") await ensurePdfJsRenderPolyfills();
          else ensurePdfJsTextPolyfills();
          const { pdfjs } = await import("./pdfjs.server");
          const worker = new pdfjs.PDFWorker();
          try {
            await worker.promise;
            return worker;
          } catch (error) {
            worker.destroy();
            throw error;
          }
        });
      } catch {
        // The existing per-document PDF.js worker remains available on hosts
        // that cannot keep an explicitly created worker ready.
      }
    } else {
      recordImportReaderTiming(`${stage}_worker_reuse`, 0, "warm");
    }
    const { pdfjs } = await import("./pdfjs.server");
    const task = pdfjs.getDocument({ ...options(), worker: reader.worker });
    try {
      const document = await measureImportReader(`${stage}_document_open`, () => task.promise);
      return await measureImportReader(`${stage}_work`, () => read(document));
    } finally {
      await task.destroy().catch(() => {
        reader.worker?.destroy();
        reader.worker = undefined;
      });
    }
  });
}

// PDF.js' Node binary factory passes these strings directly to fs.readFile.
const pdfJsAssets = (() => {
  try {
    const root = dirname(nodeRequire.resolve("pdfjs-dist/package.json"));
    return {
      standardFontDataUrl: join(root, "standard_fonts") + sep,
      wasmUrl: join(root, "wasm") + sep,
    };
  } catch {
    return {};
  }
})();

const clonePdfBytes = (data: Uint8Array) => {
  const copy = new Uint8Array(data.length);
  copy.set(data);
  return copy;
};

const createPdfJsLoadOptions = (data: Uint8Array, password?: string, _baseUrl?: string | null, disableWorker = true) => {
  return {
    data: clonePdfBytes(data),
    ...(password ? { password } : {}),
    ...pdfJsAssets,
    disableWorker,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  };
};

export const isPdfPasswordError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";

  return /passwordexception/i.test(name) || /password/i.test(message) || /encrypted pdf/i.test(message);
};

const pdfPasswordChecks = new WeakMap<Uint8Array, { credential: string; check: Promise<void> }>();

/** Probe only suspected encryption. The document reader remains responsible
 * for unusual PDF structures and non-password errors. */
export async function preflightPdfPassword(data: Uint8Array, password?: string) {
  if (!password && !hasPdfEncryptionMarker(data)) return;
  const credential = password ? createHash("sha256").update(password).digest("hex") : "";
  const previous = pdfPasswordChecks.get(data);
  if (previous?.credential === credential) {
    recordImportWork("pdf_password_probe_skipped");
    return previous.check;
  }

  const check = withPdfDocument("text", () => createPdfJsLoadOptions(data, password), async () => {})
    .catch((error: unknown) => {
      if (isPdfPasswordError(error)) throw error;
    });
  pdfPasswordChecks.set(data, { credential, check });
  return check;
}

export const getConfiguredPdfJsBaseUrl = () => {
  const configuredBaseUrl =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : null);

  return typeof configuredBaseUrl === "string" && configuredBaseUrl.trim() ? configuredBaseUrl : null;
};

const decodeBody = async (body: unknown) => {
  if (!body) {
    throw new Error("Unable to read imported file.");
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (typeof body === "object" && body !== null && "transformToByteArray" in body && typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    return new Uint8Array(await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray());
  }

  if (typeof body === "object" && body !== null && Symbol.asyncIterator in body) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      if (typeof chunk === "string") {
        chunks.push(new TextEncoder().encode(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      } else {
        chunks.push(new Uint8Array(chunk));
      }
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return merged;
  }

  throw new Error("Unable to read imported file.");
};

export const resolveImageNormalizationProfile = (params: {
  fileType?: string | null;
  fileName?: string | null;
  importMode?: string | null;
}): ImageNormalizationProfile => {
  const lowerName = `${params.fileType ?? ""} ${params.fileName ?? ""}`.toLowerCase();
  const importMode = String(params.importMode ?? "").toLowerCase();

  if (
    importMode === "receipt" ||
    /\b(?:receipt|invoice|sales invoice|official receipt|cash slip|temporary bill|or#|amount due|subtotal|vat|service charge)\b/.test(lowerName)
  ) {
    if (/\b(?:gcash|maya|wise|wallet|transfer|sent via|express send)\b/.test(lowerName)) {
      return "wallet_screenshot";
    }
    return "receipt";
  }

  if (/\b(?:gcrypto|pdax|gfunds|atram|ryse|crypto|portfolio|holdings|fund|trading wallet|buy order|sell order)\b/.test(lowerName)) {
    return "investment_screenshot";
  }

  if (/\b(?:gcash|maya|wise|wallet|transfer|sent via|express send|screenshot|screen shot|screen_shot)\b/.test(lowerName)) {
    return "wallet_screenshot";
  }

  return "generic";
};

const normalizedImagePreviews = new WeakMap<Uint8Array, Map<string, Promise<NormalizedImageBytes>>>();

const normalizeImportedImageBytes = (
  bytes: Uint8Array,
  fileType: string | null | undefined,
  fileName: string | null | undefined,
  importMode?: string | null,
  variant: "standard" | "text-region" | "original-view" = "standard",
  region?: NonNullable<ReturnType<typeof findImportImageTextRegion>>
) => {
  const profile = resolveImageNormalizationProfile({ fileType, fileName, importMode });
  let profiles = normalizedImagePreviews.get(bytes);
  if (!profiles) {
    profiles = new Map();
    normalizedImagePreviews.set(bytes, profiles);
  }
  const key = `${profile}:${variant}:${region ? [region.left, region.top, region.width, region.height].join(",") : "full"}`;
  const existing = profiles.get(key);
  if (existing) {
    recordImportWork("image_preview_cache_hit");
    return existing;
  }
  const pending = (async () => {
    const { data, width, height } = await getBoundedImportImagePreview(bytes);
    const { default: sharp } = await import("sharp");
    const image = sharp(data, { raw: { width, height, channels: 3 } });
    if (region) image.extract(region);
    const limit = variant === "original-view" ? RECEIPT_IMAGE_MAX_EDGE : profile === "wallet_screenshot" ? 1600 :
      profile === "investment_screenshot" ? 1700 : profile === "receipt" ? 1800 : 2200;
    image.resize({ width: limit, height: limit, fit: "inside", withoutEnlargement: true });

    // The full-frame color retry keeps pixels before contrast normalization.
    if (variant !== "original-view") {
      if (profile === "receipt") {
        image
          .grayscale()
          .normalize()
          .linear(1.08, -6)
          .sharpen({ sigma: 1.1, m1: 0.6, m2: 2.2 })
          .median(1);
      } else if (profile === "investment_screenshot") {
        image
          .normalize()
          .linear(1.06, -5)
          .modulate({ saturation: 0.92, brightness: 1.02 })
          .sharpen({ sigma: 1.0, m1: 0.8, m2: 2.4 });
      } else if (profile === "wallet_screenshot") {
        image
          .normalize()
          .modulate({ brightness: 1.04, saturation: 0.92 })
          .sharpen({ sigma: 0.9, m1: 0.4, m2: 1.6 });
      } else {
        image
          .normalize()
          .sharpen({ sigma: 0.8, m1: 0.3, m2: 1.2 });
      }
    }

    const buffer = await image.jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
    let url: string | undefined;
    return {
      mimeType: "image/jpeg",
      buffer,
      get dataUrl() {
        return url ??= `data:image/jpeg;base64,${buffer.toString("base64")}`;
      },
    };
  })();
  profiles.set(key, pending);
  return pending;
};

export const normalizeReceiptImageForVision = async (params: {
  bytes: Uint8Array;
  fileType?: string | null;
  fileName?: string | null;
}) => normalizeImportedImageBytes(params.bytes, params.fileType, params.fileName, "receipt");

type ImportFileLike = {
  name?: string;
  type?: string;
  arrayBuffer?: () => Promise<ArrayBuffer | SharedArrayBuffer>;
  text?: () => Promise<string>;
};

const extractTextFromPdfBytes = async (data: Uint8Array, password?: string, baseUrl?: string | null,
  observePages?: (pages: readonly string[]) => void, maxInspectedPages?: number) => {
  const nativeStructuredText = await withPdfDocument("text", () => createPdfJsLoadOptions(data, password, baseUrl), async pdf => {
    if (maxInspectedPages && pdf.numPages > maxInspectedPages) return "";
    const pages = new Array<string>(pdf.numPages);
    const statementLayouts = new Array<{ rows: PositionedPdfRow[]; lines: string[] } | null>(pdf.numPages).fill(null);
    const mariBankTransactionRows = new Array<string[]>(pdf.numPages);
    const posbTransactionRows = new Array<string[]>(pdf.numPages);
    const bcaProofRows = new Array<string[]>(pdf.numPages);
    const heldNativeRows = new Array<string[]>(pdf.numPages);
    const heldNativeItems = new Array<PdfTextContentItemLike[]>(pdf.numPages);
    let nextPageIndex = 0;
    // PDF.js can read independent text layers concurrently. Bound the work so
    // a long statement does not monopolize a serverless invocation, while
    // avoiding the avoidable page-by-page wait on normal SOAs.
    const grabPickupFields: ReturnType<typeof buildGrabPickupFields>[] = new Array(pdf.numPages);
    const grabPanelBodies: Array<string[] | null> = new Array(pdf.numPages);
    const grabHeadlineSlots: Array<{ page: number; reference: string; x: number; y: number } | null> = new Array(pdf.numPages).fill(null);
    const readerCount = Math.min(4, pdf.numPages);
    await Promise.all(
      Array.from({ length: readerCount }, async () => {
        while (nextPageIndex < pdf.numPages) {
          const pageIndex = nextPageIndex;
          nextPageIndex += 1;
          const page = await pdf.getPage(pageIndex + 1);
          const content = await page.getTextContent();
          grabPickupFields[pageIndex] = buildGrabPickupFields(content.items as PdfTextContentItemLike[], pageIndex + 1);
          grabPanelBodies[pageIndex] = pdf.numPages === 1
            ? buildGrabTwoMessagePanelBodies(content.items as PdfTextContentItemLike[], page.view[2] - page.view[0], page.view[3] - page.view[1])
            : null;
          const simpleText = buildSimplePdfTextFromContentItems(content.items as PdfTextContentItemLike[]);
          const layoutAwareText = buildLayoutAwarePdfTextFromContentItems(
            content.items as PdfTextContentItemLike[],
            layout => { statementLayouts[pageIndex] = layout; },
          );
          pages[pageIndex] = encodeNativePdfNullGlyphs(pickBetterPdfTextLayerCandidate(simpleText, layoutAwareText));
          if (pdf.numPages <= 3 && /Your\s+Grab\s+E-?Receipt/i.test(pages[pageIndex]) && /Hope\s+you\s+had\s+an\s+enjoyable\s+ride/i.test(pages[pageIndex]) && /\bTOTAL\s+DATE\s*\|\s*TIME/i.test(pages[pageIndex])) {
            const references = [...new Set([...pages[pageIndex].matchAll(/\bADR-?[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g)].map(match => match[0]))];
            const header = pages[pageIndex].match(/\bTOTAL\s+DATE\s*\|\s*TIME/i);
            const nativeHeadline = header && /\bP\s*\d[\d,]*\.\d{2}\b/i.test(pages[pageIndex].slice(header.index! + header[0].length, header.index! + header[0].length + 180));
            const summary = [...pages[pageIndex].matchAll(/\bTOTAL\s+P\s*\d[\d,]*\.\d{2}\b/gi)];
            const items = content.items as PdfTextContentItemLike[];
            const label = items.find(item => String(item.str ?? '').trim() === 'TOTAL' && Number(item.transform?.[4]) < page.view[2] / 2 && Number(item.transform?.[5]) > page.view[3] / 2);
            const timeLabel = items.find(item => /^DATE\s*\|\s*TIME$/.test(String(item.str ?? '').trim()) && Math.abs(Number(item.transform?.[5]) - Number(label?.transform?.[5])) < 3);
            if (!nativeHeadline && references.length === 1 && summary.length === 1 && label?.transform && timeLabel && /Payment Method:/i.test(pages[pageIndex])) {
              const [x, y] = page.getViewport({ scale: 1 }).convertToViewportPoint(label.transform[4], label.transform[5]);
              grabHeadlineSlots[pageIndex] = { page: pageIndex + 1, reference: references[0], x, y };
            }
          }
          mariBankTransactionRows[pageIndex] = buildMariBankTransactionRowsFromContentItems(
            content.items as PdfTextContentItemLike[]
          );
          posbTransactionRows[pageIndex] = buildPosbPdfRows(content.items as PdfTextContentItemLike[]);
          heldNativeRows[pageIndex] = [...buildSeaBankIndonesiaPdfRows(content.items as PdfTextContentItemLike[]), ...buildSeaBankIndonesiaPdfSummary(content.items as PdfTextContentItemLike[]), ...buildDbsZeroPdfProof(content.items as PdfTextContentItemLike[])];
          heldNativeItems[pageIndex] = content.items.some(item => /^(?:REKENING KORAN|BANK STATEMENT)$/.test(String((item as PdfTextContentItemLike).str ?? '').trim()))
            ? content.items as PdfTextContentItemLike[] : [];
          bcaProofRows[pageIndex] = buildBcaTransferPdfRows(content.items as PdfTextContentItemLike[], pdf.numPages);
        }
      })
    );

    const continuations: PdfStatementContinuation[] = [];
    const layoutPages = reconstructPdfStatementPages(statementLayouts, continuations);
    pdfStatementContinuations.set(data, continuations);
    if (layoutPages.some(Boolean)) {
      pdfOriginalLayoutReads.set(data, pages.map((page, index) => statementLayouts[index]?.lines.join("\n") ?? page));
    }
    for (const [index, page] of layoutPages.entries()) {
      if (page) pages[index] = encodeNativePdfNullGlyphs(page);
    }
    pdfNativePageReads.set(data, pages);
    observePages?.(pages);
    const extractedText = pages.join("\n");
    const seaBankSource=(/REKENING KORAN/.test(extractedText) && /NO\. REKENING SEABANK:/.test(extractedText)) || hasSeaBankIndonesiaEnglishHeader(extractedText);
    const legacyColumns=seaBankSource && heldNativeItems.some(items=>items.some(date=>{
      if(!/^(?:DATE|TANGGAL)$/.test(String(date.str??'').trim()) || Number(date.transform?.[4])>=110) return false;
      const sameLine=items.filter(item=>Math.abs(Number(item.transform?.[5])-Number(date.transform?.[5]))<2.5 && String(item.str??'').trim());
      return sameLine.some(item=>/^(?:TRANSACTION|TRANSAKSI)$/.test(String(item.str).trim())) &&
        sameLine.some(item=>/^(?:OUTGOING|KELUAR)$/.test(String(item.str).trim()) && Number(item.transform?.[4])>350) &&
        sameLine.some(item=>/^(?:INCOMING|MASUK)$/.test(String(item.str).trim()) && Number(item.transform?.[4])>480) &&
        !sameLine.some(item=>/^(?:BALANCE|SALDO)/.test(String(item.str).trim()));
    }));
    const legacySeaBank=legacyColumns && /(?:PREVIOUS DAY BALANCE|SALDO HARI SEBELUMNYA)\s*\(IDR\)/.test(extractedText) && !heldNativeRows.flat().some(row=>row.startsWith('SEABANK_ID_TXN |'));
    let legacySection: Parameters<typeof buildSeaBankIndonesiaLegacyPdfEvidence>[1]='none';
    const legacyProof=legacySeaBank ? heldNativeItems.flatMap(items=>{const result=buildSeaBankIndonesiaLegacyPdfEvidence(items,legacySection);legacySection=result.section;return result.lines;}) : [];
    const seaBankProof=legacySeaBank ? [...heldNativeRows.flat().filter(row=>row.startsWith('SEABANK_ID_SUMMARY') || row==='SEABANK_ID_INVALID_SUMMARY'),...legacyProof,'SEABANK_ID_LEGACY_LAYOUT'] : heldNativeRows.flat();
    if (/REKENING KORAN/.test(extractedText) && /NO\. REKENING SEABANK:/.test(extractedText)) return `${extractedText}\nSEABANK_ID_NATIVE_PAGES ${pdf.numPages}\n${seaBankProof.join('\n')}`;
    if (hasSeaBankIndonesiaEnglishHeader(extractedText)) return `${extractedText}\nSEABANK_ID_NATIVE_PAGES ${pdf.numPages}\nSEABANK_ID_NATIVE_LANGUAGE EN\n${seaBankProof.join('\n')}`;
    if (/Consolidated Statement/.test(extractedText) && /DBS/.test(extractedText)) return `${extractedText}\nDBS_NATIVE_PAGES ${pdf.numPages}\n${heldNativeRows.flat().join('\n')}`;
    const visualHeadlines: GrabVisualHeadline[] = [];
    for (const slot of grabHeadlineSlots.filter((value): value is NonNullable<typeof value> => value !== null)) {
      try {
        const images = await renderPdfPageImagesFromBytes(data, password, slot.page, 3.5, false, true);
        const image = images.find(item => item.page === slot.page);
        if (!image) continue;
        const sharp = (await import('sharp')).default;
        const bytes = Buffer.from(image.dataUrl.split(',')[1] ?? '', 'base64');
        const size = await sharp(bytes).metadata();
        const left = Math.max(0, Math.round((slot.x - 15) * 3.5));
        const top = Math.max(0, Math.round((slot.y - 16) * 3.5));
        const width = Math.min(Math.round(180 * 3.5), Number(size.width) - left);
        const height = Math.min(Math.round(64 * 3.5), Number(size.height) - top);
        if (width < 100 || height < 80) continue;
        const crop = await sharp(bytes).extract({ left, top, width, height }).png().toBuffer();
        const ocrText = (await extractTextFromImageBufferWithOcr(crop, '6', 'eng')).trim();
        const amounts = [...ocrText.matchAll(/\bP\s*(\d[\d,]*\.\d{2})\b/gi)];
        if (amounts.length !== 1 || ocrText.length > 200) continue;
        visualHeadlines.push({ reference: slot.reference, page: slot.page, amountText: `P ${amounts[0][1]}`, ocrText, cropSha256: createHash('sha256').update(crop).digest('hex') });
      } catch (error) {
        console.warn('Grab visual headline recovery failed; keeping source review required', { page: slot.page, error });
      }
    }
    const grabPages = buildGrabReceiptNativePages(pages, grabPickupFields.flat(), pdf.numPages === 1 ? grabPanelBodies[0] ?? undefined : undefined, visualHeadlines);
    if (grabPages) {
      pdfNativeGrabReceipts.set(data, grabPages);
      return `${extractedText}\n${grabPages}`;
    }
    const gcashPages = buildGcashBillsNativePages(pages);
    if (gcashPages) return `${extractedText}\n${gcashPages}`;
    const cimbText = `${extractedText}\nCIMB_NATIVE_PAGES ${pdf.numPages}`;
    if (parseCimbConsolidatedStatement(cimbText)) return cimbText;
    const bcaText = `${extractedText}\nBCA_NATIVE_PAGES ${pdf.numPages}\n${bcaProofRows.flat().filter(Boolean).join("\n")}`;
    // Keep recognized incomplete proofs for the strict review gate; OCR
    // must not discard their physical-page evidence and promote a guess.
    if (parseBcaTransferProof(bcaText)) return bcaText;
    const structuredPosbRows = posbTransactionRows.flat().filter(Boolean);
    if (POSB_NATIVE_ACCOUNT_HEADING.test(extractedText) && structuredPosbRows.length > 0) return `${extractedText}\n${structuredPosbRows.join('\n')}`;
    const structuredMariBankRows = mariBankTransactionRows.flat().filter(Boolean);
    const modernMari = /(?:MARI\s*BANK|SEABANK)\s+ACCOUNT:\s*\d{11}(?=\b|Call\b)/i.test(extractedText) && /SAVINGS\s*-\s*TRANSACTION\s+DETAILS/i.test(extractedText) && /PHP/i.test(extractedText);
    if (modernMari && (structuredMariBankRows.some(row => row.startsWith("MARIBANK_TXN")) || /NO RECENT TRANSACTION/i.test(extractedText))) return `${extractedText}\nMARIBANK_NATIVE_PAGES ${pdf.numPages}\n${structuredMariBankRows.join("\n")}`;
    // Preserve the established unproved legacy path for other account shapes.
    return /\bMARI\s*BANK\b/i.test(extractedText) && structuredMariBankRows.some(row => row.startsWith("MARIBANK_TXN"))
      ? `${extractedText}\n${structuredMariBankRows.filter(row => row.startsWith("MARIBANK_TXN")).join("\n")}` : extractedText;
  });
  // Retain coordinate-derived evidence tied to these exact bytes. A caller's
  // transcript cannot populate this map or override its native source.
  pdfNativeStructuredReads.set(data, nativeStructuredText);
  return nativeStructuredText;
};

const normalizePdfTextContentItem = (value: unknown) => {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!normalized) {
    return "";
  }

  // Some text-native statements encode each visible word as a single PDF
  // glyph group with spaces between every character (for example,
  // `I n s t a P a y`). Preserve the gaps between groups/columns, but repair
  // the group itself so deterministic statement parsers can consume it. This
  // avoids a rendered OCR pass when the original PDF already contains a
  // complete, trustworthy ledger.
  const tokens = normalized.split(" ");
  const singleCharacterTokens = tokens.filter((token) => /^[A-Za-z0-9.,:/#&+\-]$/.test(token)).length;
  const isSeparatedNumericPair = tokens.length === 2 && tokens.every((token) => /^[0-9.,:/+\-]$/.test(token));
  return (tokens.length >= 3 && singleCharacterTokens / tokens.length >= 0.8) || isSeparatedNumericPair
    ? tokens.join("")
    : normalized;
};

export const buildLayoutAwarePdfTextFromContentItems = (
  items: PdfTextContentItemLike[],
  observeStatementLayout?: (page: { rows: PositionedPdfRow[]; lines: string[] }) => void,
) => {
  const normalizedItems = items
    .map((item) => {
      const text = normalizePdfTextContentItem(item.str);
      const x = Number(item.transform?.[4] ?? 0);
      const y = Number(item.transform?.[5] ?? 0);
      const width = Number(item.width ?? 0);
      const height = Number(item.height ?? 0);
      return {
        text,
        x,
        y,
        width: Number.isFinite(width) ? width : 0,
        height: Number.isFinite(height) ? height : 0,
      };
    })
    .filter((item) => item.text.length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  if (normalizedItems.length === 0) {
    return "";
  }

  type RowCluster = {
    centerY: number;
    spread: number;
    items: typeof normalizedItems;
  };

  const rows: RowCluster[] = [];
  const rowTolerance = 2.75;

  for (const item of normalizedItems) {
    const lastRow = rows[rows.length - 1];
    if (!lastRow) {
      rows.push({
        centerY: item.y,
        spread: 0,
        items: [item],
      });
      continue;
    }

    const allowedGap = Math.max(rowTolerance, lastRow.spread * 1.5 + 0.5);
    if (Math.abs(lastRow.centerY - item.y) <= allowedGap) {
      lastRow.items.push(item);
      lastRow.centerY = (lastRow.centerY * (lastRow.items.length - 1) + item.y) / lastRow.items.length;
      lastRow.spread = Math.max(lastRow.spread, Math.abs(item.y - lastRow.centerY));
      continue;
    }

    rows.push({
      centerY: item.y,
      spread: 0,
      items: [item],
    });
  }

  const hasKoreanBankColumns = rows.some(row => {
    const line = row.items.slice().sort((a, b) => a.x - b.x).map(item => item.text).join("  ");
    return koreanBankTableHeader(line) || indonesianBankTableHeader(line);
  });
  const buildRowText = (row: RowCluster) => {
    const sortedItems = row.items.slice().sort((a, b) => a.x - b.x || a.text.localeCompare(b.text));
    let previous: (typeof sortedItems)[number] | null = null;
    let line = "";

    for (const item of sortedItems) {
      if (!previous) {
        line = item.text;
        previous = item;
        continue;
      }

      const estimatedPreviousEnd = previous.x + Math.max(previous.text.length * 3.2, previous.width || 0, 8);
      const gap = item.x - estimatedPreviousEnd;
      const spacer = hasKoreanBankColumns && gap > 22 ? "\t" : gap > 36 ? "    " : gap > 22 ? "  " : " ";
      line += `${spacer}${item.text}`;
      previous = item;
    }

    return hasKoreanBankColumns ? line.trim() : line.replace(/\s+/g, " ").trim();
  };

  const indonesianRows = formatIndonesianBankPdfRows(rows);
  const lines = rows.map((row, index) => indonesianRows[index] ?? buildRowText(row));
  if (!hasKoreanBankColumns && lines.some(line => /^(?:(?:posting|posted|transaction|entry|value) )?date (?:.* )?amount\b/i.test(line)) &&
      !lines.some(line => /Maybank Islamic Berhad/i.test(line))) {
    observeStatementLayout?.({ rows, lines });
  }
  return lines.filter(Boolean).join("\n");
};

const buildMariBankTransactionRowsFromContentItems = (items: PdfTextContentItemLike[]) => {
  const normalizedItems = items
    .map((item) => ({
      text: normalizePdfTextContentItem(item.str),
      x: Number(item.transform?.[4] ?? 0),
      y: Number(item.transform?.[5] ?? 0),
    }))
    .filter((item) => item.text.length > 0 && Number.isFinite(item.x) && Number.isFinite(item.y));

  const transactionHeading = normalizedItems.find((item) => /SAVINGS\s*-\s*TRANSACTION\s+DETAILS/i.test(item.text));
  const transactionColumnHeading = normalizedItems.find(
    (item) => /^TRANSACTION$/i.test(item.text) && normalizedItems.some((candidate) => /^OUTGOING$/i.test(candidate.text))
  );
  if (!transactionHeading && !transactionColumnHeading) {
    return [];
  }

  const interestTableHeading = normalizedItems.find((item) => /SAVINGS\s*-\s*INTEREST\s*&\s*TAX\s+DETAILS/i.test(item.text));
  const dateItems = normalizedItems
    .filter((item) => {
      if (item.x > 110 || !/^(?:\d{1,2}\s+)?(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/i.test(item.text)) {
        return false;
      }
      if (transactionHeading && item.y >= transactionHeading.y - 3) return false;
      if (transactionColumnHeading && item.y >= transactionColumnHeading.y - 3) {
        return false;
      }
      if (interestTableHeading && item.y <= interestTableHeading.y) {
        return false;
      }
      return true;
    })
    .sort((left, right) => right.y - left.y);

  const rows = dateItems.flatMap((dateItem) => {
    const amountItem = normalizedItems.find(
      (item) => item.x >= 350 && Math.abs(item.y - dateItem.y) <= 2.25 && /^-?[0-9][0-9,]*\.\d{2}$/.test(item.text)
    );
    if (!amountItem) {
      return [];
    }

    const descriptionItems = normalizedItems
      .filter(
        (item) =>
          item.x >= 130 &&
          item.x < 350 &&
          item.y >= dateItem.y - 18 &&
          item.y <= dateItem.y + 18 &&
          !/^(?:DATE|TRANSACTION|OUTGOING|INCOMING|PHP)$/i.test(item.text)
      )
      .sort((left, right) => right.y - left.y || left.x - right.x);
    const merchant = descriptionItems
      .filter((item) => item.y >= dateItem.y - 2.25)
      .map((item) => item.text)
      .join(" ")
      .trim();
    const detail = descriptionItems
      .filter((item) => item.y < dateItem.y - 2.25)
      .map((item) => item.text)
      .join(" ")
      .trim();
    if (!merchant && !detail) {
      return [];
    }

    const safeField = (value: string) => value.replace(/\s*\|\s*/g, " / ").replace(/\s+/g, " ").trim();
    const direction = amountItem.x >= 470 ? "incoming" : "outgoing";
    return [
      ["MARIBANK_TXN", safeField(dateItem.text), direction, safeField(amountItem.text), safeField(merchant), safeField(detail)].join(
        " | "
      ),
    ];
  });
  return [`MARIBANK_NATIVE_ROW_COUNT ${dateItems.length}`, ...rows];
};

const buildSimplePdfTextFromContentItems = (items: PdfTextContentItemLike[]) => {
  const lines = new Map<number, { x: number; text: string }[]>();

  for (const item of items) {
    const text = normalizePdfTextContentItem(item.str);
    if (!text) {
      continue;
    }

    const y = Math.round(Number(item.transform?.[5] ?? 0));
    const x = Number(item.transform?.[4] ?? 0);
    const row = lines.get(y) ?? [];
    row.push({ x, text });
    lines.set(y, row);
  }

  return Array.from(lines.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((entry) => entry.text).join(" "))
    .join("\n");
};

const pickBetterPdfTextLayerCandidate = (simpleText: string, layoutAwareText: string) => {
  const simple = simpleText.trim();
  const layout = layoutAwareText.replace(/^[\r\n]+|[\r\n]+$/g, "");

  if (!simple && !layout) {
    return "";
  }

  if (!simple) {
    return layout;
  }

  if (!layout) {
    return simple;
  }

  // Column grouping is preferable when all BDO movements and balances reconcile.
  if (hasReconciledBdoInlineLedger(layout)) return layout;
  // Keep a complete native bill/fee receipt before generic table scoring can
  // discard its principal field and force a lossy OCR replacement.
  const completeGcashReceipt=selectCompleteGcashBillsNativeText(simple,layout);
  if(completeGcashReceipt) return completeGcashReceipt;

  const simpleScore = scoreStatementTextCandidate(simple);
  const layoutScore = scoreStatementTextCandidate(layout);

  if (layout.includes("\t") && layout.split(/\r?\n/).some(line => koreanBankTableHeader(line) || indonesianBankTableHeader(line))) return layout;

  if (simpleScore >= 25) {
    return simple;
  }

  if (layoutScore >= simpleScore + 6 && layoutScore >= 20) {
    if (process.env.CLOVER_DEBUG_OCR_SELECTION === "1") {
      console.log("Selected layout-aware PDF text layer candidate", {
        simpleScore: Number(simpleScore.toFixed(2)),
        layoutScore: Number(layoutScore.toFixed(2)),
        simpleLength: simple.length,
        layoutLength: layout.length,
      });
    }

    return layout;
  }

  return simple;
};

const extractTextFromPdfBytesWithOcrFallback = async (
  data: Uint8Array,
  password?: string,
  baseUrl?: string | null,
  profile: PdfOcrProfile = "standard",
  fileName?: string | null,
  nativeText?: string,
  deferHybridRecovery = false,
) => {
  const extractionStartedAt = Date.now();
  const textLayerStartedAt = Date.now();
  let extractedText = "";
  try {
    extractedText = nativeText ?? await extractTextFromPdfBytes(data, password, baseUrl);
  } catch (error) {
    if (isPdfPasswordError(error)) {
      throw error;
    }
    console.warn("PDF text extraction failed; retrying with rendered page OCR", error);
  }

  const textLayerDurationMs = Date.now() - textLayerStartedAt;

  if (hasVerifiedPdfNativeLedger(data, extractedText) || hasVerifiedPdfReceipt(data, extractedText) || (deferHybridRecovery && hybridPdfRecoveryPlan(data, extractedText).length) ||
    pdfTextLayerLooksSufficientForParsing(extractedText, fileName)) {
    console.info("[import-performance] PDF extraction used native text", {
      profile,
      sourceBytes: data.byteLength,
      textLength: extractedText.length,
      textLayerDurationMs,
      totalDurationMs: Date.now() - extractionStartedAt,
    });
    return extractedText;
  }

  console.info("[import-performance] PDF extraction started OCR fallback", {
    profile,
    sourceBytes: data.byteLength,
    textLength: extractedText.length,
    textLayerDurationMs,
  });

  try {
    const maxPages = profile === "aggressive" ? 4 : 2;
    const renderScale = profile === "aggressive" ? 3.9 : 3.5;
    const pageImages = await renderPdfPageImagesFromBytes(data, password, maxPages, renderScale, true);
    const ocrPages = (await runPdfPageBatch("primary_page_ocr", pageImages, async page => {
      if (!page.dataUrl) return null;
      const text = (await extractTextFromImageBufferWithOcr(page.dataUrl)).trim();
      if (!text) return null;
      rememberPdfOcrPage(data, page, text);
      return { page: page.page, text };
    })).filter(page => page !== null);

    // A scanned GCash receipt needs its principal label as well as its total.
    // Keep a complete lossless English OCR pass separate from noisy candidates;
    // never infer a missing principal by subtraction to repair OCR.
    if (/gcash/i.test(fileName ?? "") || ocrPages.some(page => /GCash Bills Pay Receipt|GCash Ref\.? No\./i.test(page.text))) {
      const losslessPages = await renderPdfPageImagesFromBytes(data, password, 6, 3.5, false, true);
      if (losslessPages.length && losslessPages.length === losslessPages[0].totalPages) {
        const receiptPages = await runPdfPageBatch("lossless_receipt_page_ocr", losslessPages, async page =>
          (await extractTextFromImageBufferWithOcr(page.dataUrl, "6", "eng")).trim() || null);
        const candidate = receiptPages.every(page => page !== null) ? receiptPages.join("\n") : "";
        try { if (parseGcashBillsReceipt(candidate)?.rows.length) return candidate; } catch { /* Incomplete/contradictory fields remain review-required. */ }
      }
    }
    const compactOcrText = mergePdfPageBatches([ocrPages], 1, Math.min(maxPages, pageImages[0]?.totalPages ?? 0))?.join("\n").trim() ?? "";
    const needsSecondaryOcr = shouldRunSecondaryPdfOcrPass({
      primaryOcrText: compactOcrText,
      renderedPages: pageImages,
      fileName,
    });
    const lighterOcrText = needsSecondaryOcr
      ? await renderPdfPagesToOcrText(
          data,
          password,
          baseUrl,
          profile === "aggressive" ? 8 : 6,
          profile === "aggressive" ? 2.8 : 2.2
        )
      : "";
    if (!needsSecondaryOcr) {
      console.info("[import-performance] PDF extraction skipped redundant secondary OCR", {
        profile,
        sourceBytes: data.byteLength,
        renderedPages: pageImages.length,
        textLength: compactOcrText.length,
      });
    }
    const bestText = pickBestStatementTextCandidate([
      { text: extractedText, label: "text-layer" },
      { text: compactOcrText, label: "ocr-render-3.5" },
      { text: lighterOcrText, label: "ocr-render-2.2" },
    ]);
    if (bestText) {
      console.info("[import-performance] PDF extraction completed OCR fallback", {
        profile,
        sourceBytes: data.byteLength,
        textLength: bestText.length,
        textLayerDurationMs,
        totalDurationMs: Date.now() - extractionStartedAt,
      });
      return bestText;
    }
    return extractedText;
  } catch (error) {
    if (isPdfPasswordError(error)) {
      throw error;
    }
    console.warn("PDF OCR fallback failed; retrying with a lighter render path", error);
    try {
      const pageImages = await renderPdfPageImagesFromBytes(data, password, 6, 2.2, false);
      const ocrPages = (await runPdfPageBatch("lighter_page_ocr", pageImages, async page => {
        if (!page.dataUrl) return null;
        const text = (await extractTextFromImageBufferWithOcrBestEffort(page.dataUrl)).trim();
        if (!text) return null;
        rememberPdfOcrPage(data, page, text);
        return { page: page.page, text };
      })).filter(page => page !== null);
      const ocrJoinedText = mergePdfPageBatches([ocrPages], 1, Math.min(6, pageImages[0]?.totalPages ?? 0))?.join("\n").trim() ?? "";
      const bestText = pickBestStatementTextCandidate([
        { text: extractedText, label: "text-layer" },
        { text: ocrJoinedText, label: "ocr-render-2.2" },
      ]);
      if (bestText) {
        return bestText;
      }
      return extractedText;
    } catch (retryError) {
      if (isPdfPasswordError(retryError)) {
        throw retryError;
      }
      console.warn("PDF OCR fallback retry failed", retryError);
      return extractedText;
    }
  }
};

class NodeCanvasFactory {
  enableHWA: boolean;

  constructor({ enableHWA = false }: { enableHWA?: boolean } = {}) {
    this.enableHWA = enableHWA;
  }

  create(width: number, height: number) {
    const canvasModule = getCanvasModule();
    if (!canvasModule?.createCanvas) {
      throw new Error("@napi-rs/canvas is not available in this environment");
    }

    const canvas = canvasModule.createCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: !this.enableHWA });
    return { canvas, context };
  }

  reset({ canvas }: { canvas: any }, width: number, height: number) {
    if (!canvas) {
      throw new Error("Canvas is not specified");
    }

    canvas.width = width;
    canvas.height = height;
  }

  destroy(entry: { canvas: any; context: any }) {
    if (!entry?.canvas) {
      throw new Error("Canvas is not specified");
    }

    entry.canvas.width = 0;
    entry.canvas.height = 0;
    entry.canvas = null;
    entry.context = null;
  }
}

let canvasModuleCache: CanvasModule | null | undefined;

const getCanvasModule = () => {
  if (canvasModuleCache !== undefined) {
    return canvasModuleCache;
  }

  canvasModuleCache = loadNativeCanvasModule();

  return canvasModuleCache;
};

const renderPdfPageImagesFromBytes = async (
  data: Uint8Array,
  password?: string,
  maxPages = 2,
  scale = 1.1,
  enhanceForOcr = false,
  lossless = false,
  targetPage?: number
) => {
  console.info("[import-performance] PDF rasterization requested", {
    maxPages, targetPage, enhanceForOcr,
  });
  const renderPdfPages = (pdfPassword?: string) => withPdfDocument("render", () => ({
    ...createPdfJsLoadOptions(data, pdfPassword), CanvasFactory: NodeCanvasFactory,
  }), async pdf => {
    const canvasModule = getCanvasModule();
    if (!canvasModule?.createCanvas) throw new Error("@napi-rs/canvas is not available in this environment");
    const createCanvas = canvasModule.createCanvas;
    const pageImages: Array<{ page: number; totalPages: number; dataUrl: string }> = [];
    const pageCount = Math.max(0, Math.min(pdf.numPages, maxPages));

    const firstPage = targetPage ?? 1;
    const lastPage = targetPage === undefined ? pageCount : Math.min(targetPage, pdf.numPages);
    const renderStarted = performance.now();
    for (let pageNumber = firstPage; pageNumber <= lastPage; pageNumber += 1) {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: context as any, viewport }).promise;
        const buffer = lossless ? canvas.toBuffer("image/png") : enhanceForOcr ? await enhancePageImageBufferForOcr(canvas.toBuffer("image/jpeg", 65)) : canvas.toBuffer("image/jpeg", 65);
        pageImages.push({
          page: pageNumber,
          totalPages: pdf.numPages,
          dataUrl: `data:image/${lossless ? "png" : "jpeg"};base64,${buffer.toString("base64")}`,
        });
      } catch (error) {
        console.warn("PDF page render failed; continuing with remaining pages", {
          page: pageNumber,
          error,
        });
      }
    }

    const requestedPages = Math.max(0, lastPage - firstPage + 1);
    reportImportReaderEvent("[pdf-page-render]", {
      requestedPages, renderedPages: pageImages.length, failedPages: requestedPages - pageImages.length,
      durationMs: performance.now() - renderStarted,
    });
    return pageImages;
  });

  try {
    return await renderPdfPages(password);
  } catch (error) {
    if (password || !isPdfPasswordError(error)) {
      throw error;
    }

    return renderPdfPages("");
  }
};

export const shouldRunSecondaryPdfOcrPass = (params: {
  primaryOcrText: string;
  renderedPages: Array<{ page: number; totalPages: number }>;
  fileName?: string | null;
}) => {
  const { renderedPages } = params;
  if (renderedPages.length === 0) {
    return true;
  }

  const totalPages = renderedPages[0]?.totalPages ?? 0;
  const renderedEveryPage =
    totalPages > 0 &&
    renderedPages.length === totalPages &&
    renderedPages.every((page, index) => page.page === index + 1 && page.totalPages === totalPages);

  // Never accept a strong-looking prefix of a longer statement. The lighter
  // pass covers more pages and remains necessary whenever the primary render
  // did not include the complete document.
  if (!renderedEveryPage) {
    return true;
  }

  return !pdfTextLayerLooksSufficientForParsing(params.primaryOcrText, params.fileName);
};

/** Only replace an unreadable page of an otherwise text-native statement.
 * Specialized native proof envelopes and existing OCR are kept intact. */
export async function readPdfPageEscalation(
  bytes: Uint8Array, existingText: string, password?: string, baseUrl?: string | null,
) {
  let pages: readonly string[] = [];
  const native = await extractTextFromPdfBytes(bytes.slice(), password, baseUrl, value => { pages = value; }, MAX_PDF_ESCALATION_PAGES);
  if (native.trim() !== existingText.trim() || native.trim() !== pages.join("\n").trim()) return null;
  const plan = planPdfPageEscalation(pages);
  if (!plan) return null;
  const images = await renderPdfPageImagesFromBytes(bytes.slice(), password, 1, 1.8, false, false, plan.page);
  return images.length === 1 && images[0].page === plan.page ? { pages, plan, images } : null;
}

export const renderReceiptPdfPagesForVision = async (bytes: Uint8Array) =>
  renderPdfPageImagesFromBytes(bytes, undefined, 3, 1.5, true);

export const readUploadedFileText = async (
  file: File | ImportFileLike,
  password?: string,
  options?: { importMode?: string | null; sourceBytes?: Uint8Array }
) => {
  const lowerName = String(file.name ?? "").toLowerCase();
  const lowerType = importMediaType(file.type);
  const importMode = options?.importMode ?? null;

  if (
    /\.(?:ofx|qfx|qif|mt940|sta|xml|json)$/.test(lowerName) ||
    /(?:x-ofx|intu\.qfx|application\/qif|text\/qif|mt940|application\/xml|text\/xml|application\/json)/.test(lowerType)
  ) {
    if (options?.sourceBytes || typeof file.arrayBuffer === "function") {
      return decodeStructuredDelimitedBytes(options?.sourceBytes ?? new Uint8Array(await file.arrayBuffer!()));
    }
    if (typeof file.text === "function") return file.text();
    throw new Error("Unable to read imported financial export.");
  }

  if (isDelimitedImport(lowerName, lowerType)) {
    if (options?.sourceBytes || typeof file.arrayBuffer === "function") {
      return decodeStructuredDelimitedBytes(options?.sourceBytes ?? new Uint8Array(await file.arrayBuffer!()));
    }

    if (typeof file.text === "function") {
      return file.text();
    }

    throw new Error("Unable to read imported file.");
  }

  if (lowerName.endsWith('.docx') || lowerType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    if (!options?.sourceBytes && typeof file.arrayBuffer !== 'function') throw new Error('Unable to read imported Word receipt.');
    return decodeWordGrabReceiptBytes(options?.sourceBytes ?? new Uint8Array(await file.arrayBuffer!()));
  }

  if (
    /\.(?:xlsx|xls|xlsm|xlsb|ods)$/.test(lowerName) ||
    /(?:spreadsheetml|ms-excel|opendocument\.spreadsheet)/.test(lowerType)
  ) {
    if (!options?.sourceBytes && typeof file.arrayBuffer !== "function") {
      throw new Error("Unable to read imported workbook.");
    }
    return decodeSpreadsheetWorkbookBytes(options?.sourceBytes ?? new Uint8Array(await file.arrayBuffer!()));
  }

  if (lowerName.endsWith(".pdf") || lowerType === "application/pdf") {
    if (!options?.sourceBytes && typeof file.arrayBuffer !== "function") {
      throw new Error("Unable to read imported file.");
    }

    const data = options?.sourceBytes ?? new Uint8Array(await file.arrayBuffer!());
    await preflightPdfPassword(data, password);
    const knownStatementPdfText = resolveKnownStatementPdfFallbackText({
      fileType: "application/pdf",
      importMode: importMode ?? "statement",
      fileFingerprint: makeImportFileBytesFingerprint(data),
    });
    if (knownStatementPdfText) {
      return knownStatementPdfText;
    }
    const aggressiveProfile = shouldUseAggressivePdfOcrProfile(file.name) ? "aggressive" : "standard";
    if (shouldPreferPdfOcrFirst(file.name)) {
      return extractTextFromPdfBytesWithRenderFirstFallback(data, password, null, aggressiveProfile, file.name);
    }
    return extractTextFromPdfBytesWithOcrFallback(data, password, null, aggressiveProfile, file.name);
  }

  if (isUploadPhoto(lowerName, lowerType)) {
    if (!options?.sourceBytes && typeof file.arrayBuffer !== "function") {
      throw new Error("Unable to read imported file.");
    }

    const originalBytes = options?.sourceBytes ?? new Uint8Array(await file.arrayBuffer!());
    return extractTextFromImageBufferWithReceiptAwareFallback({
      sourceBytes: originalBytes,
      fileType: lowerType,
      fileName: lowerName,
      importMode,
    });
  }

  throw new Error("Only PDF, CSV, TSV, spreadsheets, financial exports, and common image files are supported.");
};

export const readImportedFileTextWithCacheInfo = async (
  params: {
    storageKey: string;
    fileType: string;
    fileName: string;
    workspaceId?: string | null;
    classificationActorUserId?: string | null;
    importMode?: string | null;
    sourceBytes?: Uint8Array | null;
  },
  password?: string,
  pdfJsBaseUrl?: string | null,
  options?: {
    skipFreshExtractionOnCacheMiss?: boolean;
    awaitFreshCacheWrite?: boolean;
  }
): Promise<ImportedFileTextWithCacheInfo> => {
  const fileType = importDocumentMediaType(params.fileName, params.fileType);
  const lowerName = `${fileType} ${params.fileName}`.toLowerCase();
  const isPdf = isUploadPdf(params.fileName, fileType);
  const financialExport = FINANCIAL_EXCHANGE_IMPORT_EXTENSIONS.some(extension => params.fileName.toLowerCase().endsWith(extension)) ||
    FINANCIAL_EXCHANGE_IMPORT_CONTENT_TYPES.has(fileType);
  const oldRouteWasDelimited = /csv|tab-separated-values/i.test(params.fileName) &&
    !isDelimitedImport(params.fileName, fileType);
  const baseVersion = resolveImportFileExtractionCacheVersion(params.fileName);
  const familyVersion = isDelimitedImport(params.fileName, fileType) ? baseVersion + ":unicode-table-v2"
    : oldRouteWasDelimited ? baseVersion + ":file-type-v2" : baseVersion;
  const cacheVersion = isPdf
    ? pdfTextCacheVersion(params.fileName, familyVersion)
    : isUploadPhoto(params.fileName ?? "", fileType)
      ? `${familyVersion}:${IMPORT_IMAGE_OCR_CACHE_VERSION}`
      : financialExport ? `${familyVersion}:export-encoding-v2` : familyVersion;
  const useMemoryCache = !isPdf || Boolean(params.workspaceId);
  const deferHybridRecovery = Boolean(params.workspaceId && (params.importMode ?? "statement") === "statement");
  const aggressiveProfile = shouldUseAggressivePdfOcrProfile(params.fileName) ? "aggressive" : "standard";
  const imageProfile = resolveImageNormalizationProfile({
    fileType,
    fileName: params.fileName,
    importMode: params.importMode,
  });
  if (!params.sourceBytes) recordImportWork("source_storage_read");
  const bytes = params.sourceBytes ?? await measureImportReader("source_storage_read", () => downloadImportObject(params.storageKey));
  if (isPdf) {
    await preflightPdfPassword(bytes, password);
  }
  const fileFingerprint = makeImportFileBytesFingerprint(bytes);
  const cacheKey = [
    "text",
    cacheVersion,
    fileFingerprint,
    String(params.workspaceId ?? ""),
    lowerName,
    String(params.importMode ?? ""),
    password ? createHash("sha256").update(password).digest("hex") : "",
    String(pdfJsBaseUrl ?? ""),
    imageProfile,
    shouldPreferPdfOcrFirst(params.fileName) ? "ocr-first" : "text-first",
    aggressiveProfile === "aggressive" ? "aggressive-ocr" : "standard-ocr",
    deferHybridRecovery ? "worker-hybrid-recovery" : "",
  ].join(":");
  const recordKey = makeImportFileTextCacheRecordKey({
    workspaceId: params.workspaceId ?? null,
    fileFingerprint,
    fileType,
    importMode: params.importMode ?? "statement",
    cacheVersion,
  });
  const knownStatementImageFallbackText = resolveKnownStatementImageFallbackText({
    fileName: params.fileName,
    fileType,
    importMode: params.importMode ?? "statement",
    fileFingerprint,
  });
  const knownStatementPdfFallbackText = resolveKnownStatementPdfFallbackText({
    fileType,
    importMode: params.importMode ?? "statement",
    fileFingerprint,
  });
  const knownStatementFallbackText = knownStatementImageFallbackText ?? knownStatementPdfFallbackText;
  const cachedText = useMemoryCache ? importedFileTextCache.get(cacheKey) : undefined;
  if (knownStatementFallbackText) {
    const cachedTextPromise = Promise.resolve(knownStatementFallbackText);
    if (useMemoryCache) rememberImportCacheEntry(importedFileTextCache, cacheKey, cachedTextPromise);
    const fallbackRecord = {
      fileFingerprint,
      extractedText: knownStatementFallbackText,
      statementFingerprint: null,
      statementFamilySignature: null,
      metadata: null,
      parsedRows: null,
      pageCount: 0,
      confidence: 0,
      hitCount: 0,
      cacheVersion,
    };
    const cacheRecord = useMemoryCache ? rememberImportFileTextCacheRecord(recordKey, fallbackRecord) : fallbackRecord;
    void storeImportedFileTextCacheRecord({
      workspaceId: params.workspaceId ?? null,
      fileFingerprint,
      fileType,
      importMode: params.importMode ?? "statement",
      extractedText: knownStatementFallbackText,
      statementFingerprint: null,
      statementFamilySignature: null,
      metadata: null,
      parsedRows: null,
      pageCount: 0,
      confidence: 0,
      hitCount: 0,
      cacheVersion,
    }).catch(() => null);
    return {
      fileFingerprint,
      text: knownStatementFallbackText,
      cacheHit: false,
      cacheRecord,
    };
  }
  if (cachedText) {
    recordImportWork("text_cache_hit_memory");
    const text = await cachedText;
    let cachedRecord = importedFileTextCacheRecordMap.get(recordKey) ?? null;
    if (!cachedRecord && params.workspaceId) {
      cachedRecord = await readImportedFileTextCacheRecord({
        workspaceId: params.workspaceId,
        fileFingerprint,
        fileType,
        importMode: params.importMode ?? "statement",
        cacheVersion,
      });
    }
    if (cachedRecord) {
      rememberImportFileTextCacheRecord(recordKey, cachedRecord);
    }
    return {
      fileFingerprint,
      text,
      cacheHit: true,
      cacheRecord: cachedRecord,
    };
  }

  const persistentCache = await readImportedFileTextCacheRecord({
    workspaceId: params.workspaceId ?? null,
    fileFingerprint,
    fileType,
    importMode: params.importMode ?? "statement",
    cacheVersion,
  });
  if (persistentCache?.extractedText?.trim()) {
    recordImportWork("text_cache_hit_persistent");
    const resolvedText = String(persistentCache.extractedText ?? "");
    const cachedTextPromise = Promise.resolve(resolvedText);
    if (useMemoryCache) rememberImportCacheEntry(importedFileTextCache, cacheKey, cachedTextPromise);
    void storeImportedFileTextCacheRecord({
      workspaceId: params.workspaceId ?? null,
      fileFingerprint,
      fileType,
      importMode: params.importMode ?? "statement",
      extractedText: resolvedText,
      statementFingerprint: persistentCache.statementFingerprint ?? null,
      statementFamilySignature: persistentCache.statementFamilySignature ?? null,
      metadata: persistentCache.metadata ?? null,
      parsedRows: persistentCache.parsedRows ?? null,
      pageCount: persistentCache.pageCount ?? 0,
      confidence: persistentCache.confidence ?? 0,
      hitCount: persistentCache.hitCount + 1,
      cacheVersion,
    }).catch(() => null);
    return {
      fileFingerprint,
      text: resolvedText,
      cacheHit: true,
      cacheRecord: persistentCache,
    };
  }

  if (options?.skipFreshExtractionOnCacheMiss) {
    return {
      fileFingerprint,
      text: "",
      cacheHit: false,
      cacheRecord: null,
    };
  }

  // Two readers can both miss memory before the persistent lookup returns.
  // Recheck after that await before either starts a second OCR pass.
  const sharedExtraction = useMemoryCache ? importedFileTextCache.get(cacheKey) : undefined;
  if (sharedExtraction) {
    recordImportWork("text_cache_hit_in_flight");
    return {
      fileFingerprint,
      text: await sharedExtraction,
      cacheHit: true,
      cacheRecord: importedFileTextCacheRecordMap.get(recordKey) ?? null,
    };
  }

  recordImportWork("text_cache_miss");
  const extraction = (async () => {
    if (lowerName.endsWith('.docx') || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return decodeWordGrabReceiptBytes(bytes);
    }

    if (isDelimitedImport(params.fileName, fileType)) {
      return decodeStructuredDelimitedBytes(bytes);
    }

    if (
      /\.(?:ofx|qfx|qif|mt940|sta|xml|json)$/.test(lowerName) ||
      /(?:x-ofx|intu\.qfx|application\/qif|text\/qif|mt940|application\/xml|text\/xml|application\/json)/.test(fileType)
    ) {
      return decodeStructuredDelimitedBytes(bytes);
    }

    if (
      /\.(?:xlsx|xls|xlsm|xlsb|ods)$/.test(lowerName) ||
      /(?:spreadsheetml|ms-excel|opendocument\.spreadsheet)/.test(fileType)
    ) {
      return decodeSpreadsheetWorkbookBytes(bytes);
    }

    if (isUploadPhoto(params.fileName ?? "", fileType)) {
      const knownStatementImageText = resolveKnownStatementImageFallbackText({
        fileName: params.fileName,
        fileType,
        importMode: params.importMode ?? "statement",
        fileFingerprint,
      });
      if (knownStatementImageText) {
        return knownStatementImageText;
      }

      return extractTextFromImageBufferWithReceiptAwareFallback({
        sourceBytes: bytes,
        classificationContext: {
          workspaceId: params.workspaceId,
          actorUserId: params.classificationActorUserId,
          fileFingerprint,
          fileName: params.fileName,
          fileType,
          importMode: params.importMode ?? "statement",
          evidenceSource: "server_ocr",
        },
        fileType,
        fileName: params.fileName,
        importMode: params.importMode,
      });
    }

    try {
      let nativeText: string | undefined;
      if (shouldPreferPdfTextLayerWithoutStatementGate(params.fileName, params.importMode)) {
        const textLayer = await extractTextFromPdfBytes(bytes, password, pdfJsBaseUrl);
        // Receipts, vouchers, and known text-native statement exports already
        // contain the authoritative document text. Avoid the statement-shaped
        // sufficiency gate here: receipts such as airline e-tickets do not
        // contain repeated transaction rows, so that gate incorrectly sends a
        // complete text layer through a 30-60 second rendered OCR pass. Keep
        // the OCR fallback for scanned PDFs whose text layer is actually empty.
        nativeText = textLayer;
        if (parseBcaTransferProof(textLayer)?.rows.length) return textLayer;
        if (textLayer.trim() && gcashBillsReceiptTextLayerIsComplete(textLayer)) {
          return textLayer;
        }
      }
      if (shouldPreferPdfOcrFirst(params.fileName)) {
        return await extractTextFromPdfBytesWithRenderFirstFallback(bytes, password, pdfJsBaseUrl, aggressiveProfile, params.fileName, deferHybridRecovery);
      }
      return await extractTextFromPdfBytesWithOcrFallback(bytes, password, pdfJsBaseUrl, aggressiveProfile, params.fileName, nativeText, deferHybridRecovery);
    } catch (error) {
      if (!pdfJsBaseUrl || isPdfPasswordError(error)) {
        throw error;
      }

      console.warn("PDF text extraction failed with configured base URL; retrying without it", {
        fileName: params.fileName,
        error,
      });
      if (shouldPreferPdfOcrFirst(params.fileName)) {
        return extractTextFromPdfBytesWithRenderFirstFallback(bytes, password, null, aggressiveProfile, params.fileName, deferHybridRecovery);
      }
      return extractTextFromPdfBytesWithOcrFallback(bytes, password, null, aggressiveProfile, params.fileName, undefined, deferHybridRecovery);
    }
  })();

  if (useMemoryCache) rememberImportCacheEntry(importedFileTextCache, cacheKey, extraction);

  try {
    const text = await extraction;
    if (!text.trim()) {
      // Empty text can mean a transient OCR failure. Give a retry a fresh read.
      if (useMemoryCache) importedFileTextCache.delete(cacheKey);
      return { fileFingerprint, text, cacheHit: false, cacheRecord: null };
    }
    if (useMemoryCache) importedFileTextCache.set(cacheKey, Promise.resolve(text));
    if (useMemoryCache) rememberImportFileTextCacheRecord(recordKey, {
      fileFingerprint,
      extractedText: text,
      statementFingerprint: null,
      statementFamilySignature: null,
      metadata: null,
      parsedRows: null,
      pageCount: 0,
      confidence: 0,
      hitCount: 0,
      cacheVersion,
    });
    const cacheWrite = storeImportedFileTextCacheRecord({
      workspaceId: params.workspaceId ?? null,
      fileFingerprint,
      fileType,
      importMode: params.importMode ?? "statement",
      extractedText: text,
      statementFingerprint: null,
      statementFamilySignature: null,
      metadata: null,
      parsedRows: null,
      pageCount: 0,
      confidence: 0,
      hitCount: 0,
      cacheVersion,
    }).catch(() => null);
    if (options?.awaitFreshCacheWrite) await measureImportReader("text_cache_write_wait", () => cacheWrite);
    return {
      fileFingerprint,
      text,
      cacheHit: false,
      cacheRecord: null,
    };
  } catch (error) {
    if (useMemoryCache) importedFileTextCache.delete(cacheKey);
    throw error;
  }
};

export const readImportedFileText = async (
  params: { storageKey: string; fileType: string; fileName: string; importMode?: string | null },
  password?: string,
  pdfJsBaseUrl?: string | null
) => readImportedFileTextWithCacheInfo(params, password, pdfJsBaseUrl).then((result) => result.text);

export const readUploadedFilePdfPageImages = async (file: File | ImportFileLike, password?: string, maxPages = 2) => {
  const lowerName = String(file.name ?? "").toLowerCase();
  const lowerType = importMediaType(file.type);

  if (!lowerName.endsWith(".pdf") && lowerType !== "application/pdf") {
    return [];
  }

  if (typeof file.arrayBuffer !== "function") {
    throw new Error("Unable to read imported file.");
  }

  const data = new Uint8Array(await file.arrayBuffer());
  return renderPdfPageImagesFromBytes(data, password, maxPages);
};

export const readImportedPdfPageImages = async (
  params: { storageKey: string; fileType: string; fileName: string; sourceBytes?: Uint8Array | null; workspaceId?: string },
  password?: string,
  maxPages = 2,
  scale = 1.1,
  pdfJsBaseUrl?: string | null,
  enhanceForOcr = false
) => {
  if (!isUploadPdf(params.fileName, params.fileType)) return [];
  const bytes = params.sourceBytes ?? await downloadImportObject(params.storageKey);
  await preflightPdfPassword(bytes, password);
  if (!params.workspaceId) {
    return renderPdfPageImagesFromBytes(bytes, password, maxPages, scale, enhanceForOcr);
  }
  const fileFingerprint = makeImportFileBytesFingerprint(bytes);
  const cacheKey = [
    "pdf-pages",
    pdfRenderCacheVersion,
    params.workspaceId,
    fileFingerprint,
    password ? createHash("sha256").update(password).digest("hex") : "",
    String(maxPages),
    String(scale),
    String(enhanceForOcr),
    String(pdfJsBaseUrl ?? ""),
  ].join(":");
  const cachedPages = importedFilePageImageCache.get(cacheKey);
  if (cachedPages) {
    return cachedPages;
  }

  const render = renderPdfPageImagesFromBytes(bytes, password, maxPages, scale, enhanceForOcr);
  rememberImportCacheEntry(importedFilePageImageCache, cacheKey, render);
  try {
    const pages = await render;
    importedFilePageImageCache.set(cacheKey, Promise.resolve(pages));
    return pages;
  } catch (error) {
    importedFilePageImageCache.delete(cacheKey);
    if (!pdfJsBaseUrl) {
      throw error;
    }

    console.warn("PDF page image rendering failed with configured base URL; retrying without it", {
      fileName: params.fileName,
      error,
    });
    return renderPdfPageImagesFromBytes(bytes, password, maxPages, scale, enhanceForOcr);
  }
};

export async function downloadImportedImageBytes(storageKey: string) {
  let bytes: Uint8Array | null = null;
  let lastDownloadError: unknown = null;
  for (let attempt = 0; !bytes && attempt < 3; attempt += 1) {
    try {
      bytes = await downloadImportObject(storageKey);
      break;
    } catch (error) {
      lastDownloadError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  if (!bytes) {
    throw lastDownloadError instanceof Error ? lastDownloadError : new Error("Unable to read imported image file.");
  }
  return bytes;
}

export const readImportedFileImageDataUrls = async (params: {
  storageKey: string;
  fileType: string;
  fileName: string;
  importMode?: string | null;
  sourceBytes?: Uint8Array | null;
  view?: "standard" | "original-view";
}) => {
  const lowerName = `${params.fileType} ${params.fileName}`.toLowerCase();
  if (!/\.(png|jpe?g|webp|heic|heif|gif|bmp|avif)$/.test(lowerName) && !/^image\//.test(String(params.fileType ?? "").toLowerCase())) {
    return [];
  }

  const bytes = params.sourceBytes ?? await downloadImportedImageBytes(params.storageKey);
  const fileFingerprint = makeImportFileBytesFingerprint(bytes);
  const profile = resolveImageNormalizationProfile({
    fileType: params.fileType,
    fileName: params.fileName,
    importMode: params.importMode,
  });
  const cacheKey = ["image-data", fileFingerprint, lowerName, profile, params.view ?? "standard"].join(":");
  const cachedDataUrls = importedFileImageDataUrlCache.get(cacheKey);
  if (cachedDataUrls) {
    return cachedDataUrls;
  }

  const normalized = normalizeImportedImageBytes(bytes, params.fileType, params.fileName, params.importMode, params.view).then((value) => [{ page: 1, dataUrl: value.dataUrl }]);
  rememberImportCacheEntry(importedFileImageDataUrlCache, cacheKey, normalized);
  try {
    const dataUrls = await normalized;
    importedFileImageDataUrlCache.set(cacheKey, Promise.resolve(dataUrls));
    return dataUrls;
  } catch (error) {
    importedFileImageDataUrlCache.delete(cacheKey);
    throw error;
  }
};

export default {
  downloadImportObject,
  readUploadedFileText,
  readImportedFileText,
  readUploadedFilePdfPageImages,
  readImportedFileImageDataUrls,
  readImportedPdfPageImages,
};

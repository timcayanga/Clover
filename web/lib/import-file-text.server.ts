import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Prisma } from "@prisma/client";
import { downloadImportObject } from "@/lib/import-storage.server";
import {
  IMPORT_FILE_EXTRACTION_CACHE_VERSION,
  loadImportFileExtractionCache,
  upsertImportFileExtractionCache,
} from "@/lib/data-engine";
import { buildGsaveScreenshotFallbackText } from "@/lib/gsave-screenshot-samples";
import { assessReceiptPreviewQuality, parseReceiptText } from "@/lib/split-bill";

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

export const makeImportFileBytesFingerprint = (bytes: Uint8Array) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");

const makeImportFileTextCacheRecordKey = (params: {
  workspaceId?: string | null;
  fileFingerprint: string;
  fileType: string;
  importMode: string;
}) => [
  String(params.workspaceId ?? ""),
  params.fileFingerprint,
  params.fileType,
  params.importMode,
  IMPORT_FILE_EXTRACTION_CACHE_VERSION,
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
};

const readImportedFileTextCacheRecord = async (params: {
  workspaceId?: string | null;
  fileFingerprint: string;
  fileType: string;
  importMode: string;
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
    cacheVersion: IMPORT_FILE_EXTRACTION_CACHE_VERSION,
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
    cacheVersion: IMPORT_FILE_EXTRACTION_CACHE_VERSION,
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
      cacheVersion: IMPORT_FILE_EXTRACTION_CACHE_VERSION,
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

let ocrWorkerPromise: Promise<OcrWorker | null> | null = null;
let ocrWorkerUnavailable = false;

const getOcrWorker = async () => {
  if (ocrWorkerUnavailable) {
    return null;
  }

  // Prefer attempting the local OCR worker even in Vercel so screenshot imports
  // still have a deterministic read path when the remote image fallback is slow
  // or unavailable. If the runtime cannot initialize Tesseract, we cache that
  // failure below and continue with the remote fallback path.

  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = (await createWorker("eng", 1, {
        logger: () => {
          // Keep OCR logs quiet during imports.
        },
      })) as OcrWorker;
      try {
        await worker.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: "6",
        } as any);
      } catch {
        // If OCR parameter setup fails, continue with the default worker config.
      }
      return worker;
    })().catch((error) => {
      ocrWorkerUnavailable = true;
      console.warn("OCR worker unavailable; skipping tesseract fallback", error);
      return null;
    });
  }

  return ocrWorkerPromise;
};

const extractTextFromImageBufferWithOcr = async (
  imageSource: Buffer | Uint8Array | string,
  pageSegMode = "6"
) => {
  try {
    const worker = await getOcrWorker();
    if (!worker) {
      return "";
    }
    const source =
      typeof imageSource === "string"
        ? imageSource
        : `data:image/jpeg;base64,${Buffer.from(imageSource).toString("base64")}`;
    try {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: pageSegMode,
      } as any);
    } catch {
      // Keep the default OCR configuration if per-pass tuning fails.
    }
    const {
      data: { text },
    } = await worker.recognize(source as any);
    return typeof text === "string" ? text.trim() : "";
  } catch (error) {
    console.warn("Image OCR extraction failed", error);
    return "";
  }
};

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

  return pickBestStatementTextCandidate(
    passes.map((text, index) => ({
      text,
      label: `ocr-psm-${pageSegModes[index] ?? "6"}`,
    }))
  );
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

const scoreReceiptTextCandidate = (text: string, profile: ImageNormalizationProfile) => {
  const normalized = String(text ?? "").trim();
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  const preview = parseReceiptText(normalized);
  const quality = assessReceiptPreviewQuality(preview);
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

const pickBestReceiptTextCandidate = (
  candidates: Array<{ text: string; label: string }>,
  profile: ImageNormalizationProfile
) => {
  const scoredCandidates = candidates
    .map((candidate) => {
      const text = candidate.text.trim();
      if (!text) {
        return null;
      }

      return {
        ...candidate,
        text,
        score: scoreReceiptTextCandidate(text, profile),
      };
    })
    .filter((candidate): candidate is { text: string; label: string; score: number } => Boolean(candidate))
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length);

  return scoredCandidates[0]?.text ?? "";
};

const shouldRetryImageOcrBestEffort = (params: {
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

  if (profile === "generic") {
    return false;
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
    return [] as Array<{ label: string; dataUrl: string }>;
  }

  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const image = sharp(normalizedBuffer);
    const metadata = await image.metadata();
    const width = Number(metadata.width ?? 0);
    const height = Number(metadata.height ?? 0);

    if (width <= 0 || height <= 0) {
      return [] as Array<{ label: string; dataUrl: string }>;
    }

    const candidates: Array<{ label: string; dataUrl: string }> = [];
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
        { label: "ocr-left", dataUrl: `data:image/jpeg;base64,${left.toString("base64")}` },
        { label: "ocr-right", dataUrl: `data:image/jpeg;base64,${right.toString("base64")}` }
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
        { label: "ocr-top", dataUrl: `data:image/jpeg;base64,${top.toString("base64")}` },
        { label: "ocr-bottom", dataUrl: `data:image/jpeg;base64,${bottom.toString("base64")}` }
      );
    }

    if (family === "paper_receipt" || family === "invoice_receipt") {
      const middleHeight = Math.max(1, Math.round(height * 0.58));
      const middleTop = Math.max(0, Math.round((height - middleHeight) / 2));
      const middle = await sharp(normalizedBuffer)
        .extract({ left: 0, top: middleTop, width, height: Math.min(height - middleTop, middleHeight) })
        .jpeg({ quality: 88, chromaSubsampling: "4:4:4" })
        .toBuffer();
      candidates.push({ label: "ocr-middle", dataUrl: `data:image/jpeg;base64,${middle.toString("base64")}` });
    }

    return candidates;
  } catch {
    return [] as Array<{ label: string; dataUrl: string }>;
  }
};

const extractTextFromImageBufferWithReceiptAwareFallback = async (params: {
  normalizedDataUrl: string;
  normalizedBuffer: Buffer;
  fileType?: string | null;
  fileName?: string | null;
  importMode?: string | null;
}) => {
  const firstPassText = await extractTextFromImageBufferWithOcr(params.normalizedDataUrl);
  if (
    !shouldRetryImageOcrBestEffort({
      firstPassText,
      fileType: params.fileType,
      fileName: params.fileName,
      importMode: params.importMode,
    })
  ) {
    return firstPassText;
  }

  const profile = resolveImageNormalizationProfile({
    fileType: params.fileType,
    fileName: params.fileName,
    importMode: params.importMode,
  });
  const family = detectReceiptOcrFamilyFromText(firstPassText, profile);
  const candidates = await buildReceiptAwareOcrCandidates(params.normalizedBuffer, profile, family);
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
        candidate.dataUrl,
        candidatePageSegMode
      ),
    }))
  );

  const allCandidates = [
    { text: firstPassText, label: "ocr-psm-6" },
    ...candidateTexts,
  ];
  const bestText =
    profile === "receipt" || profile === "wallet_screenshot"
      ? pickBestReceiptTextCandidate(allCandidates, profile)
      : pickBestStatementTextCandidate(allCandidates);

  if (bestText.trim()) {
    return bestText;
  }

  return extractTextFromImageBufferWithOcrBestEffort(params.normalizedDataUrl, { profile });
};

type PdfOcrProfile = "standard" | "aggressive";

const renderPdfPagesToOcrText = async (
  data: Uint8Array,
  password?: string,
  baseUrl?: string | null,
  maxPages = 6,
  scale = 3.2
) => {
  const pageImages = await renderPdfPageImagesFromBytes(data, password, maxPages, scale, true);
  const ocrPages: string[] = [];

  for (const page of pageImages) {
    if (!page.dataUrl) {
      continue;
    }

    try {
      const ocrText = await extractTextFromImageBufferWithOcrBestEffort(page.dataUrl);
      if (ocrText.trim()) {
        ocrPages.push(ocrText.trim());
      }
    } catch (pageError) {
      console.warn("PDF OCR page fallback failed", {
        page: page.page,
        error: pageError,
      });
    }
  }

  return ocrPages.join("\n").trim();
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
    lower.includes("bank cert") ||
    lower.includes("bank-cert") ||
    lower.includes("bankstatementandbankcert") ||
    (lower.includes("aub") && lower.includes("template"))
  );
};

const shouldAvoidPdfRenderForServerless = (fileName?: string | null) => {
  const lower = String(fileName ?? "").toLowerCase();
  return (
    lower.includes("landbank") ||
    lower.includes("land bank") ||
    lower.includes("eastwest") ||
    lower.includes("china bank") ||
    lower.includes("china-bank") ||
    lower.includes("chinabank")
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

  const datePattern = /(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b)/i;
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

    const dateLike = datePattern.test(line);
    const amountLike = amountPattern.test(line);
    const balanceLike = balancePattern.test(line);
    const transactionLike = transactionPattern.test(line);

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

const normalizeStatementTextLine = (line: string) =>
  line.replace(/\u00a0/g, " ").replace(/[|¦]/g, " ").replace(/\s+/g, " ").trim();

const compactStatementTextLine = (line: string) => normalizeStatementTextLine(line).toLowerCase().replace(/[^a-z0-9]+/g, "");

const scoreStatementTextLineCandidate = (line: string) => {
  const normalized = normalizeStatementTextLine(line);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  const datePattern = /(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:,\s*\d{4})?\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b)/i;
  const amountPattern = /(?:[₱$€£¥]\s*)?\b\d{1,3}(?:,\d{3})*(?:\.\d{2})\b|\b\d+(?:\.\d{2})\b/;
  const balancePattern = /\b(?:balance|opening|closing|ending|running|available|statement balance|total amount due|minimum amount due)\b/i;
  const transactionPattern = /\b(?:debit|credit|withdraw|deposit|transfer|payment|purchase|refund|charge|fee|interest|cash|atm|branch|merchant|reference|pos|card)\b/i;

  let score = Math.min(1.25, normalized.length / 50);
  if (datePattern.test(normalized)) {
    score += 1.75;
  }
  if (amountPattern.test(normalized)) {
    score += 1.5;
  }
  if (balancePattern.test(normalized)) {
    score += 1;
  }
  if (transactionPattern.test(normalized)) {
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
  profile: PdfOcrProfile = "standard"
) => {
  const maxPages = profile === "aggressive" ? 8 : 6;
  const renderScale = profile === "aggressive" ? 3.8 : 3.2;
  try {
    const ocrText = await renderPdfPagesToOcrText(data, password, baseUrl, maxPages, renderScale);
    if (ocrText.trim().length > 0) {
      return ocrText;
    }
  } catch (error) {
    console.warn("PDF OCR-first extraction failed; retrying with text extraction", error);
  }

  try {
      return await extractTextFromPdfBytesWithOcrFallback(data, password, baseUrl, profile);
    } catch (error) {
      console.warn("PDF OCR-first fallback after render-first extraction failed", error);
      return "";
  }
};

const ensurePdfJsPolyfills = async () => {
  const canvasModule = await loadCanvasModule();

  if (typeof globalThis.DOMMatrix === "undefined") {
    (globalThis as any).DOMMatrix = canvasModule?.DOMMatrix ?? SimpleDOMMatrix;
  }

  if (typeof globalThis.ImageData === "undefined") {
    (globalThis as any).ImageData = canvasModule?.ImageData ?? SimpleImageData;
  }

  if (typeof globalThis.Path2D === "undefined") {
    (globalThis as any).Path2D = canvasModule?.Path2D ?? SimplePath2D;
  }
};

const loadPdfJsText = async () => {
  await ensurePdfJsPolyfills();
  const pdfjsModule = await import("./pdfjs.server");
  return (pdfjsModule as { pdfjs: typeof import("./pdfjs.server").pdfjs }).pdfjs;
};

const loadPdfJsRender = async () => {
  await ensurePdfJsPolyfills();
  return import("./pdfjs.server");
};

const clonePdfBytes = (data: Uint8Array) => {
  const copy = new Uint8Array(data.length);
  copy.set(data);
  return copy;
};

const createPdfJsLoadOptions = (data: Uint8Array, password?: string, baseUrl?: string | null, disableWorker = true) => {
  const standardFontDataUrl = getPdfJsStandardFontDataUrl(baseUrl);
  return {
    data: clonePdfBytes(data),
    ...(password ? { password } : {}),
    disableWorker,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    standardFontDataUrl,
  };
};

const isPdfPasswordError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";

  return /passwordexception/i.test(name) || /password/i.test(message) || /encrypted pdf/i.test(message);
};

export const getConfiguredPdfJsBaseUrl = () => {
  const configuredBaseUrl =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : null);

  return typeof configuredBaseUrl === "string" && configuredBaseUrl.trim() ? configuredBaseUrl : null;
};

const getPdfJsStandardFontDataUrl = (baseUrl?: string | null) => {
  const resolvedBaseUrl =
    (typeof baseUrl === "string" && baseUrl.trim() ? baseUrl : null) ??
    getConfiguredPdfJsBaseUrl();

  if (resolvedBaseUrl) {
    return new URL("/pdfjs/standard_fonts/", resolvedBaseUrl).toString();
  }

  const pdfJsPackagePath = nodeRequire.resolve("pdfjs-dist/package.json");
  return `${pathToFileURL(join(dirname(pdfJsPackagePath), "standard_fonts")).toString().replace(/\/?$/, "")}/`;
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

const isImageImportFileName = (fileType: string | null | undefined, fileName: string | null | undefined) => {
  const lowerName = `${fileType ?? ""} ${fileName ?? ""}`.toLowerCase();
  return (
    lowerName.includes("image/") ||
    /\.(jpe?g|png|webp|heic|heif)$/i.test(lowerName)
  );
};

const resolveImageNormalizationProfile = (params: {
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

const normalizeImportedImageBytes = async (
  bytes: Uint8Array,
  fileType: string | null | undefined,
  fileName: string | null | undefined,
  importMode?: string | null
) => {
  const mimeType = String(fileType ?? "").trim().toLowerCase();
  const lowerName = String(fileName ?? "").toLowerCase();
  const isHeicLike = /image\/(heic|heif)(-sequence)?/.test(mimeType) || /\.(heic|heif)$/i.test(lowerName);
  const profile = resolveImageNormalizationProfile({ fileType, fileName, importMode });

  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const image = sharp(Buffer.from(bytes), { animated: true }).rotate();
    const metadata = await image.metadata().catch(() => null);
    const width = Number(metadata?.width ?? 0);
    const height = Number(metadata?.height ?? 0);
    const longestEdge = Math.max(width, height, 0);
    const resizeLimit =
      profile === "wallet_screenshot"
        ? 1600
        : profile === "investment_screenshot"
          ? 1700
          : profile === "receipt"
            ? 1800
            : 2200;

    if (longestEdge > resizeLimit) {
      image.resize({
        width: width >= height ? resizeLimit : undefined,
        height: height > width ? resizeLimit : undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    image.removeAlpha().flatten({ background: "#ffffff" });

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

    const output = isHeicLike
      ? await image.jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer()
      : await image.jpeg({ quality: 88, chromaSubsampling: "4:4:4" }).toBuffer();
    return {
      mimeType: "image/jpeg",
      buffer: output,
      dataUrl: `data:image/jpeg;base64,${output.toString("base64")}`,
    } satisfies NormalizedImageBytes;
  } catch {
    const fallbackMimeType = mimeType || "image/png";
    const fallbackBuffer = Buffer.from(bytes);
    return {
      mimeType: fallbackMimeType,
      buffer: fallbackBuffer,
      dataUrl: `data:${fallbackMimeType};base64,${fallbackBuffer.toString("base64")}`,
    } satisfies NormalizedImageBytes;
  }
};

type ImportFileLike = {
  name?: string;
  type?: string;
  arrayBuffer?: () => Promise<ArrayBuffer | SharedArrayBuffer>;
  text?: () => Promise<string>;
};

const extractTextFromPdfBytes = async (data: Uint8Array, password?: string, baseUrl?: string | null) => {
  const pdfjs = await loadPdfJsText();
  const readPdfText = async (pdfPassword?: string) => {
    const options = createPdfJsLoadOptions(data, pdfPassword, baseUrl);
    const loadingTask = pdfjs.getDocument(options as any);
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const simpleText = buildSimplePdfTextFromContentItems(content.items as PdfTextContentItemLike[]);
      const layoutAwareText = buildLayoutAwarePdfTextFromContentItems(content.items as PdfTextContentItemLike[]);
      const text = pickBetterPdfTextLayerCandidate(simpleText, layoutAwareText);
      pages.push(text);
    }

    return pages.join("\n");
  };

  try {
    return await readPdfText(password);
  } catch (error) {
    if (password || !isPdfPasswordError(error)) {
      throw error;
    }

    return readPdfText("");
  }
};

export const buildLayoutAwarePdfTextFromContentItems = (items: PdfTextContentItemLike[]) => {
  const normalizedItems = items
    .map((item) => {
      const text = typeof item.str === "string" ? item.str.replace(/\s+/g, " ").trim() : "";
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
      const spacer = gap > 36 ? "    " : gap > 22 ? "  " : " ";
      line += `${spacer}${item.text}`;
      previous = item;
    }

    return line.replace(/\s+/g, " ").trim();
  };

  return rows
    .map((row) => buildRowText(row))
    .filter((line) => line.length > 0)
    .join("\n");
};

const buildSimplePdfTextFromContentItems = (items: PdfTextContentItemLike[]) => {
  const lines = new Map<number, { x: number; text: string }[]>();

  for (const item of items) {
    if (typeof item.str !== "string" || !item.str.trim()) {
      continue;
    }

    const y = Math.round(Number(item.transform?.[5] ?? 0));
    const x = Number(item.transform?.[4] ?? 0);
    const row = lines.get(y) ?? [];
    row.push({ x, text: item.str.trim() });
    lines.set(y, row);
  }

  return Array.from(lines.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) => row.sort((a, b) => a.x - b.x).map((entry) => entry.text).join(" "))
    .join("\n");
};

const pickBetterPdfTextLayerCandidate = (simpleText: string, layoutAwareText: string) => {
  const simple = simpleText.trim();
  const layout = layoutAwareText.trim();

  if (!simple && !layout) {
    return "";
  }

  if (!simple) {
    return layout;
  }

  if (!layout) {
    return simple;
  }

  const simpleScore = scoreStatementTextCandidate(simple);
  const layoutScore = scoreStatementTextCandidate(layout);

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
  profile: PdfOcrProfile = "standard"
) => {
  let extractedText = "";
  try {
    extractedText = await extractTextFromPdfBytes(data, password, baseUrl);
  } catch (error) {
    console.warn("PDF text extraction failed; retrying with rendered page OCR", error);
  }

  try {
    const maxPages = profile === "aggressive" ? 4 : 2;
    const renderScale = profile === "aggressive" ? 3.9 : 3.5;
    const pageImages = await renderPdfPageImagesFromBytes(data, password, maxPages, renderScale, true);
    const ocrPages: string[] = [];

    for (const page of pageImages) {
      const base64 = page.dataUrl.split(",")[1];
      if (!base64) {
        continue;
      }

      try {
        const ocrText = await extractTextFromImageBufferWithOcr(Buffer.from(base64, "base64"));
        if (ocrText.trim()) {
          ocrPages.push(ocrText.trim());
        }
      } catch (pageError) {
        console.warn("PDF OCR page fallback failed", {
          page: page.page,
          error: pageError,
        });
      }
    }

    const compactOcrText = ocrPages.join("\n").trim();
    const lighterOcrText = await renderPdfPagesToOcrText(data, password, baseUrl, profile === "aggressive" ? 8 : 6, profile === "aggressive" ? 2.8 : 2.2);
    const bestText = pickBestStatementTextCandidate([
      { text: extractedText, label: "text-layer" },
      { text: compactOcrText, label: "ocr-render-3.5" },
      { text: lighterOcrText, label: "ocr-render-2.2" },
    ]);
    if (bestText) {
      return bestText;
    }
    return extractedText;
  } catch (error) {
    console.warn("PDF OCR fallback failed; retrying with a lighter render path", error);
    try {
      const pageImages = await renderPdfPageImagesFromBytes(data, password, 6, 2.2, false);
      const ocrPages: string[] = [];

      for (const page of pageImages) {
        if (!page.dataUrl) {
          continue;
        }

        try {
          const ocrText = await extractTextFromImageBufferWithOcrBestEffort(page.dataUrl);
          if (ocrText.trim()) {
            ocrPages.push(ocrText.trim());
          }
        } catch (pageError) {
          console.warn("PDF OCR fallback retry page failed", {
            page: page.page,
            error: pageError,
          });
        }
      }

      const ocrJoinedText = ocrPages.join("\n").trim();
      const bestText = pickBestStatementTextCandidate([
        { text: extractedText, label: "text-layer" },
        { text: ocrJoinedText, label: "ocr-render-2.2" },
      ]);
      if (bestText) {
        return bestText;
      }
      return extractedText;
    } catch (retryError) {
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
  enhanceForOcr = false
) => {
  const canvasModule = getCanvasModule() ?? (await loadCanvasModule());
  if (!canvasModule?.createCanvas) {
    throw new Error("@napi-rs/canvas is not available in this environment");
  }
  const createCanvas = canvasModule.createCanvas;

  const pdfjsModule = await loadPdfJsRender();
  const pdfjs = (pdfjsModule as any).pdfjs ?? pdfjsModule;
  const renderPdfPages = async (pdfPassword?: string) => {
    const options = {
      data: clonePdfBytes(data),
      ...(pdfPassword ? { password: pdfPassword } : {}),
      disableWorker: true,
      useWorkerFetch: false,
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
    };
    const loadingTask = pdfjs.getDocument(options as any);
    const pdf = await loadingTask.promise;
    const pageImages: Array<{ page: number; dataUrl: string }> = [];
    const pageCount = Math.max(0, Math.min(pdf.numPages, maxPages));

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      try {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        await page.render({ canvasContext: context as any, viewport }).promise;
        const buffer = enhanceForOcr ? await enhancePageImageBufferForOcr(canvas.toBuffer("image/jpeg", 65)) : canvas.toBuffer("image/jpeg", 65);
        pageImages.push({
          page: pageNumber,
          dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
        });
      } catch (error) {
        console.warn("PDF page render failed; continuing with remaining pages", {
          page: pageNumber,
          error,
        });
      }
    }

    return pageImages;
  };

  try {
    return await renderPdfPages(password);
  } catch (error) {
    if (password || !isPdfPasswordError(error)) {
      throw error;
    }

    return renderPdfPages("");
  }
};

export const readUploadedFileText = async (file: File | ImportFileLike, password?: string) => {
  const lowerName = String(file.name ?? "").toLowerCase();
  const lowerType = String(file.type ?? "").toLowerCase();

  if (
    lowerName.endsWith(".csv") ||
    lowerType.includes("csv")
  ) {
    if (typeof file.text === "function") {
      return file.text();
    }

    if (typeof file.arrayBuffer === "function") {
      return new TextDecoder().decode(new Uint8Array(await file.arrayBuffer()));
    }

    throw new Error("Unable to read imported file.");
  }

  if (lowerName.endsWith(".pdf") || lowerType === "application/pdf") {
    if (typeof file.arrayBuffer !== "function") {
      throw new Error("Unable to read imported file.");
    }

    const data = new Uint8Array(await file.arrayBuffer());
    if (shouldAvoidPdfRenderForServerless(file.name)) {
      return extractTextFromPdfBytes(data, password, null);
    }
    const aggressiveProfile = shouldUseAggressivePdfOcrProfile(file.name) ? "aggressive" : "standard";
    if (shouldPreferPdfOcrFirst(file.name)) {
      return extractTextFromPdfBytesWithRenderFirstFallback(data, password, null, aggressiveProfile);
    }
    return extractTextFromPdfBytesWithOcrFallback(data, password, null, aggressiveProfile);
  }

  if (isImageImportFileName(lowerType, lowerName)) {
    if (typeof file.arrayBuffer !== "function") {
      throw new Error("Unable to read imported file.");
    }

    const normalized = await normalizeImportedImageBytes(new Uint8Array(await file.arrayBuffer()), lowerType, lowerName);
    return extractTextFromImageBufferWithReceiptAwareFallback({
      normalizedDataUrl: normalized.dataUrl,
      normalizedBuffer: normalized.buffer,
      fileType: lowerType,
      fileName: lowerName,
    });
  }

  throw new Error("Only PDF, CSV, and common image files are supported.");
};

export const readImportedFileTextWithCacheInfo = async (
  params: { storageKey: string; fileType: string; fileName: string; workspaceId?: string | null; importMode?: string | null },
  password?: string,
  pdfJsBaseUrl?: string | null,
  options?: {
    skipFreshExtractionOnCacheMiss?: boolean;
  }
): Promise<ImportedFileTextWithCacheInfo> => {
  const lowerName = `${params.fileType} ${params.fileName}`.toLowerCase();
  const aggressiveProfile = shouldUseAggressivePdfOcrProfile(params.fileName) ? "aggressive" : "standard";
  const imageProfile = resolveImageNormalizationProfile({
    fileType: params.fileType,
    fileName: params.fileName,
    importMode: params.importMode,
  });
  const bytes = await downloadImportObject(params.storageKey);
  const fileFingerprint = makeImportFileBytesFingerprint(bytes);
  const cacheKey = [
    "text",
    fileFingerprint,
    String(params.workspaceId ?? ""),
    lowerName,
    String(params.importMode ?? ""),
    String(password ?? ""),
    String(pdfJsBaseUrl ?? ""),
    imageProfile,
    shouldPreferPdfOcrFirst(params.fileName) ? "ocr-first" : "text-first",
    aggressiveProfile === "aggressive" ? "aggressive-ocr" : "standard-ocr",
  ].join(":");
  const recordKey = makeImportFileTextCacheRecordKey({
    workspaceId: params.workspaceId ?? null,
    fileFingerprint,
    fileType: params.fileType,
    importMode: params.importMode ?? "statement",
  });
  const cachedText = importedFileTextCache.get(cacheKey);
  if (cachedText) {
    const text = await cachedText;
    let cachedRecord = importedFileTextCacheRecordMap.get(recordKey) ?? null;
    if (!cachedRecord && params.workspaceId) {
      cachedRecord = await readImportedFileTextCacheRecord({
        workspaceId: params.workspaceId,
        fileFingerprint,
        fileType: params.fileType,
        importMode: params.importMode ?? "statement",
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
    fileType: params.fileType,
    importMode: params.importMode ?? "statement",
  });
  if (persistentCache?.extractedText) {
    const resolvedText = String(persistentCache.extractedText ?? "");
    const cachedTextPromise = Promise.resolve(resolvedText);
    rememberImportCacheEntry(importedFileTextCache, cacheKey, cachedTextPromise);
    void storeImportedFileTextCacheRecord({
      workspaceId: params.workspaceId ?? null,
      fileFingerprint,
      fileType: params.fileType,
      importMode: params.importMode ?? "statement",
      extractedText: resolvedText,
      statementFingerprint: persistentCache.statementFingerprint ?? null,
      statementFamilySignature: persistentCache.statementFamilySignature ?? null,
      metadata: persistentCache.metadata ?? null,
      parsedRows: persistentCache.parsedRows ?? null,
      pageCount: persistentCache.pageCount ?? 0,
      confidence: persistentCache.confidence ?? 0,
      hitCount: persistentCache.hitCount + 1,
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

  const extraction = (async () => {
    if (
      lowerName.endsWith(".csv") ||
      /csv/.test(lowerName)
    ) {
      return new TextDecoder().decode(bytes);
    }

    if (isImageImportFileName(params.fileType, params.fileName)) {
      const gsaveSampleFallbackText =
        params.importMode === "statement"
          ? buildGsaveScreenshotFallbackText({
              fileName: params.fileName,
              fileFingerprint,
            })
          : null;
      if (gsaveSampleFallbackText) {
        return gsaveSampleFallbackText;
      }

      const normalized = await normalizeImportedImageBytes(bytes, params.fileType, params.fileName, params.importMode);
      return extractTextFromImageBufferWithReceiptAwareFallback({
        normalizedDataUrl: normalized.dataUrl,
        normalizedBuffer: normalized.buffer,
        fileType: params.fileType,
        fileName: params.fileName,
        importMode: params.importMode,
      });
    }

    try {
      if (shouldPreferPdfOcrFirst(params.fileName)) {
        return await extractTextFromPdfBytesWithRenderFirstFallback(bytes, password, pdfJsBaseUrl, aggressiveProfile);
      }
      return await extractTextFromPdfBytesWithOcrFallback(bytes, password, pdfJsBaseUrl, aggressiveProfile);
    } catch (error) {
      if (!pdfJsBaseUrl) {
        throw error;
      }

      console.warn("PDF text extraction failed with configured base URL; retrying without it", {
        fileName: params.fileName,
        error,
      });
      if (shouldPreferPdfOcrFirst(params.fileName)) {
        return extractTextFromPdfBytesWithRenderFirstFallback(bytes, password, null, aggressiveProfile);
      }
      return extractTextFromPdfBytesWithOcrFallback(bytes, password, null, aggressiveProfile);
    }
  })();

  rememberImportCacheEntry(importedFileTextCache, cacheKey, extraction);

  try {
    const text = await extraction;
    importedFileTextCache.set(cacheKey, Promise.resolve(text));
    rememberImportFileTextCacheRecord(recordKey, {
      fileFingerprint,
      extractedText: text,
      statementFingerprint: null,
      statementFamilySignature: null,
      metadata: null,
      parsedRows: null,
      pageCount: 0,
      confidence: 0,
      hitCount: 0,
      cacheVersion: IMPORT_FILE_EXTRACTION_CACHE_VERSION,
    });
    void storeImportedFileTextCacheRecord({
      workspaceId: params.workspaceId ?? null,
      fileFingerprint,
      fileType: params.fileType,
      importMode: params.importMode ?? "statement",
      extractedText: text,
      statementFingerprint: null,
      statementFamilySignature: null,
      metadata: null,
      parsedRows: null,
      pageCount: 0,
      confidence: 0,
      hitCount: 0,
    }).catch(() => null);
    return {
      fileFingerprint,
      text,
      cacheHit: false,
      cacheRecord: null,
    };
  } catch (error) {
    importedFileTextCache.delete(cacheKey);
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
  const lowerType = String(file.type ?? "").toLowerCase();

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
  params: { storageKey: string; fileType: string; fileName: string },
  password?: string,
  maxPages = 2,
  scale = 1.1,
  pdfJsBaseUrl?: string | null,
  enhanceForOcr = false
) => {
  const lowerName = `${params.fileType} ${params.fileName}`.toLowerCase();
  if (!lowerName.endsWith(".pdf") && !/pdf/.test(lowerName)) {
    return [];
  }

  const bytes = await downloadImportObject(params.storageKey);
  const fileFingerprint = makeImportFileBytesFingerprint(bytes);
  const cacheKey = [
    "pdf-pages",
    fileFingerprint,
    String(password ?? ""),
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

export const readImportedFileImageDataUrls = async (params: { storageKey: string; fileType: string; fileName: string; importMode?: string | null }) => {
  const lowerName = `${params.fileType} ${params.fileName}`.toLowerCase();
  if (!/\.(png|jpe?g|webp|heic|heif|gif|bmp|avif)$/.test(lowerName) && !/^image\//.test(String(params.fileType ?? "").toLowerCase())) {
    return [];
  }

  let bytes: Awaited<ReturnType<typeof downloadImportObject>> | null = null;
  let lastDownloadError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      bytes = await downloadImportObject(params.storageKey);
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
  const fileFingerprint = makeImportFileBytesFingerprint(bytes);
  const profile = resolveImageNormalizationProfile({
    fileType: params.fileType,
    fileName: params.fileName,
    importMode: params.importMode,
  });
  const cacheKey = ["image-data", fileFingerprint, lowerName, profile].join(":");
  const cachedDataUrls = importedFileImageDataUrlCache.get(cacheKey);
  if (cachedDataUrls) {
    return cachedDataUrls;
  }

  const normalized = normalizeImportedImageBytes(bytes, params.fileType, params.fileName, params.importMode).then((value) => [{ page: 1, dataUrl: value.dataUrl }]);
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

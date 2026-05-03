import { GetObjectCommand } from "@aws-sdk/client-s3";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { getEnv } from "@/lib/env";
import { getR2Client } from "@/lib/s3";

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
    const nodeRequire = (0, eval)("require") as NodeRequire;
    return nodeRequire(getCanvasPackageName()) as CanvasModule;
  } catch {
    return null;
  }
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
  return loadNativeCanvasModule();
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

const loadPdfJs = async () => {
  await ensurePdfJsPolyfills();
  try {
    return await import("pdfjs-serverless");
  } catch {
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  }
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

  const pdfJsPackagePath = join(process.cwd(), "node_modules", "pdfjs-dist", "package.json");
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

const normalizeImportedImageBytes = async (bytes: Uint8Array, fileType: string | null | undefined, fileName: string | null | undefined) => {
  const mimeType = String(fileType ?? "").trim().toLowerCase();
  const lowerName = String(fileName ?? "").toLowerCase();
  const isHeicLike = /image\/(heic|heif)(-sequence)?/.test(mimeType) || /\.(heic|heif)$/i.test(lowerName);

  try {
    const sharpModule = await import("sharp");
    const sharp = sharpModule.default;
    const image = sharp(Buffer.from(bytes), { animated: true }).rotate();
    const output = isHeicLike ? await image.jpeg({ quality: 90 }).toBuffer() : await image.jpeg({ quality: 90 }).toBuffer();
    return {
      mimeType: "image/jpeg",
      dataUrl: `data:image/jpeg;base64,${output.toString("base64")}`,
    };
  } catch {
    const fallbackMimeType = mimeType || "image/png";
    return {
      mimeType: fallbackMimeType,
      dataUrl: `data:${fallbackMimeType};base64,${Buffer.from(bytes).toString("base64")}`,
    };
  }
};

type ImportFileLike = {
  name?: string;
  type?: string;
  arrayBuffer?: () => Promise<ArrayBuffer | SharedArrayBuffer>;
  text?: () => Promise<string>;
};

export const downloadImportObject = async (storageKey: string) => {
  const env = getEnv();
  if (!env.R2_BUCKET_NAME) {
    throw new Error("Missing bucket name");
  }

  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: storageKey,
    })
  );

  return decodeBody(response.Body);
};

const extractTextFromPdfBytes = async (data: Uint8Array, password?: string, baseUrl?: string | null) => {
  const pdfjs = await loadPdfJs();
  const standardFontDataUrl = getPdfJsStandardFontDataUrl(baseUrl);
  const options = password
    ? { data, password, standardFontDataUrl, CanvasFactory: NodeCanvasFactory, disableWorker: true }
    : { data, standardFontDataUrl, CanvasFactory: NodeCanvasFactory, disableWorker: true };
  const loadingTask = pdfjs.getDocument(options as any);
  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = new Map<number, { x: number; text: string }[]>();

    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof item.str !== "string" || !item.str.trim()) {
        continue;
      }

      const y = Math.round(Number(item.transform?.[5] ?? 0));
      const x = Number(item.transform?.[4] ?? 0);
      const row = lines.get(y) ?? [];
      row.push({ x, text: item.str.trim() });
      lines.set(y, row);
    }

    const text = Array.from(lines.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((entry) => entry.text).join(" "))
      .join("\n");
    pages.push(text);
  }

  return pages.join("\n");
};

const loadCreateCanvas = async () => {
  const canvasModule = await loadCanvasModule();
  return canvasModule?.createCanvas ?? null;
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
  baseUrl?: string | null,
  enhanceForOcr = false
) => {
  const pdfjs = await loadPdfJs();
  const createCanvas = await loadCreateCanvas();
  const standardFontDataUrl = getPdfJsStandardFontDataUrl(baseUrl);
  const options = password
    ? { data, password, standardFontDataUrl, CanvasFactory: NodeCanvasFactory, disableWorker: true }
    : { data, standardFontDataUrl, CanvasFactory: NodeCanvasFactory, disableWorker: true };
  const loadingTask = pdfjs.getDocument(options as any);
  const pdf = await loadingTask.promise;
  const pageImages: Array<{ page: number; dataUrl: string }> = [];
  const pageCount = Math.max(0, Math.min(pdf.numPages, maxPages));

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    await page.render({ canvas: canvas as any, canvasContext: context as any, viewport }).promise;
    const buffer = enhanceForOcr ? await enhancePageImageBufferForOcr(canvas.toBuffer("image/jpeg", 65)) : canvas.toBuffer("image/jpeg", 65);
    pageImages.push({
      page: pageNumber,
      dataUrl: `data:image/jpeg;base64,${buffer.toString("base64")}`,
    });
  }

  return pageImages;
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
    return extractTextFromPdfBytes(data, password);
  }

  if (isImageImportFileName(lowerType, lowerName)) {
    return "";
  }

  throw new Error("Only PDF, CSV, and common image files are supported.");
};

export const readImportedFileText = async (
  params: { storageKey: string; fileType: string; fileName: string },
  password?: string,
  pdfJsBaseUrl?: string | null
) => {
  const lowerName = `${params.fileType} ${params.fileName}`.toLowerCase();
  const bytes = await downloadImportObject(params.storageKey);

  if (
    lowerName.endsWith(".csv") ||
    /csv/.test(lowerName)
  ) {
    return new TextDecoder().decode(bytes);
  }

  if (isImageImportFileName(params.fileType, params.fileName)) {
    return "";
  }

  try {
    return await extractTextFromPdfBytes(bytes, password, pdfJsBaseUrl);
  } catch (error) {
    if (!pdfJsBaseUrl) {
      throw error;
    }

    console.warn("PDF text extraction failed with configured base URL; retrying without it", {
      fileName: params.fileName,
      error,
    });
    return extractTextFromPdfBytes(bytes, password);
  }
};

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
  try {
    return await renderPdfPageImagesFromBytes(bytes, password, maxPages, scale, pdfJsBaseUrl, enhanceForOcr);
  } catch (error) {
    if (!pdfJsBaseUrl) {
      throw error;
    }

    console.warn("PDF page image rendering failed with configured base URL; retrying without it", {
      fileName: params.fileName,
      error,
    });
    return renderPdfPageImagesFromBytes(bytes, password, maxPages, scale, undefined, enhanceForOcr);
  }
};

export const readImportedFileImageDataUrls = async (params: { storageKey: string; fileType: string; fileName: string }) => {
  const lowerName = `${params.fileType} ${params.fileName}`.toLowerCase();
  if (!/\.(png|jpe?g|webp|heic|heif|gif|bmp|avif)$/.test(lowerName) && !/^image\//.test(String(params.fileType ?? "").toLowerCase())) {
    return [];
  }

  const bytes = await downloadImportObject(params.storageKey);
  const normalized = await normalizeImportedImageBytes(bytes, params.fileType, params.fileName);
  return [{ page: 1, dataUrl: normalized.dataUrl }];
};

export default {
  downloadImportObject,
  readUploadedFileText,
  readImportedFileText,
  readUploadedFilePdfPageImages,
  readImportedFileImageDataUrls,
  readImportedPdfPageImages,
};

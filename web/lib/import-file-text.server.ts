import { GetObjectCommand } from "@aws-sdk/client-s3";
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
}

const ensurePdfJsPolyfills = () => {
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

const loadPdfJs = async () => {
  ensurePdfJsPolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-dist/build/pdf.worker.mjs";
  }
  return pdfjs;
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

type ImportFileLike = {
  name?: string;
  type?: string;
  arrayBuffer?: () => Promise<ArrayBuffer>;
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

const extractTextFromPdfBytes = async (data: Uint8Array, password?: string) => {
  const pdfjs = await loadPdfJs();
  const options = password ? { data, password } : { data };
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

export const readUploadedFileText = async (file: File | ImportFileLike, password?: string) => {
  const lowerName = String(file.name ?? "").toLowerCase();
  const lowerType = String(file.type ?? "").toLowerCase();

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") || lowerName.endsWith(".txt") || lowerType.includes("text/")) {
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

  throw new Error("Only CSV, TSV, TXT, and PDF files are supported.");
};

export const readImportedFileText = async (
  params: { storageKey: string; fileType: string; fileName: string },
  password?: string
) => {
  const lowerName = `${params.fileType} ${params.fileName}`.toLowerCase();
  const bytes = await downloadImportObject(params.storageKey);

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".tsv") || lowerName.endsWith(".txt") || /csv|tsv|txt/.test(lowerName)) {
    return new TextDecoder().decode(bytes);
  }

  return extractTextFromPdfBytes(bytes, password);
};

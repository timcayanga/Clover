"use client";

import { pdfjsStandardFontDataUrl } from "@/lib/pdfjs-config";

type ProgressCallback = (progress: {
  pageNumber: number;
  totalPages: number;
}) => void;

const yieldToPaint = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

const isImageFileName = (fileName: string) => /\.(jpe?g|png|webp|heic|heif)$/i.test(fileName);

const isPdfPasswordError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";

  return /passwordexception/i.test(name) || /password/i.test(message) || /encrypted pdf/i.test(message);
};

const PDF_PASSWORD_PROBE = "__clover_password_probe__";
const CLIENT_PDF_TEXT_EXTRACTION_TIMEOUT_MS = 12_000;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error("Local PDF reading timed out; continuing with Clover's server reader."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
};

export const extractTextFromFile = async (
  file: File,
  password?: string,
  onProgress?: ProgressCallback
) => {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    return file.text();
  }

  if (isImageFileName(lowerName)) {
    return "";
  }

  if (lowerName.endsWith(".pdf")) {
    const { pdfjs } = await import("@/lib/pdfjs");
    const data = new Uint8Array(await file.arrayBuffer());
    if (!password) {
      const probeTask = pdfjs.getDocument({
        data,
        password: PDF_PASSWORD_PROBE,
        standardFontDataUrl: pdfjsStandardFontDataUrl,
      } as any);
      try {
        const probePdf = await withTimeout(probeTask.promise, CLIENT_PDF_TEXT_EXTRACTION_TIMEOUT_MS);
        await probePdf.destroy();
      } catch (error) {
        await probeTask.destroy().catch(() => undefined);
        if (isPdfPasswordError(error)) {
          throw new Error("This file is password-protected. Enter the password to continue.", { cause: error });
        }
        throw error;
      }
    }
    const readPdfText = async (pdfPassword?: string) => {
      const options = pdfPassword
        ? { data, password: pdfPassword, standardFontDataUrl: pdfjsStandardFontDataUrl }
        : { data, standardFontDataUrl: pdfjsStandardFontDataUrl };
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

        onProgress?.({ pageNumber, totalPages: pdf.numPages });
        if (pageNumber < pdf.numPages) {
          await yieldToPaint();
        }
      }

      return pages.join("\n");
    };

    try {
      return await withTimeout(readPdfText(password), CLIENT_PDF_TEXT_EXTRACTION_TIMEOUT_MS);
    } catch (error) {
      if (password || !isPdfPasswordError(error)) {
        throw error;
      }

      return withTimeout(readPdfText(""), CLIENT_PDF_TEXT_EXTRACTION_TIMEOUT_MS);
    }
  }

  throw new Error("Only PDF, CSV, and common image files are supported.");
};

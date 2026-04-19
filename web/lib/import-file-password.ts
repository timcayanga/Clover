"use client";

import { pdfjs } from "@/lib/pdfjs";

const PDF_ENCRYPTION_MARKERS = ["/Encrypt", "/Standard", "/V 2", "/V 4", "/V 5"];

const isPasswordError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /password/i.test(name) || /password/i.test(message) || /PasswordException/i.test(name);
};

export const isLikelyPasswordProtectedPdf = async (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".pdf") && file.type !== "application/pdf") {
    return false;
  }

  const bytes = await file.slice(0, 65536).arrayBuffer();
  const header = new TextDecoder("latin1").decode(bytes);
  const normalized = header.replace(/\s+/g, " ");

  if (PDF_ENCRYPTION_MARKERS.some((marker) => normalized.includes(marker))) {
    return true;
  }

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data } as any);
    await loadingTask.promise;
    return false;
  } catch (error) {
    return isPasswordError(error);
  }
};

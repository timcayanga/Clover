"use client";

const PDF_ENCRYPTION_MARKERS = ["/Encrypt", "/Standard", "/V 2", "/V 4", "/V 5"];

export const isLikelyPasswordProtectedPdf = async (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".pdf") && file.type !== "application/pdf") {
    return false;
  }

  const bytes = await file.slice(0, 65536).arrayBuffer();
  const header = new TextDecoder("latin1").decode(bytes);
  const normalized = header.replace(/\s+/g, " ");

  return PDF_ENCRYPTION_MARKERS.some((marker) => normalized.includes(marker));
};

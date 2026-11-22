import { createHash } from "node:crypto";
import pdfjsPackage from "pdfjs-dist/package.json";
import tesseractPackage from "tesseract.js/package.json";

// Bump the text revision for changes to PDF decoding, native layout, reader
// routing or OCR composition. Bump the page revision for changes to targeted
// rendering, OCR parameters, or the evidence required to reuse a repaired page.
const textRevision = "pdf-extract-r19";
const pageRevision = "pdf-page-r2";
const readerVersion = `pdfjs-${pdfjsPackage.version}:ocr-${tesseractPackage.version}`;

export function pdfTextCacheVersion(fileName: string, familyVersion: string) {
  // Some institution adapters derive their reader strategy from the name.
  // Hash the normalized hint without persisting the original filename here.
  const nameHint = createHash("sha256").update(fileName.trim().toLowerCase()).digest("hex");
  return `${textRevision}:${readerVersion}:${familyVersion}:${nameHint}`;
}

export function pdfPageOcrCacheVersion(page: number) {
  return `${textRevision}:${pageRevision}:${readerVersion}:page:${page}`;
}

export const pdfRenderCacheVersion = `${textRevision}:${pageRevision}:${readerVersion}`;

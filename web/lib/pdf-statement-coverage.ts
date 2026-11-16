type PdfPageEvidence = { page: number; text: string; imageDigest?: string };

const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
const printedPage = /(?:^|\n)\s*(?:page|halaman|página|seite)\s*[:#.]?\s*(\d{1,3})\s*(?:of|\/|dari|de|von)\s*(\d{1,3})(?=\s|$)/giu;

export function assessPdfStatementCoverage(nativePages: readonly string[], ocrPages: readonly PdfPageEvidence[] = [], selectedText = "", originalLayoutPages = nativePages) {
  const selected = normalize(selectedText);
  const selectedOcr = new Map(ocrPages.filter(page => {
    const text = normalize(page.text);
    return text.length > 0 && selected.includes(text);
  }).map(page => [page.page, page]));
  const selectedNative = nativePages.map(page => {
    const text = normalize(page);
    return text.length > 0 && selected.includes(text);
  });
  const canTraceSelectedText = selectedOcr.size > 0 || selectedNative.some(Boolean);
  const unverifiedPages: number[] = [];
  const duplicatePages: Array<{ original: number; duplicate: number }> = [];
  const seen = new Map<string, number>();
  const sections = new Map<number, number>();
  let inconsistentPagination = false;

  for (const [index, native] of nativePages.entries()) {
    const page = index + 1;
    const ocr = selectedOcr.get(page);
    const text = ocr?.text || native;
    if (!normalize(text) || (canTraceSelectedText && !ocr && !selectedNative[index])) unverifiedPages.push(page);

    // A repeated logo, heading or blank sheet is weak duplicate evidence.
    // Compare transaction-bearing text, or identical rendered ledger pages.
    const normalized = normalize((ocr?.text ?? originalLayoutPages[index] ?? text).replace(printedPage, ""));
    if (normalized.length >= 100 && /\d[.,]\d{2}\b/.test(normalized)) {
      const key = ocr?.imageDigest ? `image:${ocr.imageDigest}` : `text:${normalized}`;
      const first = seen.get(key);
      if (first !== undefined) duplicatePages.push({ original: first, duplicate: page });
      else seen.set(key, page);
    }
    const markers = [...new Set([...text.matchAll(printedPage)].map(match => `${match[1]}/${match[2]}`))];
    if (markers.length > 1) inconsistentPagination = true;
    for (const marker of markers) {
      const [number, total] = marker.split("/").map(Number);
      const start = page - number + 1;
      if (number < 1 || number > total || start < 1 || (sections.has(start) && sections.get(start) !== total)) {
        inconsistentPagination = true;
      } else {
        sections.set(start, total);
      }
    }
  }

  const missingPrintedPages: number[] = [];
  let previousEnd = 0;
  for (const [start, total] of [...sections].sort(([a], [b]) => a - b)) {
    if (start <= previousEnd) inconsistentPagination = true;
    const end = start + total - 1;
    for (let page = Math.max(nativePages.length + 1, start); page <= end; page += 1) missingPrintedPages.push(page);
    previousEnd = end;
  }
  return {
    physicalPageCount: nativePages.length, unverifiedPages, duplicatePages, missingPrintedPages,
    inconsistentPagination,
    complete: nativePages.length > 0 && !unverifiedPages.length && !duplicatePages.length &&
      !missingPrintedPages.length && !inconsistentPagination,
  };
}

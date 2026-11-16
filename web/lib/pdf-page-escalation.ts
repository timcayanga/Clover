export const MAX_PDF_ESCALATION_PAGES = 24;
const NEIGHBOR_LINES = 12;
export type PdfPageEscalation = { page: number; before: string[]; after: string[] };

/** Target an isolated physical page with no readable native text. A sparse
 * page with readable text may be a cover or a real short ledger page. */
export function planPdfPageEscalation(pages: readonly string[]): PdfPageEscalation | null {
  if (pages.length < 3 || pages.length > MAX_PDF_ESCALATION_PAGES) return null;
  const gaps = pages.flatMap((text, index) => text.trim() ? [] : [index]);
  if (gaps.length !== 1) return null;
  const index = gaps[0];
  if (index === 0 || index === pages.length - 1) return null;
  const lines = (text: string) => text.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const before = lines(pages[index - 1]);
  const after = lines(pages[index + 1]);
  if (before.length < 3 || after.length < 3) return null;
  return { page: index + 1, before: before.slice(-NEIGHBOR_LINES), after: after.slice(0, NEIGHBOR_LINES) };
}

/** Assemble a physical range once, even when adjacent extraction batches overlap. */
export function mergePdfPageBatches(
  batches: readonly (readonly { page: number; text: string }[])[],
  firstPage: number,
  lastPage: number,
): string[] | null {
  if (!Number.isInteger(firstPage) || !Number.isInteger(lastPage) || firstPage < 1 || lastPage < firstPage) return null;
  const texts = new Map<number, string>();
  const comparable = (text: string) => text.normalize("NFKC").split(/\r?\n/)
    .map(line => line.trim().replace(/[ \t]+/g, " ")).join("\n");
  for (const batch of batches) {
    for (const { page, text } of batch) {
      if (!Number.isInteger(page) || page < firstPage || page > lastPage) return null;
      const prior = texts.get(page);
      if (prior !== undefined && comparable(prior) !== comparable(text)) return null;
      texts.set(page, prior ?? text);
    }
  }
  if (texts.size !== lastPage - firstPage + 1) return null;
  return Array.from({ length: texts.size }, (_, index) => texts.get(firstPage + index)!);
}

export function mergePdfPageTranscript(pages: readonly string[], plan: PdfPageEscalation, transcript: string): string | null {
  const source = transcript.trim().replace(new RegExp(`^\\[PAGE ${plan.page}\\]\\s*`, "i"), "");
  if (!source || /\[PAGE\s+\d+\]/i.test(source) || pages[plan.page - 1]?.trim() !== "") return null;
  const transactionLines = (text: string) => text.split(/\r?\n/)
    .map(line => line.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase())
    .filter(line => /\d[\d,.]*[.,]\d{2}\s*$/.test(line) && !/^(?:opening|closing|ending|total|balance)\b/.test(line));
  const incoming = transactionLines(source);
  // A copied sequence is overlap evidence. A single repeated purchase can
  // legitimately appear on two distinct physical pages.
  for (const context of [plan.before, plan.after]) {
    const neighbor = transactionLines(context.join("\n"));
    if (incoming.some((line, index) => index > 0 && neighbor.some((other, offset) =>
      offset > 0 && other === line && neighbor[offset - 1] === incoming[index - 1]))) return null;
    if (incoming.length && incoming.length === neighbor.length &&
        incoming.every((line, index) => line === neighbor[index])) return null;
  }
  const existing = pages.flatMap((text, index) => index + 1 === plan.page ? [] : [{ page: index + 1, text }]);
  return mergePdfPageBatches([existing, [{ page: plan.page, text: source }]], 1, pages.length)?.join("\n") ?? null;
}

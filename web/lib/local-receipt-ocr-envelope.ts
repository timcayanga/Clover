// Keep optical evidence separate from reconstructed reading-order text. The
// envelope travels with the existing raw extraction cache/audit trail.
const PREFIX = "[[CLOVER_LOCAL_RECEIPT_OCR_V1]]\n";
const SEPARATOR = "\n[[OCR_TEXT]]\n";
export function encodeLocalReceiptOcr(result: {
  text: string;
  [key: string]: unknown;
}) {
  const { text, ...evidence } = result;
  return `${PREFIX}${JSON.stringify(evidence)}${SEPARATOR}${text}`;
}
export function readLocalReceiptOcrText(source: string): string | null {
  if (!source.startsWith(PREFIX)) return null;
  const index = source.indexOf(SEPARATOR, PREFIX.length);
  return index < 0 ? "" : source.slice(index + SEPARATOR.length);
}

/** Edit the reading text without replacing the original optical evidence. */
export function replaceLocalReceiptOcrText(source: string, text: string) {
  if (!source.startsWith(PREFIX)) return text;
  const index = source.indexOf(SEPARATOR, PREFIX.length);
  return index < 0 ? text : source.slice(0, index + SEPARATOR.length) + text;
}

import { readReconciledItemTable } from "./receipt-item-table";
import { normalizeOpticalTextLines, type OpticalTextLine } from "../../shared/device-text-evidence";

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

/** Source evidence can be retained even when it cannot safely reorder the transcript. */
export function readReceiptOpticalEvidence(source: string): OpticalTextLine[] {
  if (!source.startsWith(PREFIX)) return [];
  const index = source.indexOf(SEPARATOR, PREFIX.length);
  if (index < 0) return [];
  try {
    const evidence = JSON.parse(source.slice(PREFIX.length, index));
    return normalizeOpticalTextLines(evidence?.opticalLines);
  } catch {
    return [];
  }
}

export function readReceiptOpticalLines(source: string): OpticalTextLine[] {
  const text = readLocalReceiptOcrText(source);
  if (!text) return [];
  const lines = readReceiptOpticalEvidence(source);
  const tokens = (value: string) => value.trim().split(/\s+/).sort().join(" ");
  return lines.length && tokens(lines.map(line => line.text).join(" ")) === tokens(text) ? lines : [];
}

/** Only a crop of the same printed block can arbitrate conflicting year digits. */
export function receiptDateDisagreements(lines: OpticalTextLine[]) {
  const date = /^(\d{1,2}[./-]\d{1,2}[./-])(\d{4}|\d{2})$/;
  return lines.flatMap(line => {
    const primary = date.exec(line.text);
    if (!primary) return [];
    const alternatives = (line.alternatives ?? []).filter(candidate => {
      const match = date.exec(candidate.text);
      return match && match[1] === primary[1] && match[2] !== primary[2] && match[2].length === primary[2].length &&
        (line.confidence === undefined || candidate.confidence === undefined || line.confidence - candidate.confidence <= 0.2);
    });
    return alternatives.length ? [{line, candidates:[line.text, ...alternatives.map(entry => entry.text)]}] : [];
  });
}

export function recordReceiptDateCheck(source: string, line: OpticalTextLine, selected: string | null) {
  const text = readLocalReceiptOcrText(source);
  if (!text || text.split(line.text).length !== 2) return source;
  const metadata = JSON.parse(source.slice(PREFIX.length, source.indexOf(SEPARATOR)));
  const replacement = selected ?? "[unclear date]";
  const opticalLines = readReceiptOpticalEvidence(source).map(block =>
    block.text === line.text && block.box.every((v,i) => v === line.box[i])
      ? {text:replacement,box:block.box} : block);
  return encodeLocalReceiptOcr({...metadata, opticalLines,
    dateCheck:{original:line, selected, engine:"tesseract-date-crop"},
    text:text.replace(line.text,replacement)});
}

/** Keep OCR alternatives as source evidence. They cannot replace the primary
 * reading without independent evidence. */
export function hasConflictingReceiptTotalReading(lines: OpticalTextLine[]) {
  const total = /^(?:grand total|total(?: amount| paid| due)?|amount (?:due|paid)|bill amount)\s*[:：]?$/iu;
  const money = /[0-9][0-9,.]*[.,][0-9]{2}$/u;
  const digits = (value: string) => value.replace(/[,.]/g, "").replace(/^0+(?=\d)/, "");
  if (!lines.some(line => line.alternatives?.length || line.characterAlternatives?.length)) return false;
  for (const row of groupReceiptOpticalLines(lines)) {
    const line = row.at(-1)!;
    const prefix = row.slice(0, -1).map(block => block.text).join(" ");
    const primary = line.text.match(money);
    if (!primary || !total.test(`${prefix} ${line.text.slice(0, primary.index)}`.replace(/(?:\b[A-Z]{3}\b|[₱$£€¥])\s*$/u, "").trim())) continue;
    if (line.alternatives?.some(candidate => {
      const alternate = candidate.text.match(money);
      return alternate && digits(alternate[0]) !== digits(primary[0]) &&
        (line.confidence === undefined || candidate.confidence === undefined || line.confidence - candidate.confidence <= 0.2);
    })) return true;
    const startsAt = Array.from(line.text.slice(0, primary.index)).length;
    if (line.characterAlternatives?.some(candidate => candidate.index >= startsAt && /^[0-9OoIlSBZ]$/u.test(candidate.text))) return true;
  }
  return false;
}

/** Use box order for layout decisions while retaining the original OCR text. */
export function readReceiptOpticalLayout(source: string): string {
  const lines = readReceiptOpticalLines(source);
  const text = readLocalReceiptOcrText(source);
  // The recognizer corrects for page skew. Horizontal box grouping can
  // separate every price from its drink on a tilted receipt.
  if (lines.length && text && readReconciledItemTable(text)) return text;
  return lines.length ? orderReceiptOpticalLines(lines) : text ?? source;
}

export function orderReceiptOpticalLines(lines: OpticalTextLine[]): string {
  return groupReceiptOpticalLines(lines).map(row => row.map(line => line.text).join(" ")).join("\n");
}

function groupReceiptOpticalLines(lines: OpticalTextLine[]): OpticalTextLine[][] {
  const center = ({ box }: OpticalTextLine) => (box[1] + box[3]) / 2;
  const sorted = [...lines].sort((a, b) => center(a) - center(b) || a.box[0] - b.box[0]);
  const rows: OpticalTextLine[][] = [];
  for (const line of sorted) {
    const row = rows.at(-1);
    const first = row?.[0];
    if (row && first &&
        Math.abs(center(first) - center(line)) < Math.min(first.box[3] - first.box[1], line.box[3] - line.box[1]) * 0.4 &&
        row.every(other => other.box[2] <= line.box[0] || line.box[2] <= other.box[0])) {
      row.push(line);
    } else {
      rows.push([line]);
    }
  }
  return rows.map(row => row.sort((a, b) => a.box[0] - b.box[0]));
}

/** Apply same-image spelling evidence only to proposed purchase descriptions.
 * Keep the original transcript, dates, account identifiers and amounts intact. */
export function receiptWordReplacements(source: string) {
  const replacements = new Map<string, string>();
  if (!source.startsWith(PREFIX)) return replacements;
  const end = source.indexOf(SEPARATOR, PREFIX.length);
  if (end < 0 || !source.slice(PREFIX.length, end).includes('"itemWordCorrections":')) return replacements;
  let suggestions: unknown;
  try {
    const metadata = JSON.parse(source.slice(PREFIX.length, end));
    if (metadata.engine !== "ppocr-v5-local") return replacements;
    suggestions = metadata.itemWordCorrections;
  } catch {
    return replacements;
  }
  if (!Array.isArray(suggestions) || suggestions.length > 300) return replacements;
  for (const entry of suggestions) {
    if (typeof entry?.original !== "string" || typeof entry.corrected !== "string" || entry.original.length > 200 ||
        !/^[\p{L} '&.,()’/-]+$/u.test(entry.original) || !/^[\p{L} '&.,()’/-]+$/u.test(entry.corrected) ||
        (entry.original.length !== entry.corrected.length &&
         (Math.abs(entry.original.length - entry.corrected.length) !== 1 ||
          entry.original.replaceAll(" ", "").toLowerCase() !== entry.corrected.replaceAll(" ", "").toLowerCase()))) continue;
    // Conflicting suggestions for the same printed phrase must go to review.
    replacements.set(entry.original, replacements.has(entry.original) && replacements.get(entry.original) !== entry.corrected ? "" : entry.corrected);
  }
  return replacements;
}

export function refineReceiptItemWords<T extends { description: string }>(source: string, items: T[]) {
  if (!items.length) return items;
  const replacements = receiptWordReplacements(source);
  if (!replacements.size) return items;
  return items.map(item => {
    const padded = " " + item.description + " ";
    for (const [original, corrected] of replacements) {
      if (corrected && padded.includes(" " + original + " ")) {
        return { ...item, description: padded.replace(" " + original + " ", " " + corrected + " ").trim() };
      }
    }
    return item;
  });
}

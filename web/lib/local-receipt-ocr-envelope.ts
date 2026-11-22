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

export function recordReceiptTableCrop(source: string, original: string, replacement: string, bounds: number[], crop: string[], kind: "priceCrop" | "countedQuantityCrop" = "priceCrop") {
  const text = readLocalReceiptOcrText(source);
  if (!text || text.split(original).length !== 2) return source;
  const metadata = JSON.parse(source.slice(PREFIX.length, source.indexOf(SEPARATOR)));
  return encodeLocalReceiptOcr({ ...metadata, [kind]: { original, bounds, crop }, text: text.replace(original, () => replacement) });
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

export function readReceiptOpticalLines(source: string, lines = readReceiptOpticalEvidence(source)): OpticalTextLine[] {
  const text = readLocalReceiptOcrText(source);
  if (!text) return [];
  const tokens = (value: string) => value.trim().split(/\s+/).sort().join(" ");
  return lines.length && tokens(lines.map(line => line.text).join(" ")) === tokens(text) ? lines : [];
}

/** A text box may contain a date, its label, and a time on the same line. */
export function singleReceiptDate(text: string) {
  const tokens = text.match(/(?<![\w./-])(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:\d{4}|\d{2}))(?![\w./-])/g);
  return tokens?.length === 1 ? tokens[0] : null;
}

export function receiptDateDisagreements(lines: OpticalTextLine[]) {
  return lines.flatMap(line => {
    if (!line.alternatives?.length) return [];
    const primary = singleReceiptDate(line.text);
    if (!primary) return [];
    const candidates = new Set([primary]);
    for (const alternative of line.alternatives) {
      if (line.confidence !== undefined && alternative.confidence !== undefined &&
          line.confidence - alternative.confidence > 0.2) continue;
      const token = singleReceiptDate(alternative.text);
      if (token && token.replace(/\d/g, "#") === primary.replace(/\d/g, "#")) candidates.add(token);
    }
    return candidates.size > 1 ? [{line, candidates:[...candidates]}] : [];
  });
}

export function recordReceiptDateCheck(source: string, line: OpticalTextLine, selected: string | null) {
  const text = readLocalReceiptOcrText(source);
  const primary = singleReceiptDate(line.text);
  if (!primary || !text || text.split(line.text).length !== 2) return source;
  const metadata = JSON.parse(source.slice(PREFIX.length, source.indexOf(SEPARATOR)));
  const replacement = line.text.replace(primary, selected ?? "[unclear date]");
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
  const total = /^(?:grand total|total(?: amount| paid| due)?|amount (?:due|paid|to pay)|bill (?:amount|total)|합계|결제금액|총액|total bayar|jumlah bayar)\s*[:：]?$/iu;
  const money = /(?<![\d.,])\d+(?:[., \u00a0\u202f]\d{3})*(?:[.,]\d{2})?(?=\s*(?:[A-Z]{3}|[₱$£€¥₩원])?\s*$)/u;
  const cents = (value: string) => {
    const digits = value.replace(/[,.\s]/g, "");
    return (/[.,]\d{2}$/.test(value) ? digits : digits + "00").replace(/^0+(?=\d)/, "");
  };
  if (!lines.some(line => line.alternatives?.length || line.characterAlternatives?.length)) return false;
  for (const row of groupReceiptOpticalLines(lines)) {
    // A till can print the currency after the amount, in its own box.
    const last = row.length - 1;
    const at = /^(?:[A-Z]{3}|[₱$£€¥₩원])$/u.test(row[last].text.trim()) ? last - 1 : last;
    if (at < 0) continue;
    const line = row[at];
    const prefix = row.slice(0, at).map(block => block.text).join(" ");
    const primary = line.text.match(money);
    if (!primary) continue;
    const label = `${prefix} ${line.text.slice(0, primary.index)}`.trim();
    // DUE is part of an amount label and can also look like a currency code.
    if (!total.test(label) && !total.test(label.replace(/(?:\b[A-Z]{3}\b|[₱$£€¥₩원])$/u, "").trim())) continue;
    if (line.alternatives?.some(candidate => {
      const alternate = candidate.text.match(money);
      return alternate && cents(alternate[0]) !== cents(primary[0]) &&
        (line.confidence === undefined || candidate.confidence === undefined || line.confidence - candidate.confidence <= 0.2);
    })) return true;
    const startsAt = Array.from(line.text.slice(0, primary.index)).length;
    if (line.characterAlternatives?.some(candidate => candidate.index >= startsAt && candidate.index < startsAt + primary[0].length && /^[0-9OoIlSBZ]$/u.test(candidate.text))) return true;
  }
  return false;
}

/** Use box order for layout decisions while retaining the original OCR text. */
export function readReceiptOpticalLayout(source: string, lines = readReceiptOpticalLines(source)): string {
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

function isSingleReceiptTextGap(original: string, corrected: string) {
  const shorter = (original.length < corrected.length ? original : corrected).toLowerCase();
  const longer = (original.length < corrected.length ? corrected : original).toLowerCase();
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  return (longer[i] === " " || /^[a-z]{3}$/.test(longer.slice(Math.max(0, i - 1), i + 2))) &&
    longer.slice(i + 1) === shorter.slice(i);
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
          !isSingleReceiptTextGap(entry.original, entry.corrected)))) continue;
    // Conflicting suggestions for the same printed phrase must go to review.
    replacements.set(entry.original, replacements.has(entry.original) && replacements.get(entry.original) !== entry.corrected ? "" : entry.corrected);
  }
  return replacements;
}

export function refineReceiptItemWords<T extends { description: string }>(source: string, items: T[]) {
  if (!items.length) return items;
  const replacements = receiptWordReplacements(source);
  if (!replacements.size) return items;
  const phrases = [...replacements.keys()].filter(phrase => replacements.get(phrase))
    .sort((a, b) => b.length - a.length);
  if (!phrases.length) return items;
  // Escape the punctuation allowed in OCR phrases. Match the original once so
  // a correction cannot become the input to a second correction.
  const escaped = phrases.map(phrase => phrase.replace(/[().]/g, "\\$&"));
  const pattern = new RegExp(`(?<!\\S)(?:${escaped.join("|")})(?!\\S)`, "gu");
  return items.map(item => {
    const description = item.description.replace(pattern, phrase => replacements.get(phrase)!);
    return description === item.description ? item : { ...item, description };
  });
}

// Preserve the original transcript and the independently read region. Only
// the verified purchase rows get additional quantity digits in the reading.
export function recordReceiptQuantityCrop(source: string, rows: Map<string, OpticalTextLine>, bounds: number[]) {
  const original = readLocalReceiptOcrText(source);
  if (!original || !rows.size) return source;
  const metadata = JSON.parse(source.slice(PREFIX.length, source.indexOf(SEPARATOR)));
  const text = original.split("\n").map(line => {
    const digit = rows.get(line.trim());
    return digit ? digit.text + " " + line : line;
  }).join("\n");
  return encodeLocalReceiptOcr({ ...metadata, text, opticalLines: [...metadata.opticalLines, ...rows.values()],
    quantityCrop: { original, bounds } });
}

type MarginReading = { description: string; amount: string; digit: OpticalTextLine };

export function recordVerifiedMarginReadings(source: string, readings: MarginReading[], bounds: number[]) {
  const text = readLocalReceiptOcrText(source);
  if (!text) return source;
  const metadata = JSON.parse(source.slice(PREFIX.length, source.indexOf(SEPARATOR)));
  return encodeLocalReceiptOcr({ ...metadata, verifiedQuantityMargin: { readings, bounds }, text });
}

export function applyVerifiedMarginReadings<T extends {description:string; amount:string | null; quantity?:number | null}>(
  source: string, items: T[],
): T[] {
  if (!source.startsWith(PREFIX) || !source.includes('"verifiedQuantityMargin":')) return items;
  try {
    const meta = JSON.parse(source.slice(PREFIX.length, source.indexOf(SEPARATOR)));
    const readings = meta.verifiedQuantityMargin?.readings;
    if (meta.engine !== "ppocr-v5-local" || !Array.isArray(readings) || readings.length > 40) return items;
    return items.map(item => {
      if (item.quantity != null || items.filter(i => i.description === item.description && i.amount === item.amount).length !== 1) return item;
      const matches = readings.filter(r => r?.description === item.description && r.amount === item.amount);
      const digit = matches.length === 1 && matches[0].digit;
      return digit && /^[1-9]$/.test(digit.text) && digit.minimumCharacterConfidence >= 0.9
        ? { ...item, quantity: Number(digit.text) } : item;
    });
  } catch {
    return items;
  }
}

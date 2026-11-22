import { orderReceiptOpticalLines, readLocalReceiptOcrText, readReceiptOpticalLines } from "./local-receipt-ocr-envelope";
import { isLocalizedReceiptAmountLine, isLocalizedReceiptHeading } from "./localized-receipt-cues";
import type { OpticalTextLine } from "../../shared/device-text-evidence";

const heading = /^(?:(?:official|sales|cash|purchase)\s+)?receipt(?:\s+(?:no\.?|number|#)\s*[:#]?\s*[\w-]+)?$/i;
const total = /^(?:grand total|total(?: amount| paid| due)?|bill (?:amount|total)|amount (?:due|paid|to pay))\s*[:：]?\s*(?:[A-Z]{3}\s*|[₱$€£¥]\s*)?\d[\d,.]*(?:\s*(?:[A-Z]{3}|[₱$€£¥]))?$/i;
const isHeading = (line: string) => heading.test(line) || isLocalizedReceiptHeading(line);

export function findReceiptImageRegion(source: string, lines = readReceiptOpticalLines(source)) {
  const headings = lines.filter(line => isHeading(line.text));
  // A single clearly separated candidate can be read on its own.
  if (headings.length !== 1) return null;
  const anchor = headings[0].box;
  const toBottom = lines.filter(({ box }) => box[1] >= anchor[1] && box[1] - anchor[1] <= 0.48 &&
    box[0] < anchor[2] + 0.22 && box[2] > anchor[0] - 0.04);
  const totals = toBottom.filter(line => total.test(line.text) || isLocalizedReceiptAmountLine(line.text));
  if (totals.length !== 1) return null;
  const settlement = totals[0].box;
  const left = Math.max(0, Math.min(anchor[0], settlement[0]) - 0.025);
  const right = Math.min(1, Math.max(anchor[2], settlement[2]) + 0.10);
  const top = Math.max(0, anchor[1] - 0.08);
  const bottom = Math.min(1, settlement[3] + 0.09);
  if ((right - left) * (bottom - top) > 0.21) return null;

  const inside = ({ box }: OpticalTextLine) =>
    box[0] >= left && box[2] <= right && box[1] >= top && box[3] <= bottom;
  const region = lines.filter(inside);
  const outside = lines.filter(({ box }) =>
    box[2] < left - 0.015 || box[0] > right + 0.015 || box[3] < top - 0.015 || box[1] > bottom + 0.015);
  // A box crossing the boundary could be another line on the receipt.
  if (region.length < 4 || outside.length < 2 || region.length + outside.length !== lines.length ||
      outside.some(line => isHeading(line.text) || total.test(line.text) || isLocalizedReceiptAmountLine(line.text))) return null;
  return { text: orderReceiptOpticalLines(region), bounds: [left, top, right, bottom], opticalLines: region };
}


const documentHeading = (line: string) => isHeading(line) ||
  /^(?:sales|tax) invoice(?:\s+(?:no\.?|number|#)\s*[:#]?\s*[\w-]+)?$/iu.test(line);
const receiptId = /^(?:(?:official|sales)\s+)?(?:receipt|(?:sales |tax )?invoice|order)\s*(?:no\.?|number|#)\s*[:#]?\s*([\p{L}\d-]*\d[\p{L}\d-]*)/iu;
const receiptDate = /\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/u;

function receiptSection(lines: string[]) {
  if (!lines.some(line => total.test(line) || isLocalizedReceiptAmountLine(line))) return null;
  const identity = lines.map(line => line.match(receiptId)?.[1]?.toLowerCase()).find(Boolean);
  const date = lines.map(line => line.match(receiptDate)?.[0]).find(Boolean);
  const items = lines.filter(line => !documentHeading(line) && !receiptId.test(line) && !receiptDate.test(line) &&
    !/^(?:sub\s*total|total|grand total|amount|tax|vat|cash|change|card|payment|balance|tip|discount)\b/iu.test(line) &&
    /\p{L}/u.test(line) && /\d[\d,.]*[.,]\d{2}$/u.test(line));
  return identity || date || items.length ? { identity, date, items: items.join("\n").toLowerCase() } : null;
}

function distinctReceiptSections(left: string[], right: string[]) {
  const a = receiptSection(left), b = receiptSection(right);
  if (!a || !b) return false;
  // Merchant and customer copies can repeat the same header and settlement.
  if (a.identity && b.identity) return a.identity !== b.identity;
  return Boolean((a.date && b.date && a.date !== b.date) || (a.items && b.items && a.items !== b.items));
}

/** Detect separation before reading-order reconstruction can fold side-by-side receipts together. */
export function detectMultipleReceipts(source: string, optical = readReceiptOpticalLines(source)): { layout: "side_by_side" | "sequential" } | null {
  const headers = optical.filter(line => documentHeading(line.text)).sort((a, b) => a.box[0] - b.box[0]);
  for (const [index, left] of headers.entries()) {
    for (const right of headers.slice(index + 1)) {
      if (right.box[0] - left.box[2] < 0.03) continue;
      const height = Math.max(left.box[3] - left.box[1], right.box[3] - right.box[1]);
      if (Math.abs(left.box[1] - right.box[1]) > Math.max(0.12, height * 3)) continue;
      const divider = (left.box[2] + right.box[0]) / 2;
      const linesInColumn = (side: "left" | "right") => orderReceiptOpticalLines(optical.filter(({ box }) =>
        side === "left" ? box[2] <= divider : box[0] >= divider)).split("\n");
      if (distinctReceiptSections(linesInColumn("left"), linesInColumn("right"))) return { layout: "side_by_side" };
    }
  }
  const layout = optical.length ? orderReceiptOpticalLines(optical) : readLocalReceiptOcrText(source) ?? source;
  const lines = layout.normalize("NFKC").split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  const starts = lines.flatMap((line, index) => documentHeading(line) ? [index] : []);
  // A title followed by a separate receipt-number line is one header. Check
  // completed sections only so the title does not hide the next document.
  const sections = starts.map((start, index) => lines.slice(start, starts[index + 1])).filter(section => receiptSection(section));
  for (let index = 1; index < sections.length; index++) {
    if (distinctReceiptSections(sections[index - 1], sections[index])) {
      return { layout: "sequential" };
    }
  }
  return null;
}

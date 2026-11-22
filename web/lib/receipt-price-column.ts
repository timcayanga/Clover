import type { OpticalTextLine } from "../../shared/device-text-evidence";
import { readPartialPriceColumn } from "./receipt-item-table";

// Recover a bounded run of purchases only when the full page already shows
// isolated names, two legible prices, an incomplete price column and a subtotal.
export function locateDamagedReceiptPrices(text: string, blocks: OpticalTextLine[]) {
  if (!readPartialPriceColumn(text)) return null;
  const lines = text.split(/\r?\n/);
  const end = lines.findIndex((line) => /^sub[ -]?total\s*[:：]?\s+\d[\d,]*\.\d{2}$/i.test(line.trim()));
  const rows: { name: string; price?: string; box: OpticalTextLine["box"] }[] = [];
  for (let i = end - 1; i >= 0; i--) {
    const row = lines[i].trim().match(/^(\p{L}[\p{L} ’'&/().,-]+?)(?:\s+(\d[\d,]*\.\d{1,2}))?$/u);
    if (!row) break;
    const matches = blocks.filter((b) => b.text === row[1]);
    if (matches.length !== 1 || rows.length >= 20) return null;
    rows.unshift({ name: row[1], price: row[2], box: matches[0].box });
  }
  if (rows.length < 4 || rows.some((r, i) => i > 0 && r.box[1] <= rows[i - 1].box[1])) return null;
  const top = rows[0].box[1],
    bottom = rows[rows.length - 1].box[3];
  const height = (bottom - top) / rows.length;
  const nameEnd = Math.max(...rows.map((r) => r.box[2]));
  const prices = blocks.filter(
    (b) =>
      /^\d[\d,]*\.\d{1,2}$/.test(b.text) &&
      b.box[0] > nameEnd &&
      b.box[1] >= top - height &&
      b.box[3] <= bottom + height,
  );
  if (prices.length < 2) return null;
  const bounds = [
    Math.max(0, Math.min(...rows.map((r) => r.box[0])) - 3 * height),
    Math.max(0, top - height),
    Math.min(1, Math.max(...prices.map((p) => p.box[2])) + 2 * height),
    Math.min(1, bottom + height * 0.4),
  ];
  const protectedPrices = rows.map(
    (r) =>
      Boolean(r.price) &&
      prices.some(
        (b) =>
          b.text === r.price &&
          Math.abs((b.box[1] + b.box[3] - r.box[1] - r.box[3]) / 2) < height / 2 &&
          b.box[3] - b.box[1] <= 2 * height,
      ),
  );
  return {
    rows,
    protectedPrices,
    bounds,
    subtotal: lines[end].trim().match(/\d[\d,]*\.\d{2}$/)![0],
    original: lines.slice(end - rows.length, end).join(text.includes("\r\n") ? "\r\n" : "\n"),
  };
}

type PriceColumn = NonNullable<ReturnType<typeof locateDamagedReceiptPrices>>;

function alignCropRows(plan: PriceColumn, crop: string) {
  const lines = crop
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: { name: string; price?: string }[] = [];
  for (const [i, line] of lines.entries()) {
    const row = plan.rows[rows.length];
    if (!row) {
      if (/^sub[ -]?total\b/i.test(line)) break;
      if (/\p{L}.*\d$/u.test(line)) return null;
      continue;
    }
    const name = line.replace(/\s+[\d,. ]+$/, "");
    const a = row.name.toLowerCase(),
      b = name.toLowerCase();
    if (
      a.length !== b.length ||
      [...a].filter((c, j) => c !== b[j]).length > Math.min(2, Math.floor(a.length / 5))
    ) {
      if ((rows.length && /\p{L}/u.test(line)) || /^\p{L}.*\s\d[\d,.]*$/u.test(line)) return null;
      continue;
    }
    const printed = line
      .slice(name.length)
      .trim()
      .match(/^(\d+(?:,\d{3})*)\s*\.\s*(\d{2})$/);
    // A floating numeric fragment may be the missing part of this price.
    const price =
      printed && !/^[\d., ]+$/.test(lines[i + 1] ?? "")
        ? printed[1].replace(/,/g, "") + "." + printed[2]
        : undefined;
    rows.push({ name, price });
  }
  return rows.length === plan.rows.length ? rows : null;
}

export function recoverReceiptPrices(plan: PriceColumn, crops: string[]) {
  const readings = crops.map((crop) => alignCropRows(plan, crop)).filter((rows) => rows !== null);
  if (!readings.length) return null;
  const printedWords = new Set(plan.rows.flatMap((row) => row.name.toLowerCase().split(/\s+/)));
  const recovered: string[] = [];
  let cents = 0;
  for (const [i, row] of plan.rows.entries()) {
    const candidates = new Set(readings.map((rows) => rows[i].price).filter((price) => price !== undefined));
    if (plan.protectedPrices[i] && row.price) {
      const [whole, fraction] = row.price.replace(/,/g, "").split(".");
      candidates.add(whole + "." + fraction.padEnd(2, "0"));
    }
    if (candidates.size !== 1) return null;
    const [price] = candidates;
    const value = Number(price.replace(".", ""));
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    cents += value;
    const name = row.name
      .split(/\s+/)
      .map((word, j) => {
        const observed = readings[0][i].name.split(/\s+/)[j];
        if (
          readings.length < 2 ||
          !observed ||
          !printedWords.has(observed.toLowerCase()) ||
          !/^\p{L}+$/u.test(word) ||
          word.length !== observed.length ||
          [...word.toLowerCase()].filter((c, k) => c !== observed.toLowerCase()[k]).length !== 1
        )
          return word;
        return readings.every((rows) => rows[i].name.split(/\s+/)[j] === observed) ? observed : word;
      })
      .join(" ");
    recovered.push(name + " " + price);
  }
  return cents === Number(plan.subtotal.replace(/[,.]/g, "")) ? recovered.join("\n") : null;
}

import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";

const codes = new Set(Intl.supportedValuesOf("currency"));
export function isReceiptCurrencyCode(value: string) {
  return codes.has(value) && value !== "XXX" && value !== "ALL";
}

const marks: Record<string, string> = {
  "₱": "PHP", "PHP": "PHP", "US$": "USD", "HK$": "HKD", "S$": "SGD",
  "A$": "AUD", "NZ$": "NZD", "C$": "CAD", "NT$": "TWD",
  "RUPIAH": "IDR", "PESO FILIPINO": "PHP", "€": "EUR", "£": "GBP", "฿": "THB", "₩": "KRW", "원": "KRW", "₫": "VND",
  "₹": "INR", "RP": "IDR", "RM": "MYR", "円": "JPY", "元": "CNY",
};
const token = /(?<![\p{L}])(?:(?:US|HK|NZ|NT|S|A|C)\$|(?:rupiah|peso filipino|[A-Z]{3}|Rp\.?|RM)(?![\p{L}])|[₱$€£฿₩원₫₹¥円元])/giu;
const saleTotal = /^(?:bill\s+amount|grand\s+total|bill\s+total|total(?:\s+(?:amount|paid|due|bayar))?|amount\s+(?:due|paid|to\s+pay)|sale\s+amount|jumlah\s+bayar|合計|결제금액|합\s*계)(?=$|[\s:：=\d₱$€£฿₩₫₹¥])/iu;
const declaredCurrency = /^\s*(?:(?:sale|transaction|purchase|receipt)\s+)?currency\s*[:：=]/iu;
const secondaryAmount = /^(?:\W*\b(?:cash|change|tender(?:ed)?|card(?: payment)?|payment(?:\s+(?:amount|currency))?|refund|settlement|dcc|conversion|exchange rate|equivalent|converted|balance|promo(?:tion)?|coupon|voucher|rewards?)\b)|^(?:points?\s+(?:earned|balance)|(?:amount|total)\s+(?:in|converted))\b/iu;
const dollarRegions = new Set(["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "TWD"]);
const yenRegions = new Set(["JPY", "CNY"]);

function currencyMarks(line: string, allowBareMark: boolean, region: string | null) {
  const matches = new Map<string, string>();
  for (const match of line.matchAll(token)) {
    const raw = match[0];
    const before = line.slice(0, match.index);
    const after = line.slice(match.index + raw.length);
    if (!allowBareMark && !/\d\s*$/u.test(before) && !/^\s*\d/u.test(after)) continue;
    const cleaned = raw.replace(/\.$/u, "").toUpperCase();
    // Uppercase ISO codes on generic rows avoid interpreting part of an
    // item name as a currency (e.g. "try 10"). Labelled totals accept OCR case.
    const acceptableCode = allowBareMark || raw === cleaned;
    let currency = marks[cleaned] ?? (acceptableCode && isReceiptCurrencyCode(cleaned) ? cleaned : null);
    if (raw === "$" && region && dollarRegions.has(region)) currency = region;
    if (raw === "¥" && region && yenRegions.has(region)) currency = region;
    if (currency) matches.set(currency, raw);
  }
  return matches;
}

const regions: [string, RegExp][] = [
  ["PHP", /\bPhilippines\b|\bCity of (?:Makati|Mandaluyong|Taguig|Pasig|Quezon|Cebu|Davao)\b|\b(?:Makati|Mandaluyong|Taguig|Pasig|Quezon|Cebu|Davao)\s+City\b|\bBIR\b.{0,50}\b(?:permit|accr(?:ed(?:itation)?)?|TIN)\b/i],
  ["IDR", /\bIndonesia\b|\b(?:Jakarta|Surabaya|Bandung|Denpasar)\b.{0,60}\b\d{5}\b/i],
  ["KRW", /\b(?:South Korea|Republic of Korea)\b|(?:서울|부산|인천|대구|대전|광주|울산)(?:특별시|광역시)|대한민국/u],
  ["SGD", /\bSingapore\s+\d{6}\b/i],
  ["MYR", /\bMalaysia\b/i], ["THB", /\bThailand\b/i],
  ["VND", /\bViet\s*Nam\b/i], ["JPY", /\bJapan\b|日本国/u],
  ["HKD", /\bHong Kong\b/i], ["AUD", /\bAustralia\b/i], ["CAD", /\bCanada\b/i],
  ["CNY", /\b(?:mainland China|People.s Republic of China)\b|中华人民共和国/u],
  ["TWD", /\bTaiwan\b/i],
  ["NZD", /\bNew Zealand\b/i], ["GBP", /\bUnited Kingdom\b/i],
  ["USD", /\bUnited States(?: of America)?\b/i],
];

/** Strong printed location clues suggest a currency, never rewrite source text.
 * Conflicting regions deliberately fall back to the user's preference. */
export function receiptLocationCandidates(text: string) {
  const source = text.normalize("NFKC");
  const matches = regions.flatMap(([currency, pattern]) => {
    const match = source.match(pattern);
    return match ? [{ currency, evidence: match[0] }] : [];
  });
  return matches;
}

export function inferReceiptLocationCurrency(text: string) {
  const matches = receiptLocationCandidates(text);
  return matches.length === 1 ? matches[0] : null;
}

/** Purchase total and declared transaction currency outrank currencies on line items or tender. */
export function readPrintedReceiptCurrency(text: string, region: string | null = null) {
  const { body } = splitReceiptPromotionalFooter(text.normalize("NFKC"));
  const primary = new Map<string, string>();
  const amounts = new Map<string, string>();
  const lines = body.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    if (secondaryAmount.test(line)) continue;
    // Currency units above a printed price column also survive OCR as a
    // separate line. Require a financial column heading adjacent to the unit.
    const previousLine = lines[index - 1] ?? "";
    const amountTaxHeader = /^tax code\s*%?$/i.test(previousLine) ? lines[index - 2] ?? "" : previousLine;
    const pairedUnits = /^\(RM\)\s+\(RM\)$/i.test(line) &&
      /\b(?:amount|amt)\s+tax\s*$/i.test(amountTaxHeader);
    if (pairedUnits || /\b(?:amount|amt|price)[ \t]*\(RM\)(?=$|\s)/i.test(line) ||
        (/^\(RM\)$/i.test(line) && /\b(?:amount|amt|price)\s*$/i.test(lines[index - 1] ?? ""))) {
      amounts.set("MYR", "(RM)");
    }
    const match = line.match(saleTotal) ?? line.match(declaredCurrency);
    if (match) {
      const value = line.slice(match[0].length).replace(/^\s*[:：=]\s*/u, "");
      const next = lines[index + 1] ?? "";
      const wrapped = /^[\s:：=]*$/u.test(value) && !secondaryAmount.test(next) && !saleTotal.test(next);
      const amountText = (wrapped ? next : value).trim();
      // The plain P glyph is ambiguous outside a peso-denominated receipt.
      // Require a printed Philippine location on this document as well.
      if (/^P[ \t]*\d[\d,]*\.\d{2}$/u.test(amountText) && inferReceiptLocationCurrency(body)?.currency === "PHP") {
        primary.set("PHP", "P");
      }
      for (const [currency, evidence] of currencyMarks(amountText, true, region)) {
        primary.set(currency, evidence);
      }
      continue;
    }
    for (const [currency, evidence] of currencyMarks(line, false, region)) amounts.set(currency, evidence);
  }
  const candidates = primary.size ? primary : amounts;
  if (candidates.size > 1) return { kind: "conflict" as const, currencies: [...candidates.keys()].sort() };
  const entry = candidates.entries().next().value;
  return entry ? { kind: "printed" as const, currency: entry[0], evidence: entry[1] } : null;
}

type ReceiptCurrencyCandidate = {
  currency: string | null;
  currency_source_text?: string | null;
  confidence_score: number;
  parser_evidence: { page?: number | null; source_text?: string | null; reason: string };
};

export function hasRegionalReceiptCurrencyEvidence(currency: string | null, text: string) {
  if (currency === "KRW") return /\bKRW\b|[₩￦]|\d[\d,.\s]*원(?=$|[\s).,])/iu.test(text);
  // An isolated Rp token without its printed amount is incomplete evidence.
  // Requiring the monetary context also rejects symbols appended by inference.
  if (currency === "IDR") return /\b(?:IDR|rupiah)\b|\bRp\.?[ \t]*\d/iu.test(text);
  return true;
}

// Model confidence is not proof of a currency. Enforce the regional evidence
// contract before creating rows; the unmodified model response stays in audit.
export function enforceRegionalReceiptCurrencyEvidence<T extends ReceiptCurrencyCandidate>(details: T): T {
  const evidence = [details.currency_source_text, details.parser_evidence.source_text].filter(Boolean).join("\n");
  if (hasRegionalReceiptCurrencyEvidence(details.currency, evidence)) return details;
  return { ...details, currency: null,
    confidence_score: Math.min(details.confidence_score, details.confidence_score <= 1 ? .5 : 50),
    parser_evidence: { ...details.parser_evidence,
      reason: `${details.parser_evidence.reason} Currency requires review: no quoted currency evidence.` },
  };
}

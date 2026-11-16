import { splitReceiptPromotionalFooter } from "./receipt-promotional-footer";
type ReceiptDateDetails = {
  transaction_date: string | null;
  receipt_type?: string | null;
  parser_evidence?: {
    source_text?: string | null;
  } | null;
};

type ReceiptDateContext = {
  referenceDate?: Date | string | null;
  sourceLocale?: string | null;
};

const monthIndexes = new Map<string, number>(
  [
    ["jan", 1], ["january", 1], ["feb", 2], ["february", 2], ["mar", 3], ["march", 3],
    ["apr", 4], ["april", 4], ["may", 5], ["jun", 6], ["june", 6], ["jul", 7], ["july", 7],
    ["aug", 8], ["august", 8], ["sep", 9], ["sept", 9], ["september", 9], ["oct", 10],
    ["october", 10], ["nov", 11], ["november", 11], ["dec", 12], ["december", 12],
  ] as const
);

const toIsoDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const getExplicitEvidenceDates = (sourceText: string) => {
  const dates = new Set<string>();
  const add = (year: number, month: number, day: number) => {
    const iso = toIsoDate(year, month, day);
    if (iso) dates.add(iso);
  };

  for (const match of sourceText.matchAll(/\b(20\d{2})\s*(?:[-/.]|年)\s*(\d{1,2})\s*(?:[-/.]|月)\s*(\d{1,2})(?:日)?\b/g)) {
    add(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  for (const match of sourceText.matchAll(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(20\d{2}|\d{2})\b/g)) {
    const left = Number(match[1]);
    const right = Number(match[2]);
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    add(year, left, right);
    if (left !== right) add(year, right, left);
  }
  for (const match of sourceText.matchAll(/\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/gi)) {
    const month = monthIndexes.get(match[1].toLowerCase());
    if (month) add(Number(match[3]), month, Number(match[2]));
  }
  for (const match of sourceText.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[,]?\s+(20\d{2})\b/gi)) {
    const month = monthIndexes.get(match[2].toLowerCase());
    if (month) add(Number(match[3]), month, Number(match[1]));
  }

  return Array.from(dates);
};

const purchaseDateLabel = /\b(?:purchase|transaction|sale|order)\s+(?:date(?:\s*(?:and|\/|&)\s*time)?|time|timestamp)\b|\b(?:purchased|sold)\s+(?:on|at)\b/iu;
const otherDateLabel = /\b(?:re\s*-?\s*printed|printed|expires|validity|promo expiry)(?=\s*[:：])|\b(?:(?:re\s*-?\s*print(?:ed)?|print(?:ed)?|payment|settlement|posting|posted|terminal(?: local)?|authorization|authorisation|processing|expiry|expiration|due|invoice)\s+(?:date(?:\s*(?:and|\/|&)\s*time)?|time|timestamp)|(?:re\s*-?\s*printed|printed|paid|settled|posted|authorized|authorised)\s+(?:on|at)|valid\s+(?:until|through|thru|to)|(?:offer|promo(?:tion)?|coupon|voucher)\s+expires|expires(?:\s+on)?|date\s+issued|date\s+of\s+birth)\b/iu;
const ordinaryDateLabel = /\b(?:date(?:\s*(?:and|\/|&)\s*time)?)\s*[:：]/iu;
const dateLabels = new RegExp(
  [purchaseDateLabel, otherDateLabel, ordinaryDateLabel].map(pattern => pattern.source).join("|"), "giu",
);

export function resolveReceiptPurchaseDateRoles(source: string): { date: string | null } | null {
  const { body, footer } = splitReceiptPromotionalFooter(source.normalize("NFKC"));
  const primary = new Set<string>();
  const ordinary = new Set<string>();
  const invoiceDates = new Set<string>();
  const distinctOrdinary = new Set<string>();
  const lines = body.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  const invoiceHeading = lines.slice(0, 12).some(line => /^(?:(?:sales|tax|vat|official)\s+)?invoice\s*$/iu.test(line));
  let hasPurchaseLabel = false;
  let hasSeparatedRole = Boolean(footer && getExplicitEvidenceDates(footer).length);
  let pendingLabel = "";
  for (const [index, line] of lines.entries()) {
    if (/\b(?:accred(?:itation)?|printer permit|validity|PTU[N]?)\b/i.test(line) && !purchaseDateLabel.test(line)) {
      hasSeparatedRole ||= getExplicitEvidenceDates(line).length > 0;
      pendingLabel = "date issued";
      continue;
    }
    const labels = [...line.matchAll(dateLabels)];
    const segments = [{ label: pendingLabel, text: line.slice(0, labels[0]?.index ?? line.length) },
      ...labels.map((match, index) => ({
        label: match[0],
        text: line.slice(match.index + match[0].length, labels[index + 1]?.index),
      }))];
    pendingLabel = "";
    for (const { label, text } of segments) {
      const excluded = otherDateLabel.test(label);
      const explicit = purchaseDateLabel.test(label);
      hasSeparatedRole ||= excluded || explicit;
      const dates = getExplicitEvidenceDates(text);
      if (label && !dates.length && /^[\s:：-]*$/u.test(text)) pendingLabel = label;
      hasPurchaseLabel ||= explicit;
      const invoiceIssue = invoiceHeading && /^(?:date issued|invoice date)$/iu.test(label) &&
        !lines.slice(Math.max(0, index - 4), index + 1).some(entry => /\b(?:printer|accred(?:itation)?|permit|PTU[N]?)\b/iu.test(entry));
      if (invoiceIssue) {
        for (const date of dates) invoiceDates.add(date);
      }
      if (excluded || !dates.length) continue;
      if (!explicit) distinctOrdinary.add(dates.sort().join(","));
      for (const date of dates) (explicit ? primary : ordinary).add(date);
    }
  }
  if (!hasSeparatedRole && distinctOrdinary.size <= 1) return null;
  const candidates = hasPurchaseLabel ? primary : ordinary.size ? ordinary : invoiceDates;
  return { date: candidates.size === 1 ? [...candidates][0] : null };
}

const toUtcDayNumber = (value: Date | string | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
};

const resolveRecentEvidenceDate = (
  dates: string[],
  referenceDate: Date | string | null | undefined
) => {
  const referenceDay = toUtcDayNumber(referenceDate);
  if (referenceDay === null || dates.length < 2) return null;

  const ranked = dates
    .map((date) => ({ date, distance: Math.abs((toUtcDayNumber(date) ?? Number.POSITIVE_INFINITY) - referenceDay) }))
    .sort((left, right) => left.distance - right.distance);
  const best = ranked[0];
  const runnerUp = ranked[1];

  // Camera receipts are overwhelmingly uploaded on or shortly after the
  // purchase. Use that evidence only when one interpretation is recent and
  // the competing interpretation is materially farther away. Old receipts
  // remain ambiguous instead of being silently rewritten.
  return best && runnerUp && best.distance <= 7 && runnerUp.distance - best.distance >= 30
    ? best.date
    : null;
};

export const repairReceiptDateFromEvidence = <T extends ReceiptDateDetails>(
  details: T,
  trustedSourceText?: string | null,
  context: ReceiptDateContext = {}
): T => {
  if (details.receipt_type === "wallet_transfer" || details.receipt_type === "travel_ticket") return details;
  const currentDate = /^20\d{2}-\d{2}-\d{2}$/.test(details.transaction_date ?? "")
    ? details.transaction_date
    : null;
  // Prefer Clover's own OCR/text extraction over model-returned evidence. A
  // model can transcribe the same wrong year into parser_evidence, while the
  // locally extracted receipt text remains an independent source of truth.
  const sourceText = trustedSourceText?.trim() || details.parser_evidence?.source_text?.trim() || "";
  if (!sourceText) return details;

  const roleDecision = resolveReceiptPurchaseDateRoles(sourceText);
  if (roleDecision) {
    return roleDecision.date === details.transaction_date ? details : { ...details, transaction_date: roleDecision.date };
  }

  const explicitEvidenceDates = getExplicitEvidenceDates(splitReceiptPromotionalFooter(sourceText).body);
  // A receipt with one explicit, valid date is stronger evidence than a model
  // transcription. This also repairs month/day hallucinations, not only an
  // incorrect year. Ambiguous numeric dates intentionally produce multiple
  // candidates and continue through the conservative matching path below.
  if (explicitEvidenceDates.length === 1) {
    const [explicitDate] = explicitEvidenceDates;
    return explicitDate === currentDate
      ? details
      : {
          ...details,
          transaction_date: explicitDate,
      };
  }

  const recentEvidenceDate = resolveRecentEvidenceDate(explicitEvidenceDates, context.referenceDate);
  if (recentEvidenceDate && recentEvidenceDate !== currentDate) {
    return {
      ...details,
      transaction_date: recentEvidenceDate,
    };
  }

  // A model may return the printed short date despite the ISO schema prompt.
  // Normalize only a supported interpretation; never guess an ambiguous date.
  if (!currentDate) {
    const reportedDates = getExplicitEvidenceDates(details.transaction_date ?? "");
    const supported = reportedDates.filter(date => explicitEvidenceDates.includes(date));
    return supported.length === 1 ? { ...details, transaction_date: supported[0] } : details;
  }

  const monthDay = currentDate.slice(4);
  const matchingEvidenceDates = explicitEvidenceDates.filter((date) => date.slice(4) === monthDay);
  const uniqueMatch = matchingEvidenceDates.length === 1 ? matchingEvidenceDates[0] : null;
  if (!uniqueMatch || uniqueMatch === currentDate) return details;

  return {
    ...details,
    transaction_date: uniqueMatch,
  };
};

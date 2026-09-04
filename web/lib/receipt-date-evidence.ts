type ReceiptDateDetails = {
  transaction_date: string | null;
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

const getExplicitEvidenceDates = (sourceText: string) => {
  const dates = new Set<string>();
  const add = (year: number, month: number, day: number) => {
    const iso = toIsoDate(year, month, day);
    if (iso) dates.add(iso);
  };

  for (const match of sourceText.matchAll(/\b(20\d{2})\s*(?:[-/.]|年)\s*(\d{1,2})\s*(?:[-/.]|月)\s*(\d{1,2})(?:日)?\b/g)) {
    add(Number(match[1]), Number(match[2]), Number(match[3]));
  }
  for (const match of sourceText.matchAll(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(20\d{2})\b/g)) {
    const left = Number(match[1]);
    const right = Number(match[2]);
    const year = Number(match[3]);
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
  const currentDate = /^20\d{2}-\d{2}-\d{2}$/.test(details.transaction_date ?? "")
    ? details.transaction_date
    : null;
  // Prefer Clover's own OCR/text extraction over model-returned evidence. A
  // model can transcribe the same wrong year into parser_evidence, while the
  // locally extracted receipt text remains an independent source of truth.
  const sourceText = trustedSourceText?.trim() || details.parser_evidence?.source_text?.trim() || "";
  if (!currentDate || !sourceText) return details;

  const explicitEvidenceDates = getExplicitEvidenceDates(sourceText);
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

  const monthDay = currentDate.slice(4);
  const matchingEvidenceDates = explicitEvidenceDates.filter((date) => date.slice(4) === monthDay);
  const uniqueMatch = matchingEvidenceDates.length === 1 ? matchingEvidenceDates[0] : null;
  if (!uniqueMatch || uniqueMatch === currentDate) return details;

  return {
    ...details,
    transaction_date: uniqueMatch,
  };
};

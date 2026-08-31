type ReceiptDateDetails = {
  transaction_date: string | null;
  parser_evidence?: {
    source_text?: string | null;
  } | null;
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

export const repairReceiptDateFromEvidence = <T extends ReceiptDateDetails>(details: T): T => {
  const currentDate = /^20\d{2}-\d{2}-\d{2}$/.test(details.transaction_date ?? "")
    ? details.transaction_date
    : null;
  const sourceText = details.parser_evidence?.source_text?.trim() ?? "";
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

  const monthDay = currentDate.slice(4);
  const matchingEvidenceDates = explicitEvidenceDates.filter((date) => date.slice(4) === monthDay);
  const uniqueMatch = matchingEvidenceDates.length === 1 ? matchingEvidenceDates[0] : null;
  if (!uniqueMatch || uniqueMatch === currentDate) return details;

  return {
    ...details,
    transaction_date: uniqueMatch,
  };
};

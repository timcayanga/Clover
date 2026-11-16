export function hasPrintedStatementRowYear(value: string) {
  return /^\d{4}[-/.]|^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$|^(?:[a-z]+\s+\d{1,2},?|\d{1,2}\s+[a-z]+)\s+\d{2,4}$/i.test(value.trim());
}

export function resolveStatementRowYear(date: Date, hasPrintedYear: boolean, start: Date | null, end: Date | null) {
  if (hasPrintedYear || !end || !Number.isFinite(end.getTime())) return date;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const endYear = end.getUTCFullYear();
  // A printed December–January period or a January statement gives a
  // December row a prior-year anchor. Ignore payment due dates here.
  const crossesYear = start?.getUTCFullYear() === endYear - 1 || (end.getUTCMonth() === 0 && month === 11);
  if (crossesYear && (month > end.getUTCMonth() || (month === end.getUTCMonth() && day > end.getUTCDate()))) {
    const previous = new Date(Date.UTC(endYear - 1, month, day, 12));
    if ((!start || previous >= start) && previous.getUTCMonth() === month && previous.getUTCDate() === day) return previous;
  }
  return date;
}

export type StatementRowDateRole = "transaction" | "posting";

export function readStatementRowDateRoles(line: string): StatementRowDateRole[] | null {
  const header = line.trim().match(/^((?:(?:transaction|trans\.?|sale|purchase|posting|posted|post)\s+(?:date|dt\.?)(?:\s+|$)){1,2})(?=(?:description|desc\b|details|particulars|merchant|reference|amount)\b)/i);
  if (!header) return null;
  const roles = Array.from(header[1].matchAll(/\b(transaction|trans\.?|sale|purchase|posting|posted|post)\s+(?:date|dt\.?)/gi),
    match => /^post/i.test(match[1]) ? "posting" as const : "transaction" as const);
  return new Set(roles).size === roles.length ? roles : null;
}

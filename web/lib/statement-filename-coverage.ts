const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const parseFilenameDate = (dayText: string, monthText: string, yearText: string) => {
  const day = Number(dayText);
  const month = MONTH_INDEX[monthText.slice(0, 3).toLowerCase()];
  const year = Number(yearText);
  if (!Number.isInteger(day) || month === undefined || !Number.isInteger(year)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
};

export const getStatementFilenameCoverage = (fileName: string) => {
  if (!/maya[\s_-]*(?:wallet|savings)[\s_-]*soa/i.test(fileName)) {
    return null;
  }

  const match = fileName.match(
    /(?:^|[_\s-])(\d{1,2})-([A-Za-z]{3,9})-(\d{4})[_\s]+(\d{1,2})-([A-Za-z]{3,9})-(\d{4})(?:\.[^.]+)?$/i
  );
  if (!match) {
    return null;
  }

  const startDate = parseFilenameDate(match[1] ?? "", match[2] ?? "", match[3] ?? "");
  const endDate = parseFilenameDate(match[4] ?? "", match[5] ?? "", match[6] ?? "");
  if (!startDate || !endDate || new Date(startDate).getTime() > new Date(endDate).getTime()) {
    return null;
  }

  return { startDate, endDate };
};

export const applyStatementFilenameCoverage = <T extends { startDate?: string | null; endDate?: string | null }>(
  metadata: T,
  fileName: string
): T => {
  const coverage = getStatementFilenameCoverage(fileName);
  return coverage ? { ...metadata, ...coverage } : metadata;
};

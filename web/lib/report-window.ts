export type ReportRange = "30d" | "90d" | "ytd";

export type ReportWindowSearchParams = {
  range?: string;
  from?: string;
  to?: string;
};

export const reportRangeLabels: Record<ReportRange, string> = {
  "30d": "30 days",
  "90d": "90 days",
  ytd: "Year to date",
};

export const normalizeReportRange = (value: string | undefined): ReportRange => {
  if (value === "90d" || value === "ytd") {
    return value;
  }

  return "30d";
};

export const getCalendarDayEndInTimeZone = (instant: Date, timeZone: string) => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
  }

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return new Date(year, month - 1, day, 23, 59, 59, 999);
};

const parseDateInput = (value: string | undefined, endOfDay = false) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);

  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }

  return date;
};

const formatWindowDate = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

export const resolveReportWindow = (anchor: Date, params?: ReportWindowSearchParams) => {
  const range = normalizeReportRange(params?.range);
  const customStart = parseDateInput(params?.from);
  const customEnd = parseDateInput(params?.to, true);
  const hasCustomWindow = Boolean(customStart && customEnd && customStart <= customEnd);

  if (hasCustomWindow && customStart && customEnd) {
    const duration = customEnd.getTime() - customStart.getTime() + 1;
    const previousEnd = new Date(customStart.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - duration + 1);
    return {
      range,
      currentStart: customStart,
      currentEnd: customEnd,
      previousStart,
      previousEnd,
      label: `${formatWindowDate(customStart)} to ${formatWindowDate(customEnd)}`,
      from: params?.from,
      to: params?.to,
      isCustom: true,
    };
  }

  const currentEnd = new Date(anchor);
  const currentStart = new Date(anchor);
  if (range === "30d") {
    currentStart.setDate(currentStart.getDate() - 30);
  } else if (range === "90d") {
    currentStart.setDate(currentStart.getDate() - 90);
  } else {
    currentStart.setMonth(0, 1);
    currentStart.setHours(0, 0, 0, 0);
  }

  const previousEnd = new Date(currentStart.getTime() - 1);
  const duration = currentEnd.getTime() - currentStart.getTime() + 1;
  const previousStart = new Date(previousEnd.getTime() - duration + 1);

  return {
    range,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    label: reportRangeLabels[range],
    from: undefined,
    to: undefined,
    isCustom: false,
  };
};

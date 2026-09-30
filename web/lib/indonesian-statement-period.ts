import { normalizeIndonesianText, parseIndonesianDate } from "@/lib/indonesian-financial-text";

export type IndonesianStatementPeriod = { start: string; end: string; sourceText: string };
export const isIndonesianStatementPeriodLine = (line: string) => /^(?:periode(?: laporan| transaksi| mutasi)?|bulan laporan)\s*[:=]/i.test(line.trim());
export function readIndonesianStatementPeriod(lines: string[]): { period: IndonesianStatementPeriod | null; invalid: boolean } {
  let period: IndonesianStatementPeriod | null = null;
  for (const original of lines.filter(isIndonesianStatementPeriodLine)) {
    const value = normalizeIndonesianText(original).replace(/^[^:=]+[:=]\s*/, "");
    const parts = value.split(/\s+(?:s\.?d\.?|s\/d|hingga|sampai|[-–—])\s+/i);
    let start: Date | null = null, end: Date | null = null;
    if (parts.length === 2) {
      start = parseIndonesianDate(parts[0]!); end = parseIndonesianDate(parts[1]!);
    } else {
      const monthYear = value.match(/^(\d{1,2})\/(\d{4})$/);
      start = monthYear ? parseIndonesianDate(`1/${monthYear[1]}/${monthYear[2]}`) : parseIndonesianDate(`1 ${value}`);
      if (start) end = new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0,12));
    }
    if (!start || !end || end < start || end.getTime()-start.getTime() > 370*86400000) return {period:null,invalid:true};
    const next = {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),sourceText:original};
    if (period && (period.start !== next.start || period.end !== next.end)) return {period:null,invalid:true};
    period = next;
  }
  return {period,invalid:false};
}

/** A missing year may be resolved only when exactly one date fits the printed period. */
export function resolveIndonesianStatementDate(value: string, period: IndonesianStatementPeriod | null) {
  const full = parseIndonesianDate(value);
  if (full) {
    const date = full.toISOString().slice(0,10);
    return !period || (date >= period.start && date <= period.end) ? {date,fromPeriod:false} : null;
  }
  const short = normalizeIndonesianText(value).match(/^(\d{1,2})[/.](\d{1,2})$/);
  if (!short || !period) return null;
  const candidates: string[] = [];
  for (let year=Number(period.start.slice(0,4));year<=Number(period.end.slice(0,4));year++) {
    const date = parseIndonesianDate(`${short[1]}/${short[2]}/${year}`)?.toISOString().slice(0,10);
    if (date && date >= period.start && date <= period.end) candidates.push(date);
  }
  return candidates.length === 1 ? {date:candidates[0]!,fromPeriod:true} : null;
}

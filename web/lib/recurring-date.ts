/** Advance a calendar date without overflowing short months or shifting time zones. */
export function addCalendarMonths(dateValue: string, months: number): string {
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + months, 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

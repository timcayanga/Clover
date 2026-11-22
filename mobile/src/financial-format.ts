const moneyFormats = new Map<string, Intl.NumberFormat>();
let dateFormat: Intl.DateTimeFormat | undefined;

export function money(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  try {
    const code = currency.toUpperCase();
    let formatter = moneyFormats.get(code);
    if (!formatter) {
      formatter = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: code,
        ...(code === "KRW" ? { minimumFractionDigits: 0, maximumFractionDigits: 2 } : {}),
      });
      moneyFormats.set(code, formatter);
    }
    return formatter.format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
export function dateLabel(date: string) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return "Date unavailable";
  dateFormat ??= new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  return dateFormat.format(value);
}

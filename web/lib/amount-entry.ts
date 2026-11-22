/** Normalize comma-grouped, dot-decimal amounts without guessing ambiguous locales. */
export function normalizeAmountEntry(value: string): string {
  const trimmed = value.trim();
  return /^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)
    ? trimmed.replaceAll(",", "")
    : value;
}

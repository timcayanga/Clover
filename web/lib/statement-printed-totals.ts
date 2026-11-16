export function readPrintedStatementTotals(text: string, labels: string, currency?: string) {
  const pattern = new RegExp(
    `^[ \\t]*(?:${labels})[ \\t]*:?[ \\t]*([A-Z]{3}|₱)?[ \\t]*(\\(?[+-]?[0-9][0-9,]*\\.\\d{2}\\)?)[ \\t]*$`,
    "gim",
  );
  return [...new Set([...text.matchAll(pattern)].flatMap(match => {
    const printedCurrency = match[1] === "₱" ? "PHP" : match[1]?.toUpperCase();
    if (currency && printedCurrency && currency !== printedCurrency) return [];
    const printed = match[2];
    const value = Number(printed.replace(/[,()]/g, ""));
    const cents = Math.round(value * 100);
    return Number.isSafeInteger(cents) ? [printed.startsWith("(") ? -Math.abs(cents) : cents] : [];
  }))];
}

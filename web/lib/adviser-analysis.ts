/** Keep arithmetic in one currency. Never relabel mixed raw amounts as PHP. */
export function adviserCurrency(question: string, currencies: string[]) {
  const explicit = question.match(/\b(PHP|USD|EUR|GBP|SGD|HKD|JPY|AUD|CAD|CNY|INR|MYR|IDR|THB|VND|AED)\b/i)?.[1]?.toUpperCase();
  const available = [...new Set(currencies.map(c => c.toUpperCase()))].sort();
  return explicit ?? (question.includes("₱") ? "PHP" : available.includes("PHP") ? "PHP" : available[0] ?? "PHP");
}

export function adviserMonthRange(question: string, now: Date) {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const match = question.toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(20\d{2}))?\b/);
  const relative = /\b(this|last|previous) month\b/i.exec(question);
  if (!match && !relative) return null;
  const month = match ? months.indexOf(match[1]) : now.getUTCMonth() - (relative?.[1].toLowerCase() === "this" ? 0 : 1);
  const year = match?.[2] ? Number(match[2]) : now.getUTCFullYear();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const previousStart = new Date(Date.UTC(year, month - 1, 1));
  return { start, end, previousStart, label: start.toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

export const isSpendingSummaryQuestion = (question: string) =>
  /\b(?:(?:my|our|total|overall|monthly|PHP|USD|recorded)\s+(?:spending|expenses?)|(?:show|compare)\s+(?:spending|expenses?))\b/i.test(question) &&
  !/\b(?:at|on)\s+(?!(?:transfers?|expenses?|spending)\b)/i.test(question) &&
  /\b(?:category|categories|breakdown|total|compare|compared|month|changed|how much)\b/i.test(question) &&
  !/\b(?:add|create|record|edit|delete|budget|limit|afford|safe to spend)\b/i.test(question);

export function commitmentInstallment(commitment: { amount: unknown; kind?: string; tracking?: unknown }) {
  const tracking = commitment.tracking && typeof commitment.tracking === "object" ? commitment.tracking as Record<string, unknown> : {};
  if (commitment.kind === "debt") {
    const payment = Number(tracking.paymentAmount);
    // An outstanding debt is not a known installment. Do not reserve the entire balance.
    return Number.isFinite(payment) && payment > 0 ? payment : 0;
  }
  return Math.abs(Number(commitment.amount ?? 0));
}

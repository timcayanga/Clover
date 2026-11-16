export type BulkDestination = "circle" | "split" | "recurring";
export type BulkSource = {
  id: string; accountId: string; type: string; amount: string | number; currency: string;
  isTransfer?: boolean; isExcluded?: boolean;
};

export function bulkDestinationError(rows: readonly BulkSource[], count: number, destination: BulkDestination) {
  if (count > 100) return "Select at most 100 transactions at a time.";
  if (!count || rows.length !== count) return "Some selected transactions are unavailable. Select them again.";
  if (destination !== "recurring" && rows.some(row => row.type !== "expense" || row.isTransfer || row.isExcluded)) return "Circles and Split Bills are for expenses only.";
  if (destination === "recurring" && rows.some(row => row.type !== rows[0].type || !["income", "expense"].includes(row.type) || row.isTransfer || row.isExcluded)) {
    return "Select income or expenses for the same recurring item.";
  }
  if (destination !== "circle" && rows.some(row => row.currency !== rows[0].currency || !Number.isFinite(Number(row.amount)) || Number(row.amount) === 0)) {
    return "Select nonzero transactions in one currency.";
  }
  if (destination === "recurring" && rows.some(row => row.accountId !== rows[0].accountId)) return "Choose examples of the same bill paid from one account.";
  return "";
}

export const bulkDestinations = [
  ["circle", "Circles"], ["split", "Split Bills"], ["recurring", "Recurring"],
] as const;

export const bulkFrequencies = [
  ["weekly", "Weekly"], ["biweekly", "Every two weeks"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["annual", "Yearly"],
] as const;

export function makeBulkDestinationRequest(input: {
  destination: BulkDestination; workspaceId: string; rows: readonly BulkSource[]; circleId: string;
  title: string; people: string; dueDate?: string; amount?: string; recurrence?: string; splitCircleId?: string; inferSchedule?: boolean;
}) {
  const { destination, workspaceId, rows, circleId, title, people, dueDate, amount, recurrence } = input;
  const error = bulkDestinationError(rows, rows.length, destination);
  if (error) throw new Error(error);
  const transactionIds = rows.map(row => row.id);
  if (destination === "circle") {
    if (!circleId) throw new Error("Choose a Circle.");
    return { path: `circles/${encodeURIComponent(circleId)}/resources`, body: { action: "share_transactions", workspaceId, transactionIds } };
  }
  if (destination === "recurring" && input.inferSchedule) {
    return { path: "commitments", body: { fromSelection: true, inferSchedule: true, workspaceId, evidenceTransactionIds: transactionIds } };
  }
  if (!title.trim()) throw new Error("Enter a name.");
  if (destination === "split") {
    const names = people.split(",").map(name => name.trim()).filter(Boolean);
    if (!names.length && !input.splitCircleId) throw new Error("Enter at least one other person's name.");
    return { path: "split-bills", body: { fromTransactions: { title, workspaceId, transactionIds, people: names, ...(input.splitCircleId ? { circleId: input.splitCircleId } : {}) } } };
  }
  const date = new Date(dueDate + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate ?? "") || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dueDate) throw new Error("Choose a valid next due date.");
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error("Enter a positive amount per payment.");
  return { path: "commitments", body: {
    fromSelection: true, workspaceId, kind: rows[0].type === "income" ? "receivable" : "planned_payment", title, status: "active", dueDate,
    recurrence, amount, currency: rows[0].currency, accountId: rows[0].accountId, evidenceTransactionIds: transactionIds,
  } };
}

type RecurringEvidence = BulkSource & { date: string; title: string };

export function inferSelectedRecurring(rows: readonly RecurringEvidence[], today: string) {
  const error = bulkDestinationError(rows, rows.length, "recurring");
  if (error) throw new Error(error);
  const first = rows[0];
  const name = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  if (rows.some(row => name(row.title) !== name(first.title))) throw new Error("Choose examples of the same recurring item.");
  const dates = [...new Set(rows.map(row => row.date.slice(0, 10)))].sort();
  const day = 86_400_000;
  const gaps = dates.slice(1).map((date, i) => (Date.parse(date) - Date.parse(dates[i])) / day).sort((a, b) => a - b);
  const gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 30;
  const recurrence = gap <= 10 ? "weekly" : gap <= 19 ? "biweekly" : gap <= 50 ? "monthly" : gap <= 145 ? "quarterly" : "annual";
  const anchor = new Date(dates[dates.length - 1] + "T00:00:00Z");
  const monthStep = recurrence === "annual" ? 12 : recurrence === "quarterly" ? 3 : 1;
  let next: Date;
  for (let step = 1; ; step++) {
    next = new Date(anchor);
    if (recurrence === "weekly" || recurrence === "biweekly") {
      next.setUTCDate(anchor.getUTCDate() + step * (recurrence === "weekly" ? 7 : 14));
    } else {
      next.setUTCDate(1);
      next.setUTCMonth(anchor.getUTCMonth() + step * monthStep);
      const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(anchor.getUTCDate(), last));
    }
    if (next.toISOString().slice(0, 10) >= today) break;
  }
  const amounts = rows.map(row => Math.abs(Number(row.amount))).sort((a, b) => a - b);
  const amount = (amounts[Math.floor((amounts.length - 1) / 2)] + amounts[Math.floor(amounts.length / 2)]) / 2;
  return {
    kind: first.type === "income" ? "receivable" : "planned_payment",
    title: first.title.slice(0, 120), accountId: first.accountId, currency: first.currency,
    dueDate: next.toISOString().slice(0, 10), recurrence, amount: String(amount),
  };
}

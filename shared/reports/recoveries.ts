import type { ReportRow, ReportPeriod } from "./analysis";
import type { RecoveryReport, RecoveryLink } from "./workspace";
export type RecoveryAllocation = {
  id: string;
  expenseId: string;
  incomingId: string;
  kind: string;
  amount: number;
};
export function recoveryIssue(
  link: RecoveryAllocation,
  expense?: ReportRow,
  incoming?: ReportRow,
): string | undefined {
  if (!expense || !incoming)
    return "A linked transaction was deleted, ignored, or is unavailable.";
  if (expense.type !== "expense" || incoming.type !== "income")
    return "A linked transaction is no longer an expense or incoming payment.";
  if (expense.currency !== incoming.currency)
    return "The linked currencies no longer match.";
  if (incoming.date < expense.date)
    return "The incoming payment is dated before this expense.";
  if (
    !["refund", "reimbursement"].includes(link.kind) ||
    !Number.isFinite(link.amount) ||
    link.amount <= 0
  )
    return "The allocation needs to be linked again.";
  return undefined;
}
export function buildRecoveryReport(
  allRows: ReportRow[],
  selected: ReportRow[],
  links: RecoveryAllocation[],
  period: ReportPeriod,
  currency: string,
): RecoveryReport {
  const byId = new Map(allRows.map((r) => [r.id, r]));
  const expenseRows = selected.filter(
    (r) =>
      r.currency === currency &&
      r.type === "expense" &&
      r.date >= period.from &&
      r.date <= period.to,
  );
  const expenseIds = new Set(expenseRows.map((r) => r.id));
  const selectedIds = new Set(
    selected.filter((r) => r.currency === currency).map((r) => r.id),
  );
  const totals = new Map<string, number>();
  for (const l of links)
    for (const id of [l.expenseId, l.incomingId])
      totals.set(id, (totals.get(id) ?? 0) + Math.round(l.amount * 100));
  const output: RecoveryLink[] = [];
  let refunds = 0,
    reimbursements = 0,
    receivedForEarlierExpenses = 0;
  for (const l of links) {
    const expense = byId.get(l.expenseId),
      incoming = byId.get(l.incomingId);
    const selectedExpense = expenseIds.has(l.expenseId);
    const earlier =
      expense &&
      expense.date < period.from &&
      incoming &&
      incoming.date >= period.from &&
      incoming.date <= period.to &&
      selectedIds.has(incoming.id);
    const unavailable =
      (!expense || !incoming) &&
      [expense, incoming].some(
        (r) =>
          r &&
          selectedIds.has(r.id) &&
          r.date >= period.from &&
          r.date <= period.to,
      );
    if (!selectedExpense && !earlier && !unavailable) continue;
    let issue = recoveryIssue(l, expense, incoming);
    if (
      !issue &&
      [expense!, incoming!].some(
        (r) => (totals.get(r.id) ?? 0) > Math.round(r.amount * 100),
      )
    )
      issue =
        "Linked amounts exceed an edited transaction. Remove the links and relink the correct amounts.";
    const received = incoming && incoming.date <= period.to;
    if (!issue && selectedExpense && received) {
      if (l.kind === "refund") refunds += l.amount;
      else reimbursements += l.amount;
    }
    if (!issue && earlier) receivedForEarlierExpenses += l.amount;
    output.push({
      ...l,
      kind: l.kind as RecoveryLink["kind"],
      expenseName: expense?.merchant ?? "Unavailable expense",
      incomingName: incoming?.merchant ?? "Unavailable payment",
      expenseDate: expense?.date ?? "",
      receivedDate: incoming?.date ?? "",
      issue:
        issue ??
        (!received
          ? "Received after this period; not deducted here."
          : undefined),
    });
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const gross = round(expenseRows.reduce((n, r) => n + r.amount, 0));
  return {
    gross,
    refunds: round(refunds),
    reimbursements: round(reimbursements),
    personalCost: round(gross - refunds - reimbursements),
    receivedForEarlierExpenses: round(receivedForEarlierExpenses),
    links: output,
    notes: [
      "Personal cost deducts only linked money received by the end of this period from matching expenses. Filters apply to expenses; the linked payment may be in another account.",
      "Income, cash-flow and budget totals keep the original recorded transactions. This breakdown does not rewrite them.",
      "Unpaid Split Bills, Circle commitments and unlinked payments are not deducted. Link only money actually received; record the payment first if needed.",
    ],
  };
}

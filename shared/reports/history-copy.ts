import type { AccountImportCoverage, BudgetReportRow } from "./workspace";
export const budgetHistoryExplanation =
  "Settings are preserved from each change date. Older figures are marked Estimated. Changes apply from that day in your Profile timezone. Partial periods are prorated by calendar day. Budgets can overlap, so rows are not added together. Filters narrow spending without reducing targets.";
export const budgetHistoryLabel = (b: BudgetReportRow) =>
  `${b.from} to ${b.to} · ${b.historyBasis === "recorded" ? "Recorded settings" : "Estimated"}${b.historyBasis !== "recorded" && b.historyKnownFrom ? ` · history begins ${b.historyKnownFrom}` : ""}`;
export function importCoverageLines(c: AccountImportCoverage) {
  return [
    ...c.statementPeriods.map((p) => `Statement on file: ${p.from} to ${p.to}`),
    ...c.gaps.map((p) => `No statement period on file: ${p.from} to ${p.to}`),
    ...(c.undatedStatements
      ? [`${c.undatedStatements} statement(s) have no usable period dates.`]
      : []),
    ...(c.pendingStatements
      ? [
          `${c.pendingStatements} statement(s) need review or are still processing.`,
        ]
      : []),
    ...(c.lastSyncedAt
      ? [
          `Last synced: ${c.lastSyncedAt.replace("T", " ").replace(/\.\d+Z$/, " UTC")}`,
        ]
      : []),
    c.connectionState === "current"
      ? "Synced within 48 hours"
      : c.connectionState === "stale"
        ? "Not synced in the last 48 hours"
        : c.connectionState === "attention"
          ? "Bank connection needs attention"
          : "No active bank connection",
    c.note,
  ];
}

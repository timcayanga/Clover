import { shiftDay, validReportDate } from "./analysis";
import type { AccountImportCoverage } from "./workspace";
export type StatementEvidence = {
  from: string | null;
  to: string | null;
  status: string;
  done: boolean;
  statement: boolean;
};
export function accountImportCoverage(
  account: { id: string; name: string; type: string; createdDay: string },
  statements: StatementEvidence[],
  connections: {
    lastSyncedAt: string | null;
    status: string;
    error: boolean;
  }[],
  period: { from: string; to: string },
  now: Date,
): AccountImportCoverage {
  const from = period.from;
  const to = period.to;
  // Receipts, screenshots and point-in-time balance snapshots cannot establish a statement period.
  const accepted = statements.filter(
    (s) =>
      s.statement &&
      s.done &&
      s.status === "reconciled" &&
      s.from &&
      s.to &&
      validReportDate(s.from) &&
      validReportDate(s.to) &&
      s.from <= s.to,
  );
  const intervals = accepted
    .map((s) => ({ from: s.from!, to: s.to!, status: s.status }))
    .filter((s) => s.to >= from && s.from <= to)
    .sort((a, b) => a.from.localeCompare(b.from));
  const merged: { from: string; to: string }[] = [];
  for (const i of intervals) {
    const clipped = {
      from: [from, i.from].sort().at(-1)!,
      to: [to, i.to].sort()[0],
    };
    const last = merged.at(-1);
    if (last && clipped.from <= shiftDay(last.to, 1))
      last.to = [last.to, clipped.to].sort().at(-1)!;
    else merged.push(clipped);
  }
  const gaps: { from: string; to: string }[] = [];
  let cursor = from;
  if (account.type !== "cash" && from <= to) {
    for (const i of merged) {
      if (cursor < i.from)
        gaps.push({ from: cursor, to: shiftDay(i.from, -1) });
      cursor = shiftDay(i.to, 1);
    }
    if (cursor <= to) gaps.push({ from: cursor, to });
  }
  const latest =
    connections
      .map((c) => c.lastSyncedAt)
      .filter((s): s is string => !!s && Number.isFinite(Date.parse(s)))
      .sort()
      .at(-1) ?? null;
  const issue = connections.some(
    (c) =>
      c.error ||
      !["connected", "active", "ready", "success", "synced"].includes(c.status),
  );
  const stale = !latest || +now - Date.parse(latest) > 48 * 60 * 60 * 1000;
  return {
    accountId: account.id,
    name: account.name,
    from,
    to,
    statementPeriods: intervals,
    gaps,
    undatedStatements: statements.filter(
      (s) =>
        s.statement &&
        s.done &&
        (!s.from ||
          !s.to ||
          !validReportDate(s.from) ||
          !validReportDate(s.to) ||
          s.from > s.to),
    ).length,
    pendingStatements: statements.filter(
      (s) => s.statement && (!s.done || s.status !== "reconciled"),
    ).length,
    lastSyncedAt: latest,
    connectionState: !connections.length
      ? "not_connected"
      : issue
        ? "attention"
        : stale
          ? "stale"
          : "current",
    note:
      account.type === "cash"
        ? "Cash is tracked manually; statement coverage does not apply."
        : "Periods use completed, reconciled statement records. Dates may have been inferred during import. Gaps mean no qualifying statement is on file, not proof of missing transactions. Bank sync does not certify historical completeness.",
  };
}

export function isStatementPeriodSource(
  documentFamily: string | null | undefined,
  metadata: unknown,
): boolean {
  const m =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : {};
  const family = documentFamily || String(m.importMode || m.documentType || "");
  return [
    "statement",
    "bank_statement",
    "credit_card_statement",
    "investment_statement",
  ].includes(family);
}

import { buildRecurringCalendarOccurrences } from "./recurring-calendar";
import {
  recurringPaymentAmount,
  recurringCompletionDate,
} from "./recurring-tracking";
import type { FinancialCommitmentSummary } from "./commitments";
import {
  cashForecast,
  type RecurringCosts,
  type ScheduledMovement,
  type NetWorthChange,
} from "../../shared/reports/outlook";
import {
  shiftDay,
  reportDay,
  type ReportRow,
} from "../../shared/reports/analysis";
import { spendableAccountTypes } from "../../shared/account-summary";
import {
  getAccountCheckpointEffectiveTime,
  isAccountBalanceCheckpointEvidence,
} from "./account-balance-projection";
import { normalizeAccountBalanceSign } from "./account-balance";
import type { ReportNetWorthAccount } from "./report-net-worth-data";
export function buildReportOutlook(
  commitments: FinancialCommitmentSummary[],
  accounts: {
    id: string;
    name: string;
    type: string;
    balance: number | null;
  }[],
  rows: ReportRow[],
  today: string,
) {
  const nextYear = new Date(`${today}T12:00:00Z`);
  const month = nextYear.getUTCMonth(),
    day = nextYear.getUTCDate();
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1, month, 1);
  nextYear.setUTCDate(
    Math.min(
      day,
      new Date(Date.UTC(nextYear.getUTCFullYear(), month + 1, 0)).getUTCDate(),
    ),
  );
  const endExclusive = nextYear.toISOString().slice(0, 10),
    end30 = shiftDay(today, 30);
  const earliest = shiftDay(today, -30);
  const start = new Date(earliest),
    last = new Date(endExclusive);
  const schedule = commitments.filter(
    (c) =>
      c.status === "active" &&
      !["recurring_detection", "suggestion"].includes(c.source),
  );
  const occurrences = [] as ReturnType<
    typeof buildRecurringCalendarOccurrences
  >;
  for (
    let index = start.getUTCFullYear() * 12 + start.getUTCMonth();
    index <= last.getUTCFullYear() * 12 + last.getUTCMonth();
    index++
  ) {
    occurrences.push(
      ...buildRecurringCalendarOccurrences(
        schedule,
        Math.floor(index / 12),
        index % 12,
      ),
    );
  }
  const completed = new Map(
    schedule.map((c) => [c.id, new Set(c.completedPaymentDates ?? [])]),
  );
  const pending = occurrences.filter(
    (o) =>
      o.dateKey >= earliest &&
      o.dateKey < endExclusive &&
      !completed
        .get(o.commitment.id)
        ?.has(recurringCompletionDate(o.commitment, o.dateKey)),
  );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const scheduleById = new Map(schedule.map((c) => [c.id, c]));
  const overdueById = new Map<string, string[]>();
  for (const o of pending)
    if (o.dateKey < today)
      overdueById.set(o.commitment.id, [
        ...(overdueById.get(o.commitment.id) ?? []),
        o.dateKey,
      ]);
  const upcoming = pending.filter((o) => o.dateKey >= today);
  const byCommitment = new Map<string, typeof upcoming>();
  for (const occurrence of upcoming)
    byCommitment.set(occurrence.commitment.id, [
      ...(byCommitment.get(occurrence.commitment.id) ?? []),
      occurrence,
    ]);
  const findings: NonNullable<RecurringCosts["findings"]> = [];
  const costRows: RecurringCosts["rows"] = schedule.map((c) => {
    const dates = (byCommitment.get(c.id) ?? []).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey),
    );
    const amount = (date: string) =>
      c.tracking?.amountType === "variable" ||
      (c.kind === "debt" && !c.tracking)
        ? null
        : recurringPaymentAmount(c, date);
    const reason = !(c.plannedPaymentDate ?? c.dueDate ?? c.nextDueDate)
      ? "No due date"
      : c.tracking?.amountType === "variable"
        ? "Variable amount"
        : dates.some(
              (d) =>
                amount(d.dateKey) === null ||
                !Number.isFinite(amount(d.dateKey)) ||
                amount(d.dateKey)! < 0,
            ) ||
            (c.kind === "debt" && !c.tracking)
          ? "No scheduled payment amount"
          : null;
    const ids = new Set(
      [c.transactionId, ...c.evidenceTransactionIds].filter(Boolean),
    );
    const payments = [...ids]
      .flatMap((id) => {
        const row = rowsById.get(id!);
        return row ? [row] : [];
      })
      .filter(
        (r) =>
          r.type === (c.kind === "receivable" ? "income" : "expense") &&
          !r.needsReview &&
          r.date <= today,
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const latest = payments.at(-1),
      previous = payments.filter((p) => p.date !== latest?.date).at(-1);
    // Two explicit links establish an amount difference, not a contractual price rise.
    if (
      latest &&
      previous &&
      latest.date >= earliest &&
      latest.amount > previous.amount &&
      previous.amount > 0 &&
      Number.isFinite(latest.amount)
    ) {
      findings.push({
        id: `higher:${c.id}`,
        kind: "higher_payment",
        title: `${c.title}: higher linked payment`,
        explanation:
          "The latest linked payment is higher than the previous one. It may include extra usage or a partial-period adjustment; check both transactions before changing the schedule.",
        confidence: 100,
        scheduleIds: [c.id],
        transactions: [previous, latest].map((p) => ({
          id: p.id,
          date: p.date,
          amount: p.amount,
        })),
        dates: [],
      });
    }
    const overdue = overdueById.get(c.id) ?? [];
    if (overdue.length)
      findings.push({
        id: `uncompleted:${c.id}`,
        kind: "uncompleted",
        title: `${c.title}: not marked complete`,
        explanation: `${overdue.length} due date${overdue.length === 1 ? "" : "s"} in the past 30 days have no completion recorded. This does not prove a payment was missed.`,
        confidence: 100,
        scheduleIds: [c.id],
        transactions: [],
        dates: overdue,
      });
    return {
      id: c.id,
      title: c.title,
      cadence: c.recurrence,
      direction: c.kind === "receivable" ? ("in" as const) : ("out" as const),
      nextDate: dates[0]?.dateKey ?? null,
      nextAmount: reason || !dates.length ? null : amount(dates[0].dateKey),
      cost30: reason
        ? 0
        : dates
            .filter((o) => o.dateKey < end30)
            .reduce((s, o) => s + (amount(o.dateKey) ?? 0), 0),
      costYear: reason
        ? 0
        : dates.reduce((s, o) => s + (amount(o.dateKey) ?? 0), 0),
      excludedReason: reason,
      latestPayment: latest
        ? {
            date: latest.date,
            amount: latest.amount,
            previous: previous?.amount ?? null,
          }
        : null,
    };
  });
  const duplicates = new Map<string, typeof costRows>();
  for (const row of costRows) {
    const commitment = scheduleById.get(row.id)!;
    // Be conservative: same assigned account, normalized title, cadence, next date and amount.
    if (
      row.direction !== "out" ||
      row.excludedReason ||
      !row.nextDate ||
      !row.nextAmount ||
      !commitment.accountId ||
      commitment.recurrence === "once"
    )
      continue;
    const title = row.title
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!title) continue;
    const key = JSON.stringify([
      title,
      commitment.accountId,
      row.cadence,
      row.nextDate,
      row.nextAmount,
    ]);
    duplicates.set(key, [...(duplicates.get(key) ?? []), row]);
  }
  for (const group of duplicates.values())
    if (group.length > 1)
      findings.push({
        id: `duplicate:${group
          .map((r) => r.id)
          .sort()
          .join(":")}`,
        kind: "possible_duplicate",
        title: `${group[0].title}: possible duplicate schedules`,
        explanation: `${group.length} schedules share the same name, account, cadence, next date and amount. They may be separate obligations. Review them; nothing has been removed or deducted from totals.`,
        confidence: 70,
        scheduleIds: group.map((r) => r.id),
        transactions: [],
        dates: [group[0].nextDate!],
      });
  for (const finding of findings)
    if (finding.kind === "possible_duplicate")
      finding.scheduleEvidence = finding.scheduleIds.map((id) => {
        const c = scheduleById.get(id)!,
          cost = costRows.find((row) => row.id === id)!;
        return {
          title: c.title,
          account:
            accounts.find((a) => a.id === c.accountId)?.name ??
            "Selected account",
          cadence: c.recurrence,
          nextDate: cost.nextDate,
          amount: cost.nextAmount,
        };
      });
  const out = costRows.filter((r) => r.direction === "out"),
    cashMovements: ScheduledMovement[] = [],
    omitted = new Set<string>();
  const costById = new Map(costRows.map((r) => [r.id, r]));
  for (const occurrence of upcoming) {
    const c = occurrence.commitment,
      cost = costById.get(c.id)!;
    const account = accounts.find((a) => a.id === c.accountId);
    const nonCash =
      !!c.accountId &&
      (!account || !spendableAccountTypes.includes(account.type));
    if (cost.excludedReason || nonCash) {
      omitted.add(
        `${c.title}: ${cost.excludedReason ?? "not assigned to a bank, wallet or cash account"}`,
      );
      continue;
    }
    cashMovements.push({
      id: `${c.id}:${occurrence.dateKey}`,
      title: c.title,
      date: occurrence.dateKey,
      amount: recurringPaymentAmount(c, occurrence.dateKey)!,
      direction: cost.direction,
    });
  }
  for (const row of costRows)
    if (row.excludedReason) omitted.add(`${row.title}: ${row.excludedReason}`);
  const cashAccounts = accounts.filter((a) =>
    spendableAccountTypes.includes(a.type),
  );
  const missing = cashAccounts
    .filter((a) => a.balance === null || !Number.isFinite(a.balance))
    .map((a) => a.name);
  const opening =
    missing.length || !cashAccounts.length
      ? null
      : cashAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  return {
    recurringCosts: {
      from: today,
      to: shiftDay(endExclusive, -1),
      outgoing30: out.reduce((s, r) => s + r.cost30, 0),
      incoming30: costRows
        .filter((r) => r.direction === "in")
        .reduce((s, r) => s + r.cost30, 0),
      outgoingYear: out.reduce((s, r) => s + r.costYear, 0),
      monthlyEquivalent: out.reduce((s, r) => s + r.costYear, 0) / 12,
      overdueCount: pending.filter((o) => o.dateKey < today).length,
      rows: costRows,
      findings,
    } satisfies RecurringCosts,
    forecast: cashForecast(today, opening, cashMovements, missing, [
      ...omitted,
    ]),
  };
}
export function buildNetWorthChange(
  accounts: (ReportNetWorthAccount & { id: string; name: string })[],
  from: string,
  to: string,
  timeZone = "UTC",
): NetWorthChange {
  const rows = accounts.map((a) => {
    const group = spendableAccountTypes.includes(a.type)
      ? "Bank, wallet and cash"
      : a.type === "investment"
        ? "Investments"
        : [
              "credit_card",
              "loan",
              "mortgage",
              "line_of_credit",
              "payable",
              "bnpl",
            ].includes(a.type)
          ? "Liabilities"
          : "Other assets";
    const points = a.statementCheckpoints
      .filter(isAccountBalanceCheckpointEvidence)
      .flatMap((p) => {
        const time = getAccountCheckpointEffectiveTime(p),
          value = p.endingBalance;
        return time > 0 &&
          value !== null &&
          value !== undefined &&
          String(value).trim() !== "" &&
          Number.isFinite(Number(value))
          ? [
              {
                date: p.statementEndDate
                  ? new Date(time).toISOString().slice(0, 10)
                  : reportDay(new Date(time), timeZone),
                recordedAt: p.createdAt ? +new Date(p.createdAt) : 0,
                balance: normalizeAccountBalanceSign(a.type, Number(value)),
              },
            ]
          : [];
      })
      .sort(
        (a, b) => a.date.localeCompare(b.date) || a.recordedAt - b.recordedAt,
      );
    const opening = points.filter((p) => p.date < from).at(-1) ?? null,
      closing =
        points.filter((p) => p.date >= from && p.date <= to).at(-1) ?? null;
    return {
      id: a.id,
      name: a.name,
      group,
      opening,
      closing,
      change: opening && closing ? closing.balance - opening.balance : null,
      issue: !opening
        ? "No dated opening balance"
        : !closing
          ? "No balance recorded in this period"
          : null,
    };
  });
  const complete = rows.length > 0 && rows.every((r) => r.change !== null);
  return {
    from,
    to,
    change: complete ? rows.reduce((s, r) => s + r.change!, 0) : null,
    groups: [
      "Bank, wallet and cash",
      "Investments",
      "Liabilities",
      "Other assets",
    ].map((name) => ({
      name,
      change: rows
        .filter((r) => r.group === name)
        .reduce((s, r) => s + (r.change ?? 0), 0),
    })),
    accounts: rows,
  };
}

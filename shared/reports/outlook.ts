import { shiftDay } from "./analysis";
export type ScheduledMovement = {
  id: string;
  title: string;
  date: string;
  amount: number;
  direction: "in" | "out";
};
export type CashForecast = {
  today: string;
  opening: number | null;
  missingBalances: string[];
  omittedSchedules: string[];
  horizons: {
    days: number;
    end: string;
    incoming: number;
    outgoing: number;
    closing: number | null;
    lowest: { date: string; balance: number } | null;
    points: { date: string; balance: number }[];
  }[];
  movements: ScheduledMovement[];
};
export type RecurringCosts = {
  from: string;
  to: string;
  outgoing30: number;
  incoming30: number;
  outgoingYear: number;
  monthlyEquivalent: number;
  overdueCount: number;
  findings?: {
    id: string;
    kind: "higher_payment" | "uncompleted" | "possible_duplicate";
    title: string;
    explanation: string;
    confidence: number;
    scheduleIds: string[];
    scheduleEvidence?: {
      title: string;
      account: string;
      cadence: string;
      nextDate: string | null;
      amount: number | null;
    }[];
    transactions: { id: string; date: string; amount: number }[];
    dates: string[];
  }[];
  rows: {
    id: string;
    title: string;
    cadence: string;
    direction: "in" | "out";
    nextDate: string | null;
    nextAmount: number | null;
    cost30: number;
    costYear: number;
    excludedReason: string | null;
    latestPayment: {
      date: string;
      amount: number;
      previous: number | null;
    } | null;
  }[];
};
export type NetWorthChange = {
  from: string;
  to: string;
  change: number | null;
  groups: { name: string; change: number }[];
  accounts: {
    id: string;
    name: string;
    group: string;
    opening: { date: string; balance: number } | null;
    closing: { date: string; balance: number } | null;
    change: number | null;
    issue: string | null;
  }[];
};
export const outlookScopeNote =
  "Account and currency filters apply. Schedules run from today; transaction date, category, merchant, tag, review and transfer filters do not change these projections.";
export const forecastNote =
  "Uses active saved schedules and known bank, wallet and cash balances. Excludes suggestions, variable or unknown amounts, items marked complete and overdue payments. Credit-card charges are excluded until a cash repayment is scheduled. Unscheduled spending and income are not predicted. This is an estimate, not a guarantee.";
export const recurringNote =
  "Debt totals use scheduled payment amounts, not outstanding balances. Items marked complete are excluded. Monthly equivalent is the next 12 months divided by 12, not a monthly bill. Linked payments show recorded amounts, not proof of a price change.";
export const netWorthChangeNote =
  "Uses the latest dated balance before the period and the latest recorded within it. Account dates may differ and may not cover the full period. Investment changes can include purchases, sales, valuation changes or corrections; debt changes can include borrowing, interest or repayments. These are balance changes, not investment returns or a principal/interest breakdown. Transaction filters do not change balances.";
export function cashForecast(
  today: string,
  opening: number | null,
  movements: ScheduledMovement[],
  missingBalances: string[] = [],
  omittedSchedules: string[] = [],
): CashForecast {
  const ordered = movements
    .filter(
      (m) =>
        m.date >= today &&
        m.date < shiftDay(today, 90) &&
        Number.isFinite(m.amount) &&
        m.amount >= 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return {
    today,
    opening,
    missingBalances,
    omittedSchedules,
    movements: ordered,
    horizons: [30, 90].map((days) => {
      let incoming = 0,
        outgoing = 0,
        balance = opening;
      const points: { date: string; balance: number }[] = [];
      // Today's starting point is kept separately; daily points represent end-of-day balances.
      let lowest = opening === null ? null : { date: today, balance: opening };
      const byDay = new Map<string, ScheduledMovement[]>();
      for (const movement of ordered)
        byDay.set(movement.date, [
          ...(byDay.get(movement.date) ?? []),
          movement,
        ]);
      for (let i = 0; i < days; i++) {
        const date = shiftDay(today, i);
        const rows = byDay.get(date) ?? [];
        const dayIn = rows
          .filter((r) => r.direction === "in")
          .reduce((s, r) => s + r.amount, 0);
        const dayOut = rows
          .filter((r) => r.direction === "out")
          .reduce((s, r) => s + r.amount, 0);
        incoming += dayIn;
        outgoing += dayOut;
        if (balance !== null) {
          balance += dayIn - dayOut;
          points.push({ date, balance });
          if (lowest && balance < lowest.balance) lowest = { date, balance };
        }
      }
      return {
        days,
        end: shiftDay(today, days - 1),
        incoming,
        outgoing,
        closing: balance,
        lowest,
        points,
      };
    }),
  };
}

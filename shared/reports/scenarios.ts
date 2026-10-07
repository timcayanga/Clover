import {
  cashForecast,
  type CashForecast,
  type ScheduledMovement,
} from "./outlook";
import { shiftDay, validReportDate } from "./analysis";
export type ForecastAdjustment =
  | {
      id: string;
      kind: "expense" | "income";
      title: string;
      date: string;
      amount: number;
    }
  | { id: string; kind: "replace"; movementId: string; amount: number };
export const scenarioNote =
  "Preview only. This does not save transactions or change schedules. Scenarios clear when you leave this report or change its data or filters; exports and saved reports use the original forecast.";
/** All arithmetic is local and read-only. Replacing an occurrence never changes its other dates. */
export function forecastScenario(
  base: CashForecast,
  adjustments: ForecastAdjustment[],
): { forecast: CashForecast; error: string | null } {
  const invalid = (error: string) => ({ forecast: base, error });
  if (adjustments.length > 10)
    return invalid("Keep up to 10 changes in one scenario.");
  const ids = new Set<string>(),
    replaced = new Set<string>();
  const movements: ScheduledMovement[] = base.movements.map((m) => ({ ...m }));
  for (const a of adjustments) {
    if (!a.id || ids.has(a.id))
      return invalid("Each scenario change needs a unique identifier.");
    ids.add(a.id);
    if (!Number.isFinite(a.amount) || a.amount < 0 || a.amount > 1e12)
      return invalid(
        "Enter a valid positive amount, or zero to skip a scheduled payment.",
      );
    if (a.kind === "replace") {
      const movement = movements.find((m) => m.id === a.movementId);
      if (!movement || replaced.has(a.movementId))
        return invalid(
          "Choose an upcoming payment that is not already changed.",
        );
      replaced.add(a.movementId);
      movement.amount = a.amount;
    } else {
      if (a.kind !== "expense" && a.kind !== "income")
        return invalid("Choose an expense, income or scheduled payment.");
      if (a.amount === 0) return invalid("Enter an amount greater than zero.");
      if (
        !validReportDate(a.date) ||
        a.date < base.today ||
        a.date >= shiftDay(base.today, 90)
      )
        return invalid("Choose a date within the next 90 days.");
      if (!a.title.trim() || a.title.length > 100)
        return invalid("Add a short description, up to 100 characters.");
      movements.push({
        id: `scenario:${a.id}`,
        title: a.title.trim(),
        date: a.date,
        amount: a.amount,
        direction: a.kind === "income" ? "in" : "out",
      });
    }
  }
  return {
    forecast: cashForecast(
      base.today,
      base.opening,
      movements,
      [...base.missingBalances],
      [...base.omittedSchedules],
    ),
    error: null,
  };
}
export function scenarioDescription(a: ForecastAdjustment, base: CashForecast) {
  if (a.kind === "replace") {
    const m = base.movements.find((m) => m.id === a.movementId);
    return `${m?.title ?? "Scheduled payment"} · ${m?.date ?? ""}`;
  }
  return `${a.title} · ${a.date} · ${a.kind === "income" ? "Money in" : "Money out"}`;
}

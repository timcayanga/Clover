"use client";
import { useState } from "react";
import {
  forecastScenario,
  scenarioDescription,
  scenarioNote,
  type ForecastAdjustment,
} from "../../shared/reports/scenarios";
import type { CashForecast } from "../../shared/reports/outlook";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { ReportsMoneyOverTimeChart } from "./reports-money-over-time-chart";
export function ReportScenario({
  base,
  currency,
  days,
}: {
  base: CashForecast;
  currency: string;
  days: number;
}) {
  const [changes, setChanges] = useState<ForecastAdjustment[]>([]);
  const [kind, setKind] = useState<"expense" | "income" | "replace">("expense"),
    [title, setTitle] = useState(""),
    [date, setDate] = useState(base.today),
    [amount, setAmount] = useState(""),
    [movementId, setMovementId] = useState(""),
    [error, setError] = useState("");
  const result = forecastScenario(base, changes),
    original = base.horizons.find((h) => h.days === days)!,
    preview = result.forecast.horizons.find((h) => h.days === days)!;
  const money = (n: number | null) =>
    n === null ? "—" : formatCurrencyAmount(n, currency);
  function add() {
    if (!amount.trim()) {
      setError("Enter an amount.");
      return;
    }
    const id = String(Date.now()) + "-" + changes.length;
    const item: ForecastAdjustment =
      kind === "replace"
        ? { id, kind, movementId, amount: Number(amount) }
        : { id, kind, title, date, amount: Number(amount) };
    const next = [...changes, item],
      test = forecastScenario(base, next);
    if (test.error) {
      setError(test.error);
      return;
    }
    setChanges(next);
    setError("");
    setAmount("");
    setTitle("");
    setMovementId("");
  }
  return (
    <details className="report-v2-scenario">
      <summary>Try a what-if scenario</summary>
      <p>{scenarioNote}</p>
      <div className="report-v2-scenario-fields">
        <label>
          Change type
          <select
            aria-label="Change type"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="expense">One-off expense</option>
            <option value="income">One-off income</option>
            <option value="replace">Change one scheduled payment</option>
          </select>
        </label>
        {kind === "replace" ? (
          <label>
            Scheduled payment
            <select
              aria-label="Scheduled payment"
              value={movementId}
              onChange={(e) => setMovementId(e.target.value)}
            >
              <option value="">Choose a payment</option>
              {base.movements
                .filter(
                  (m) =>
                    !changes.some(
                      (a) => a.kind === "replace" && a.movementId === m.id,
                    ),
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} · {m.date} · {money(m.amount)}
                  </option>
                ))}
            </select>
          </label>
        ) : (
          <>
            <label>
              Description
              <input
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="For example, a new appliance"
              />
            </label>
            <label>
              Date
              <input
                type="date"
                min={base.today}
                max={base.horizons.find((h) => h.days === 90)?.end}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          {kind === "replace" ? "New payment amount" : "Amount"} ({currency})
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
      </div>
      <button
        className="button button-small"
        type="button"
        onClick={add}
        disabled={changes.length >= 10}
      >
        Add to preview
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {changes.length ? (
        <>
          <ul>
            {changes.map((a) => (
              <li key={a.id}>
                {scenarioDescription(a, base)} · {money(a.amount)}{" "}
                <button
                  type="button"
                  className="report-text-action"
                  aria-label={`Remove ${scenarioDescription(a, base)}`}
                  onClick={() =>
                    setChanges(changes.filter((x) => x.id !== a.id))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div aria-live="polite">
            <h3>Scenario · next {days} days</h3>
            <p>
              Original projected balance {money(original.closing)} · With
              changes {money(preview.closing)}
            </p>
            <p>
              Difference{" "}
              {money(
                original.closing === null || preview.closing === null
                  ? null
                  : preview.closing - original.closing,
              )}
            </p>
            {preview.lowest ? (
              <p>
                Lowest with changes {money(preview.lowest.balance)} ·{" "}
                {preview.lowest.date}
              </p>
            ) : (
              <p>Add missing balances to see a scenario projection.</p>
            )}
          </div>
          {preview.points.length ? (
            <ReportsMoneyOverTimeChart
              title="Scenario projected balance"
              currency={currency}
              points={preview.points}
            />
          ) : null}
          <button
            type="button"
            className="report-text-action"
            onClick={() => {
              setChanges([]);
              setError("");
            }}
          >
            Clear scenario
          </button>
        </>
      ) : null}
    </details>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import type { ReportCurrencyData } from "../../shared/reports/workspace";
import {
  forecastNote,
  netWorthChangeNote,
  outlookScopeNote,
  recurringNote,
} from "../../shared/reports/outlook";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { ReportsMoneyOverTimeChart } from "./reports-money-over-time-chart";
export function ReportOutlook({
  report: r,
  section,
}: {
  report: ReportCurrencyData;
  section: "trends" | "advanced";
}) {
  const [days, setDays] = useState(30),
    [expanded, setExpanded] = useState(false);
  const money = (n: number | null) =>
    n === null ? "—" : formatCurrencyAmount(n, r.currency);
  const costs = r.recurringCosts,
    forecast = r.forecast,
    change = r.netWorthChange;
  const horizon = forecast?.horizons.find((h) => h.days === days);
  return (
    <>
      {section === "trends" && costs ? (
        <section className="report-card glass report-v2-panel">
          <h2>Recurring costs</h2>
          <p>{outlookScopeNote}</p>
          <div className="report-v2-metrics">
            <p>
              Scheduled out · next 30 days{" "}
              <strong>{money(costs.outgoing30)}</strong>
            </p>
            <p>
              Scheduled in · next 30 days{" "}
              <strong>{money(costs.incoming30)}</strong>
            </p>
            <p>
              Next 12 months <strong>{money(costs.outgoingYear)}</strong>
            </p>
            <p>
              Monthly equivalent{" "}
              <strong>{money(costs.monthlyEquivalent)}</strong>
            </p>
          </div>
          <p>
            {costs.from} to {costs.to}. {recurringNote}
          </p>
          {costs.overdueCount ? (
            <p>
              {costs.overdueCount} uncompleted occurrences in the past 30 days
              are not included in upcoming totals.{" "}
              <Link href="/recurring">Review recurring payments</Link>
            </p>
          ) : null}
          {costs.rows.map((row) => (
            <article key={row.id} className="report-v2-outlook-row">
              <h3>{row.title}</h3>
              <p>
                {row.cadence.charAt(0).toUpperCase() + row.cadence.slice(1)} ·
                Money {row.direction === "in" ? "in" : "out"} ·{" "}
                {row.nextDate
                  ? `Next ${row.nextDate}`
                  : "No upcoming date in the next 12 months"}
              </p>
              {row.excludedReason ? (
                <p>{row.excludedReason}; not included in totals.</p>
              ) : (
                <p>
                  Next payment {money(row.nextAmount)} · Next 30 days{" "}
                  {money(row.cost30)} · Next 12 months {money(row.costYear)}
                </p>
              )}
              {row.latestPayment ? (
                <p>
                  Latest linked payment: {money(row.latestPayment.amount)} ·{" "}
                  {row.latestPayment.date}
                  {row.latestPayment.previous !== null
                    ? `. Previous ${money(row.latestPayment.previous)}; change ${money(row.latestPayment.amount - row.latestPayment.previous)}.`
                    : ""}
                </p>
              ) : null}
            </article>
          ))}
          {!costs.rows.length ? (
            <p>
              No active saved schedules in this currency and account selection.{" "}
              <Link href="/recurring">Add a recurring item</Link>
            </p>
          ) : null}
        </section>
      ) : null}
      {section === "advanced" && forecast && horizon ? (
        <section className="report-card glass report-v2-panel">
          <h2>Cash-flow forecast</h2>
          <div className="report-v2-actions">
            {[30, 90].map((value) => (
              <button
                key={value}
                type="button"
                className="button button-small"
                aria-pressed={days === value}
                onClick={() => setDays(value)}
              >
                Next {value} days
              </button>
            ))}
          </div>
          <p>
            {forecast.today} to {horizon.end} · Estimated spendable balance
          </p>
          <p>
            Today <strong>{money(forecast.opening)}</strong> · Scheduled in{" "}
            <strong>{money(horizon.incoming)}</strong> · Scheduled out{" "}
            <strong>{money(horizon.outgoing)}</strong> · Projected balance{" "}
            <strong>{money(horizon.closing)}</strong>
          </p>
          {horizon.lowest ? (
            <p>
              Lowest projected balance: {money(horizon.lowest.balance)} ·{" "}
              {horizon.lowest.date}
            </p>
          ) : (
            <p>
              A projection needs a recorded bank, wallet or cash balance for
              every included spendable account.
              {forecast.missingBalances.length
                ? ` Missing: ${forecast.missingBalances.join(", ")}.`
                : ""}
            </p>
          )}
          {horizon.points.length ? (
            <ReportsMoneyOverTimeChart
              title="Projected spendable balance"
              currency={r.currency}
              points={horizon.points}
            />
          ) : null}
          <p>{forecastNote}</p>
          <p>{outlookScopeNote}</p>
          {forecast.omittedSchedules.length ? (
            <details>
              <summary>
                {forecast.omittedSchedules.length} schedules excluded from cash
                forecast
              </summary>
              <ul>
                {forecast.omittedSchedules.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <h3>Upcoming cash movements</h3>
          {forecast.movements
            .filter((m) => m.date <= horizon.end)
            .slice(0, expanded ? undefined : 10)
            .map((m) => (
              <p key={m.id}>
                {m.date} · {m.title} · {m.direction === "out" ? "−" : "+"}
                {money(m.amount)}
              </p>
            ))}
          {!forecast.movements.some((m) => m.date <= horizon.end) ? (
            <p>
              No scheduled cash movements in this window. This does not mean
              there will be no spending.
            </p>
          ) : null}
          {forecast.movements.filter((m) => m.date <= horizon.end).length >
          10 ? (
            <button
              type="button"
              className="button button-small"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show fewer" : "Show all scheduled movements"}
            </button>
          ) : null}
          <Link href="/recurring">Manage schedules</Link>
        </section>
      ) : null}
      {section === "advanced" && change ? (
        <section className="report-card glass report-v2-panel">
          <h2>Why net worth changed</h2>
          <p>
            Recorded change <strong>{money(change.change)}</strong>
          </p>
          <p>{netWorthChangeNote}</p>
          {change.change === null ? (
            <p>
              A complete change is unavailable. The rows below show only
              accounts with usable dated evidence.
            </p>
          ) : (
            change.groups.map((g) => (
              <p key={g.name}>
                {g.name}: {money(g.change)}
              </p>
            ))
          )}
          {change.accounts.map((a) => (
            <article className="report-v2-outlook-row" key={a.id}>
              <h3>{a.name}</h3>
              <p>{a.issue ?? `${a.group}: ${money(a.change)}`}</p>
              {a.opening ? (
                <p>
                  Opening evidence {a.opening.date} · {money(a.opening.balance)}
                </p>
              ) : null}
              {a.closing ? (
                <p>
                  Closing evidence {a.closing.date} · {money(a.closing.balance)}
                </p>
              ) : null}
            </article>
          ))}
          <Link href="/accounts">View account history</Link>
        </section>
      ) : null}
    </>
  );
}

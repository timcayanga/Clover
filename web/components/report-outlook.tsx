"use client";
import { CategoryBrandMark } from "./category-brand-mark";
import { ReportScenario } from "./report-scenario";
import { useState } from "react";
import Link from "next/link";
import type { ReportCurrencyData } from "../../shared/reports/workspace";
import {
  forecastNote,
  netWorthChangeNote,
  outlookScopeNote,
  recurringCostPaymentChange,
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
          {costs.overdueCount ? (
            <p>
              {costs.overdueCount} uncompleted occurrences in the past 30 days
              are not included in upcoming totals.{" "}
              <Link href="/recurring">Review recurring payments</Link>
            </p>
          ) : null}
          {costs.findings?.length ? (
            <details className="report-v2-findings">
              <summary>
                {costs.findings.length} recurring findings to check
              </summary>
              {costs.findings.map((f) => (
                <article key={f.id} className="report-v2-outlook-row">
                  <h3>{f.title}</h3>
                  <p>{f.explanation}</p>
                  {f.dates.length ? (
                    <p>Due dates: {f.dates.join(", ")}</p>
                  ) : null}
                  {f.scheduleEvidence?.map((s, i) => (
                    <p key={i}>
                      {s.title} · {s.account} · {s.cadence} · {s.nextDate} ·{" "}
                      {money(s.amount)}
                    </p>
                  ))}
                  {f.transactions.map((t) => (
                    <p key={t.id}>
                      <Link
                        href={`/transactions?detail=${encodeURIComponent(t.id)}`}
                      >
                        View payment · {t.date} · {money(t.amount)}
                      </Link>
                    </p>
                  ))}
                  <p>
                    Schedules:{" "}
                    {f.scheduleIds
                      .map(
                        (id) =>
                          costs.rows.find((row) => row.id === id)?.title ??
                          "Saved schedule",
                      )
                      .join(" · ")}
                  </p>
                  <Link href="/recurring">Manage saved schedules</Link>
                </article>
              ))}
            </details>
          ) : null}
          <div className="report-recurring-list">
            <div className="report-recurring-heading" aria-hidden="true"><span/><span>Recurring payment</span><span>Amount</span><span>Next due</span><span>Category</span><span>Payment change</span></div>
            {costs.rows.map(row => {
              const delta = recurringCostPaymentChange(row);
              const changeLabel = delta ? `${delta.amount > 0 ? "+" : ""}${money(delta.amount)}${delta.percent !== null ? ` · ${delta.percent > 0 ? "+" : ""}${delta.percent}%` : ""}` : "—";
              return <Link key={row.id} className="report-recurring-row" href={`/recurring?commitment=${encodeURIComponent(row.id)}`}>
                <CategoryBrandMark categoryName={row.categoryName ?? "Other"} size={28} />
                <span className="report-recurring-row__name">{row.title}{row.excludedReason ? <small>{row.excludedReason}</small> : null}</span>
                <span className="report-recurring-row__amount">{money(row.nextAmount)}</span>
                <span className="report-recurring-row__due"><span className="report-recurring-row__due-label">Next due · </span>{row.nextDate ?? "No upcoming date"}</span>
                <span className="report-recurring-row__category">{row.categoryName ?? "Other"}</span>
                <span className="report-recurring-row__change" aria-label={`Change between recorded payments: ${changeLabel}`} title="Change between the latest two linked payments">{changeLabel}</span>
              </Link>;
            })}
          </div>
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
          <ReportScenario
            key={JSON.stringify(forecast)}
            base={forecast}
            currency={r.currency}
            days={days}
          />
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

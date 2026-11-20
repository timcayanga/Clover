"use client";
import { CategoryBrandMark } from "./category-brand-mark";
import { AccountBrandMark } from "./account-brand-mark";
import { getAccountBrand } from "@/lib/account-brand";
import { useState } from "react";
import Link from "next/link";
import type { ReportCurrencyData } from "../../shared/reports/workspace";
import { recurringCostPaymentChange } from "../../shared/reports/outlook";
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
    [expanded, setExpanded] = useState(false),
    [accountLimit, setAccountLimit] = useState(5);
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
          <div className="report-recurring-summary">
            {[
              {title:"Scheduled Out", value:costs.outgoing30, detail:"Next 30 days"},
              {title:"Scheduled In", value:costs.incoming30, detail:"Next 30 days"},
              {title:"Next 12 Months", value:costs.outgoingYear, detail:"Scheduled out"},
            ].map(metric => <div key={metric.title}>
              <span>{metric.title}</span><strong>{money(metric.value)}</strong><small>{metric.detail}</small>
            </div>)}
          </div>
          <div className="report-recurring-list">
            <div className="report-recurring-heading" aria-hidden="true">
              <span />
              <span>Recurring payment</span>
              <span>Amount</span>
              <span>Next due</span>
              <span>Category</span>
              <span>Payment change</span>
            </div>
            {costs.rows.map((row) => {
              const delta = recurringCostPaymentChange(row);
              const changeLabel = delta
                ? `${delta.amount > 0 ? "+" : ""}${money(delta.amount)}${delta.percent !== null ? ` · ${delta.percent > 0 ? "+" : ""}${delta.percent}%` : ""}`
                : "—";
              return (
                <Link
                  key={row.id}
                  className="report-recurring-row"
                  href={`/recurring?commitment=${encodeURIComponent(row.id)}`}
                >
                  <CategoryBrandMark
                    categoryName={row.categoryName ?? "Other"}
                    size={28}
                  />
                  <span className="report-recurring-row__name">
                    {row.title}
                    {row.excludedReason ? (
                      <small>{row.excludedReason}</small>
                    ) : null}
                  </span>
                  <span className="report-recurring-row__amount">
                    {money(row.nextAmount)}
                  </span>
                  <span className="report-recurring-row__due">
                    <span className="report-recurring-row__due-label">
                      Next due ·{" "}
                    </span>
                    {row.nextDate ?? "No upcoming date"}
                  </span>
                  <span className="report-recurring-row__category">
                    {row.categoryName ?? "Other"}
                  </span>
                  <span
                    className="report-recurring-row__change"
                    aria-label={`Change between recorded payments: ${changeLabel}`}
                    title="Change between the latest two linked payments"
                  >
                    {changeLabel}
                  </span>
                </Link>
              );
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
        <>
          <section className="report-card glass report-v2-panel">
            <h2>Cash-flow forecast</h2>
            <div className="report-v2-actions report-forecast-controls" aria-label="Forecast duration">
              {[30, 90].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="button button-small"
                  aria-pressed={days === value}
                  onClick={() => setDays(value)}
                >
                  {value} Days
                </button>
              ))}
            </div>
            {horizon.points.length ? (
              <ReportsMoneyOverTimeChart
                minimal
                title="Projected spendable balance"
                currency={r.currency}
                points={horizon.points}
              />
            ) : (
              <p>
                A projection needs recorded balances for the included accounts.
              </p>
            )}
          </section>
          <section className="report-card glass report-v2-panel">
            <h2>Upcoming Cash Movements</h2>
            {forecast.movements
              .filter((m) => m.date <= horizon.end)
              .slice(0, expanded ? undefined : 10)
              .map((m) => (
                <Link
                  key={m.id}
                  className="report-insight-row"
                  href={
                    m.commitmentId
                      ? `/recurring?commitment=${encodeURIComponent(m.commitmentId)}`
                      : "/recurring"
                  }
                >
                  <CategoryBrandMark
                    categoryName={m.categoryName ?? "Other"}
                    size={28}
                  />
                  <span className="report-insight-row__label">
                    {m.title}
                    <small>{m.date}</small>
                  </span>
                  <strong
                    className={m.direction === "in" ? "positive" : "negative"}
                  >
                    {m.direction === "out" ? "−" : "+"}
                    {money(m.amount)}
                  </strong>
                </Link>
              ))}
            {!forecast.movements.some((m) => m.date <= horizon.end) ? (
              <p>No scheduled cash movements in this window.</p>
            ) : null}
            {forecast.movements.filter((m) => m.date <= horizon.end).length >
            10 ? (
              <button
                type="button"
                className="button button-small"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Show Fewer" : "View More"}
              </button>
            ) : null}
          </section>
        </>
      ) : null}
      {section === "advanced" && change ? (
        <section className="report-card glass report-v2-panel">
          <h2>Why Net Worth Changed</h2>
          {change.accounts
            .filter((a) => a.opening)
            .slice(0, accountLimit)
            .map((a) => (
              <Link
                className="report-insight-row"
                key={a.id}
                href={`/accounts/${encodeURIComponent(a.id)}`}
              >
                <AccountBrandMark
                  accountBrand={getAccountBrand({
                    name: a.name,
                    type: a.type,
                    institution: a.institution,
                    logoUrl: a.logoUrl,
                  })}
                  label={a.name}
                />
                <span className="report-insight-row__label">
                  {a.name}
                  <small>
                    {a.opening!.date} · {money(a.opening!.balance)}
                    {a.closing ? ` → ${money(a.closing.balance)}` : ""}
                  </small>
                </span>
                <strong>
                  {a.change === null
                    ? "—"
                    : `${a.change > 0 ? "+" : ""}${money(a.change)}`}
                </strong>
              </Link>
            ))}
          {!change.accounts.some((a) => a.opening) ? (
            <p>No recorded opening balances yet.</p>
          ) : null}
          {change.accounts.filter((a) => a.opening).length > accountLimit ? (
            <button
              className="button button-small"
              type="button"
              onClick={() => setAccountLimit((n) => n + 5)}
            >
              View More
            </button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { reportTransactionParams } from "../../shared/reports/drilldown";
import type { ReportView } from "../../shared/reports/analysis";
import type {
  ReportCurrencyData,
  ReportsWorkspace,
  BudgetReportRow,
} from "../../shared/reports/workspace";
export const budgetReportExplanation =
  "Targets use current active spend-limit settings, starting when each budget was created. Partial periods are prorated by calendar day. Budgets can overlap, so rows are not added together. Filters narrow spending without reducing targets. Historical budget edits are not recorded.";
export function ReportCoverageDetails({
  report: r,
  href,
}: {
  report: ReportCurrencyData;
  href: string;
}) {
  const c = r.coverage;
  if (!c) return null;
  return (
    <details className="report-v2-coverage">
      <summary>
        About these figures · {c.transactionCount} transactions
        {c.reviewCount ? ` · ${c.reviewCount} to review` : ""}
      </summary>
      <ul>
        {c.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {c.missingBalanceAccounts.length ? (
        <p>Missing balances: {c.missingBalanceAccounts.join(", ")}</p>
      ) : null}
      {c.reviewCount ? (
        <Link href={href}>Open transactions needing review</Link>
      ) : null}
    </details>
  );
}
export function ReportSpendingDetails({
  report: r,
  workspace: w,
  view,
}: {
  report: ReportCurrencyData;
  workspace: ReportsWorkspace;
  view: ReportView;
}) {
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(20),
    [budgetLimit, setBudgetLimit] = useState(24);
  const merchants = (r.merchantAnalysis ?? []).filter((m) =>
    m.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const money = (n: number) => formatCurrencyAmount(n, r.currency);
  const href = (extra: Record<string, string> = {}, v = view) =>
    `/transactions?${reportTransactionParams(v, r.currency, r.analysis.from, r.analysis.to, w.categories, extra)}`;
  const budgetHref = (b: BudgetReportRow) =>
    href(
      { type: "expense", customStart: b.from, customEnd: b.to },
      {
        ...view,
        accounts:
          b.scope === "account" && b.accountId ? [b.accountId] : view.accounts,
        categories:
          b.scope === "category"
            ? [b.categoryName ?? b.categoryId ?? "__none__"]
            : view.categories,
      },
    );
  return (
    <>
      <section className="report-card glass report-v2-panel">
        <h2>Merchant analysis</h2>
        <p>
          All matching merchants, including those with spending only in the
          comparison period.
        </p>
        <label className="report-v2-search">
          Find a merchant
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(20);
            }}
            placeholder="Search merchants"
          />
        </label>
        <div className="report-v2-table">
          <table>
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Spent</th>
                <th>Comparison</th>
                <th>Change</th>
                <th>Transactions</th>
              </tr>
            </thead>
            <tbody>
              {merchants.slice(0, limit).map((m) => (
                <tr key={m.name}>
                  <th>
                    <Link href={href({ merchant: m.name, type: "expense" })}>
                      {m.name}
                    </Link>
                  </th>
                  <td>{money(m.amount)}</td>
                  <td>
                    <Link
                      href={href({
                        merchant: m.name,
                        type: "expense",
                        customStart: w.period.previousFrom,
                        customEnd: w.period.previousTo,
                      })}
                    >
                      {money(m.previous)}
                    </Link>
                  </td>
                  <td>{money(m.change)}</td>
                  <td>{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!merchants.length ? <p>No matching merchants.</p> : null}
        {merchants.length > limit ? (
          <button
            className="report-text-action"
            onClick={() => setLimit((n) => n + 20)}
          >
            Show more merchants
          </button>
        ) : null}
      </section>
      <section className="report-card glass report-v2-panel">
        <h2>Budget versus actual</h2>
        {w.paid ? (
          <>
            <p className="muted">{budgetReportExplanation}</p>
            <div className="report-v2-table">
              <table>
                <thead>
                  <tr>
                    <th>Budget / month</th>
                    <th>Target</th>
                    <th>Spent</th>
                    <th>Remaining</th>
                    <th>Over budget</th>
                  </tr>
                </thead>
                <tbody>
                  {(r.budgets ?? []).slice(0, budgetLimit).map((b) => (
                    <tr key={b.id + b.month}>
                      <th>
                        {b.name}
                        <small>
                          {b.month}
                          {b.partial ? " · Partial period" : ""}
                        </small>
                      </th>
                      <td>{money(b.target)}</td>
                      <td>
                        <Link href={budgetHref(b)}>{money(b.actual)}</Link>
                      </td>
                      <td>{money(b.remaining)}</td>
                      <td>{money(b.over)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!r.budgets?.length ? (
              <p>
                No active spend-limit budgets match this period and currency.{" "}
                <Link href="/budgeting">Open Budgeting</Link>
              </p>
            ) : null}
            {(r.budgets?.length ?? 0) > budgetLimit ? (
              <button
                className="report-text-action"
                onClick={() => setBudgetLimit((n) => n + 24)}
              >
                Show more budget months
              </button>
            ) : null}
          </>
        ) : (
          <p>
            Compare monthly budget targets and spending with{" "}
            <Link href="/pricing">Clover Plus or Pro</Link>.
          </p>
        )}
      </section>
    </>
  );
}

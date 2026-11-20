"use client";
import {
  budgetHistoryExplanation,
  importCoverageLines,
} from "../../shared/reports/history-copy";
import { MerchantLogo } from "./merchant-logo";
import { CategoryBrandMark } from "./category-brand-mark";
import { merchantSpendingChange } from "../../shared/reports/details";
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
export const budgetReportExplanation = budgetHistoryExplanation;
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
      <h3>Statement coverage</h3>
      <p>
        Account and currency filters apply. Transaction filters do not change
        coverage.
      </p>
      {(r.importCoverage ?? []).map((a) => (
        <details key={a.accountId}>
          <summary>
            {a.name} · {a.gaps.length ? "Periods to check" : "View coverage"}
          </summary>
          {importCoverageLines(a).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </details>
      ))}
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
        <label className="report-v2-search">
          Find a merchant
          <input type="search" value={query} onChange={e => {setQuery(e.target.value);setLimit(20);}} placeholder="Search merchants" />
        </label>
        <div className="report-detail-rows">
          {merchants.slice(0,limit).map(m => <Link key={m.name} className="report-detail-row" href={href({merchant:m.name,type:"expense"})}>
            <MerchantLogo transaction={{merchantRaw:m.name,merchantClean:null,merchantLogoUrl:m.merchantLogoUrl,merchantLogoNameKey:JSON.stringify([m.name,null])}} size={28} fallback={<CategoryBrandMark categoryName={m.categoryName ?? "Other"} size={28} />} />
            <span className="report-detail-row__name">{m.name}</span>
            <span className="report-detail-row__figures"><strong>{money(m.amount)}</strong><small aria-label={`Change from comparison period: ${merchantSpendingChange(m)}`}>{merchantSpendingChange(m)}</small></span>
          </Link>)}
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
            <div className="report-detail-rows">
              {(r.budgets ?? []).slice(0,budgetLimit).map(b => <Link className="report-detail-row" key={[b.id,b.month,b.from,b.revision].join(":")} href={budgetHref(b)}>
                <CategoryBrandMark categoryName={b.categoryName ?? w.categories.find(c => c.id === b.categoryId)?.name ?? "Other"} size={28} />
                <span className="report-detail-row__name">{b.name}<small>{b.from} – {b.to}{b.historyBasis === "recorded" ? "" : " · Estimated"}</small></span>
                <span className="report-detail-row__figures"><strong>Spent {money(b.actual)}</strong><small>Target {money(b.target)}</small><small>Remaining {money(b.remaining)}</small></span>
              </Link>)}
            </div>
            {!r.budgets?.length ? (
              <p>
                No spend-limit budget history matches this period and currency.{" "}
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

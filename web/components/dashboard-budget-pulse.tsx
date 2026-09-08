"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";

type BudgetProgress = {
  id: string;
  name: string;
  kind: "spend_limit" | "savings_target";
  currency: string;
  actualAmount: number;
  targetAmount: number;
  progressPercent: number;
  periodLabel: string;
  statusLabel: string;
  isAtRisk: boolean;
};
type BudgetPulse = { activeBudgetCount: number; budgets: BudgetProgress[] };

export function DashboardBudgetPulse() {
  const [pulse, setPulse] = useState<BudgetPulse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/budgets", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { overview?: BudgetPulse } | null) => {
        if (result?.overview) {
          setPulse(result.overview);
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  if (!pulse || pulse.activeBudgetCount === 0) {
    return null;
  }

  const budgets = [...pulse.budgets].sort((a, b) => Number(b.isAtRisk) - Number(a.isAtRisk)).slice(0, 3);
  return (
    <article className="dashboard-home__insight-strip glass" aria-label="Budget status">
      <div className="home-budget-progress__header">
        <p className="eyebrow">Budgeting</p>
        <Link className="dashboard-home__insight-strip-action" href="/budgeting">
          {pulse.activeBudgetCount > 3 ? `View all ${pulse.activeBudgetCount} budgets` : "Open budgeting"}
        </Link>
      </div>
      <div className="home-budget-progress__list">
        {budgets.map((budget) => {
          const actual = formatCurrencyAmount(budget.actualAmount, budget.currency);
          const target = formatCurrencyAmount(budget.targetAmount, budget.currency);
          const progress = Math.max(0, Math.min(100, budget.progressPercent));
          return (
            <Link key={budget.id} href={`/budgeting?budget=${encodeURIComponent(budget.id)}`} className={`home-budget-progress${budget.isAtRisk ? " home-budget-progress--warning" : ""}`}>
              <div className="home-budget-progress__heading">
                <strong>{budget.name}</strong>
                <span>{budget.statusLabel}</span>
              </div>
              <span className="home-budget-progress__period">{budget.periodLabel}</span>
              <div role="progressbar" aria-label={budget.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${actual} of ${target} ${budget.kind === "savings_target" ? "saved" : "spent"}`} className="home-budget-progress__bar">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="home-budget-progress__amounts">
                <span>{actual} {budget.kind === "savings_target" ? "saved" : "spent"}</span>
                <span>of {target}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </article>
  );
}

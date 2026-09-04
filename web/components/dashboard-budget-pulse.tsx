"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";

type BudgetPulse = {
  activeBudgetCount: number;
  alerts: Array<{
    id: string;
    name: string;
    currency: string;
    actualAmount: number;
    targetAmount: number;
    progressPercent: number;
    statusLabel: string;
  }>;
};

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

  const alert = pulse.alerts[0] ?? null;
  return (
    <article className="dashboard-home__insight-strip glass" aria-label="Budget status">
      <p className="eyebrow">Budgeting</p>
      <div className="dashboard-home__insight-strip-list">
        <div className={`dashboard-home__insight-strip-item${alert ? " dashboard-home__insight-strip-item--warning" : " dashboard-home__insight-strip-item--positive"}`}>
          <div className="dashboard-home__insight-strip-label">
            <span className="dashboard-home__insight-strip-emoji" aria-hidden="true">{alert ? "⚠" : "✓"}</span>
            <span>{alert ? "Needs attention" : "On track"}</span>
          </div>
          <strong>
            {alert
              ? `${alert.name} is at ${Math.round(alert.progressPercent)}% (${alert.statusLabel.toLowerCase()})`
              : `${pulse.activeBudgetCount} ${pulse.activeBudgetCount === 1 ? "budget is" : "budgets are"} being tracked`}
          </strong>
          {alert ? (
            <span>{formatCurrencyAmount(alert.actualAmount, alert.currency)} of {formatCurrencyAmount(alert.targetAmount, alert.currency)}</span>
          ) : null}
          <Link className="dashboard-home__insight-strip-action" href="/budgeting">
            Open budgeting
          </Link>
        </div>
      </div>
    </article>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import {
  clearImportActivity,
  getImportActivityTimingSummary,
  readImportActivity,
  subscribeImportActivity,
  type ImportActivitySnapshot,
} from "@/lib/import-activity";
import { buildImportResultChecklist, formatImportResultHeadline } from "@/lib/import-result-summary";
import { formatCurrencyAmount } from "@/lib/currency-format";

type BudgetAlert = {
  id: string;
  name: string;
  kindLabel: string;
  scopeLabel: string;
  periodLabel: string;
  currency: string;
  targetAmount: number;
  actualAmount: number;
  progressPercent: number;
  stage: "safe" | "watch" | "warning" | "critical" | "exceeded";
  statusLabel: string;
  statusDetail: string;
  tone: "positive" | "warning" | "danger";
  actionLabel: string;
  href: string;
};

const formatUpdatedAt = (updatedAt: number) => {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return "Just now";
  }

  const secondsAgo = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (secondsAgo < 10) return "Just now";
  if (secondsAgo < 60) return `${secondsAgo}s ago`;

  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;

  const hoursAgo = Math.floor(minutesAgo / 60);
  return `${hoursAgo}h ago`;
};

const getImportNotificationTone = (activity: ImportActivitySnapshot) => {
  if (activity.status === "error") return "Needs attention";
  if (activity.status === "done") return "Complete";
  return "In progress";
};

const getImportNotificationTitle = (activity: ImportActivitySnapshot) => {
  if (activity.status === "error") return activity.errorTitle ?? "Import needs attention";
  if (activity.status === "done") return "Import complete";
  return "Import in progress";
};

const getImportNotificationBody = (activity: ImportActivitySnapshot) => {
  const timingSummary = getImportActivityTimingSummary(activity);

  if (activity.status === "error") {
    return [activity.errorMessage ?? activity.detail ?? "Clover could not finish this import automatically.", timingSummary]
      .filter(Boolean)
      .join(" · ");
  }

  if (activity.status === "done" && activity.summary) {
    return [formatImportResultHeadline(activity.summary) || activity.detail || "Your import is ready in Clover.", timingSummary]
      .filter(Boolean)
      .join(" · ");
  }

  const fileProgress =
    activity.fileTotal > 0
      ? `${Math.min(activity.completedFiles, activity.fileTotal)} of ${activity.fileTotal} files ready`
      : "Import queued";
  const percent = `${Math.round(Math.max(0, Math.min(100, activity.progress)))}%`;
  return [activity.detail, timingSummary, `${fileProgress} · ${percent}`].filter(Boolean).join(" · ");
};

export function NotificationsClient() {
  const [activity, setActivity] = useState<ImportActivitySnapshot | null>(() => readImportActivity());
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);

  useEffect(() => subscribeImportActivity(() => setActivity(readImportActivity())), []);
  useEffect(() => {
    let cancelled = false;

    const loadBudgetAlerts = async () => {
      try {
        const response = await fetch("/api/budgets", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const result = (await response.json()) as { overview?: { alerts?: BudgetAlert[] } };
        if (!cancelled) {
          setBudgetAlerts(result.overview?.alerts ?? []);
        }
      } catch {
        if (!cancelled) {
          setBudgetAlerts([]);
        }
      }
    };

    void loadBudgetAlerts();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismissImportActivity = () => {
    clearImportActivity();
    setActivity(null);
  };
  const importChecklist = activity?.summary ? buildImportResultChecklist(activity.summary) : [];

  return (
    <CloverShell
      active="notifications"
      title="Notifications"
      kicker="Updates"
      subtitle="Track imports and Clover activity you may have dismissed."
    >
      <section className="notifications-layout">
        <div className="notifications-hero">
          <div>
            <p className="eyebrow">Notifications</p>
            <h3>Recent activity</h3>
            <p className="panel-muted">Imports keep running even when you close the progress window.</p>
          </div>
        </div>

        <div className="notifications-list">
          {activity ? (
            <article className="notification-item glass">
              <div className="notification-item__main">
                <p className="notification-item__tone">{getImportNotificationTone(activity)}</p>
                <h4>{getImportNotificationTitle(activity)}</h4>
                <p>{getImportNotificationBody(activity)}</p>
                {importChecklist.length > 0 ? (
                  <ul className="notification-item__checklist" aria-label="Import highlights">
                    {importChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {activity.fileName ? <p className="notification-item__tone">{activity.fileName}</p> : null}
              </div>
              <div className="notification-item__time">
                <time>{formatUpdatedAt(activity.updatedAt)}</time>
                <button className="button button-secondary button-small" type="button" onClick={dismissImportActivity}>
                  Dismiss
                </button>
              </div>
            </article>
          ) : (
            <article className="notification-item glass">
              <div className="notification-item__main">
                <p className="notification-item__tone">All caught up</p>
                <h4>No active import notifications</h4>
                <p>When you close an import progress window, its latest status will show here.</p>
              </div>
            </article>
          )}

          {budgetAlerts.length > 0 ? (
            <section className="notifications-budget">
              <div className="report-card__head report-card__head--compact">
                <div>
                  <p className="eyebrow">Budget alerts</p>
                  <h4>Thresholds Clover is watching</h4>
                </div>
              </div>
              <div className="notifications-budget__grid">
                {budgetAlerts.slice(0, 4).map((budget) => (
                  <article key={budget.id} className={`notification-item glass notification-item--budget notification-item--${budget.tone}`}>
                    <div className="notification-item__main">
                      <p className="notification-item__tone">{budget.kindLabel}</p>
                      <h4>{budget.name}</h4>
                      <p>
                        {budget.statusLabel} · {budget.statusDetail}
                      </p>
                      <p className="notification-item__tone">
                        {budget.scopeLabel} · {budget.periodLabel} · {formatCurrencyAmount(budget.actualAmount, budget.currency)} of{" "}
                        {formatCurrencyAmount(budget.targetAmount, budget.currency)}
                      </p>
                    </div>
                    <div className="notification-item__time">
                      <time>{Math.round(budget.progressPercent)}%</time>
                      <a className="button button-secondary button-small" href={budget.href}>
                        {budget.actionLabel}
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <article className="notification-item glass">
              <div className="notification-item__main">
                <p className="notification-item__tone">Budgets</p>
                <h4>No budget alerts yet</h4>
                <p>Set a budget in Budgeting and Clover will show threshold alerts here as limits get closer.</p>
              </div>
            </article>
          )}
        </div>
      </section>
    </CloverShell>
  );
}

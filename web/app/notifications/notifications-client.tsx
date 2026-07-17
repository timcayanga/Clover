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

type AdviserAlert = {
  id: string;
  tone: "positive" | "warning" | "danger";
  title: string;
  body: string;
  href: string;
  actionLabel: string;
};

type CircleInvitationAlert = {
  id: string;
  circleName: string;
  circleType: string;
  invitedBy: string;
  role: string;
  expiresAt: string;
  href: string;
};

const ADVISER_ALERT_DISMISSALS_KEY = "clover.adviser-alert-dismissals.v1";
const ADVISER_ALERTS_ENABLED_KEY = "clover.adviser-alerts-enabled.v1";

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
  const [adviserAlerts, setAdviserAlerts] = useState<AdviserAlert[]>([]);
  const [dismissedAdviserAlerts, setDismissedAdviserAlerts] = useState<string[]>([]);
  const [adviserAlertsEnabled, setAdviserAlertsEnabled] = useState(true);
  const [circleInvitations, setCircleInvitations] = useState<CircleInvitationAlert[]>([]);

  useEffect(() => subscribeImportActivity(() => setActivity(readImportActivity())), []);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ADVISER_ALERT_DISMISSALS_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) {
        setDismissedAdviserAlerts(parsed.filter((value): value is string => typeof value === "string"));
      }
    } catch {
      setDismissedAdviserAlerts([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/circle-invitations", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { invitations?: CircleInvitationAlert[] } | null) => {
        if (!cancelled) setCircleInvitations(result?.invitations ?? []);
      })
      .catch(() => {
        if (!cancelled) setCircleInvitations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const stored = window.localStorage.getItem(ADVISER_ALERTS_ENABLED_KEY);
    if (stored === "false") {
      setAdviserAlertsEnabled(false);
    }
  }, []);
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

  useEffect(() => {
    let cancelled = false;

    fetch("/api/adviser/alerts", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { alerts?: AdviserAlert[] } | null) => {
        if (!cancelled) {
          setAdviserAlerts(result?.alerts ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAdviserAlerts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const dismissImportActivity = () => {
    clearImportActivity();
    setActivity(null);
  };
  const dismissAdviserAlert = (alertId: string) => {
    setDismissedAdviserAlerts((current) => {
      const next = Array.from(new Set([...current, alertId])).slice(-50);
      window.localStorage.setItem(ADVISER_ALERT_DISMISSALS_KEY, JSON.stringify(next));
      return next;
    });
  };
  const toggleAdviserAlerts = () => {
    setAdviserAlertsEnabled((current) => {
      const next = !current;
      window.localStorage.setItem(ADVISER_ALERTS_ENABLED_KEY, String(next));
      return next;
    });
  };
  const importChecklist = activity?.summary ? buildImportResultChecklist(activity.summary) : [];
  const visibleAdviserAlerts = adviserAlerts.filter((alert) => !dismissedAdviserAlerts.includes(alert.id));

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
          {circleInvitations.length > 0 ? (
            <section className="notifications-budget">
              <div className="report-card__head report-card__head--compact">
                <div>
                  <p className="eyebrow">Circle invitations</p>
                  <h4>People want to manage money with you</h4>
                </div>
              </div>
              <div className="notifications-budget__grid">
                {circleInvitations.map((invitation) => (
                  <article key={invitation.id} className="notification-item glass notification-item--positive">
                    <div className="notification-item__main">
                      <p className="notification-item__tone">{invitation.circleType} Circle</p>
                      <h4>{invitation.circleName}</h4>
                      <p>{invitation.invitedBy} invited you to join as {invitation.role}.</p>
                    </div>
                    <div className="notification-item__time">
                      <time>Expires {new Date(invitation.expiresAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</time>
                      <a className="button button-primary button-small" href={invitation.href}>View invitation</a>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

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

          {adviserAlertsEnabled && visibleAdviserAlerts.length > 0 ? (
            <section className="notifications-budget">
              <div className="report-card__head report-card__head--compact">
                <div>
                  <p className="eyebrow">Adviser alerts</p>
                  <h4>Worth a look right now</h4>
                </div>
                <button className="button button-secondary button-small" type="button" onClick={toggleAdviserAlerts}>
                  Pause alerts
                </button>
              </div>
              <div className="notifications-budget__grid">
                {visibleAdviserAlerts.map((alert) => (
                  <article key={alert.id} className={`notification-item glass notification-item--${alert.tone}`}>
                    <div className="notification-item__main">
                      <p className="notification-item__tone">Adviser</p>
                      <h4>{alert.title}</h4>
                      <p>{alert.body}</p>
                    </div>
                    <div className="notification-item__time">
                      <a className="button button-secondary button-small" href={alert.href}>
                        {alert.actionLabel}
                      </a>
                      <button className="button button-secondary button-small" type="button" onClick={() => dismissAdviserAlert(alert.id)}>
                        Dismiss
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : adviserAlerts.length > 0 ? (
            <article className="notification-item glass">
              <div className="notification-item__main">
                <p className="notification-item__tone">Adviser alerts paused</p>
                <h4>Notifications are still available when you want them</h4>
                <p>Adviser will keep generating grounded signals, but this device will not show them here until you resume alerts.</p>
              </div>
              <div className="notification-item__time">
                <button className="button button-secondary button-small" type="button" onClick={toggleAdviserAlerts}>
                  Resume alerts
                </button>
              </div>
            </article>
          ) : null}

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

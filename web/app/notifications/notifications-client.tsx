"use client";

import { useEffect, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import {
  clearImportActivity,
  readImportActivity,
  subscribeImportActivity,
  type ImportActivitySnapshot,
} from "@/lib/import-activity";
import { formatImportResultHeadline } from "@/lib/import-result-summary";
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

type CircleInvitationAlert = {
  id: string;
  circleName: string;
  circleType: string;
  invitedBy: string;
  role: string;
  expiresAt: string;
  href: string;
};

const LAST_SUCCESSFUL_IMPORT_KEY = "clover.last-successful-import-at.v1";
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000;

const readLastSuccessfulImportAt = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = Number(window.localStorage.getItem(LAST_SUCCESSFUL_IMPORT_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : null;
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
  const fileName = activity.fileName?.trim();
  if (activity.status === "error") return fileName ? `${fileName} failed to upload` : activity.errorTitle ?? "Upload failed";
  if (activity.status === "done") return fileName ? `${fileName} uploaded` : "Upload complete";
  return fileName ? `Uploading ${fileName}` : "Upload in progress";
};

const getImportNotificationBody = (activity: ImportActivitySnapshot) => {
  if (activity.status === "error") {
    return activity.errorMessage ?? activity.detail ?? "Clover could not finish this upload.";
  }

  if (activity.status === "done" && activity.summary) {
    return formatImportResultHeadline(activity.summary) || activity.detail || "Your data is ready in Clover.";
  }

  return activity.detail || `${Math.round(Math.max(0, Math.min(100, activity.progress)))}% complete`;
};

export function NotificationsClient() {
  const [activity, setActivity] = useState<ImportActivitySnapshot | null>(() => readImportActivity());
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [lastSuccessfulImportAt, setLastSuccessfulImportAt] = useState<number | null>(null);
  const [reminderReady, setReminderReady] = useState(false);
  const [circleInvitations, setCircleInvitations] = useState<CircleInvitationAlert[]>([]);

  useEffect(() => subscribeImportActivity(() => setActivity(readImportActivity())), []);
  useEffect(() => {
    setLastSuccessfulImportAt(readLastSuccessfulImportAt());
    setReminderReady(true);
  }, []);
  useEffect(() => {
    if (activity?.status !== "done") {
      return;
    }

    window.localStorage.setItem(LAST_SUCCESSFUL_IMPORT_KEY, String(activity.updatedAt));
    setLastSuccessfulImportAt(activity.updatedAt);
  }, [activity]);

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
  const importAge = lastSuccessfulImportAt ? Date.now() - lastSuccessfulImportAt : Number.POSITIVE_INFINITY;
  const uploadReminder = !reminderReady
    ? null
    : importAge >= MONTH_IN_MS
      ? {
          tone: "Monthly reminder",
          title: "Upload this month's data",
          body: "Add your latest statements or receipts to keep Clover current.",
        }
      : importAge >= WEEK_IN_MS
        ? {
            tone: "Weekly reminder",
            title: "Upload your latest data",
            body: "A quick upload keeps your balances and trends up to date.",
          }
        : null;

  return (
    <CloverShell
      active="notifications"
      title="Notifications"
    >
      <section className="notifications-layout">
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
                  <article key={invitation.id} className="notification-item notification-item--positive">
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
            <article className="notification-item">
              <div className="notification-item__main">
                <p className="notification-item__tone">{getImportNotificationTone(activity)}</p>
                <h4>{getImportNotificationTitle(activity)}</h4>
                <p>{getImportNotificationBody(activity)}</p>
              </div>
              <div className="notification-item__time">
                <time>{formatUpdatedAt(activity.updatedAt)}</time>
                <button className="button button-secondary button-small" type="button" onClick={dismissImportActivity}>
                  Dismiss
                </button>
              </div>
            </article>
          ) : null}

          {uploadReminder ? (
            <article className="notification-item notification-item--reminder">
              <div className="notification-item__main">
                <p className="notification-item__tone">{uploadReminder.tone}</p>
                <h4>{uploadReminder.title}</h4>
                <p>{uploadReminder.body}</p>
              </div>
              <div className="notification-item__time">
                <a className="button button-secondary button-small" href="/transactions">
                  Upload data
                </a>
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
                  <article key={budget.id} className={`notification-item notification-item--budget notification-item--${budget.tone}`}>
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
          ) : null}
        </div>
      </section>
    </CloverShell>
  );
}

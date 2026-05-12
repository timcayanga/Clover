"use client";

import { useEffect, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import {
  clearImportActivity,
  readImportActivity,
  subscribeImportActivity,
  type ImportActivitySnapshot,
} from "@/lib/import-activity";

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
  if (activity.status === "error") {
    return activity.errorMessage ?? activity.detail ?? "Clover could not finish this import automatically.";
  }

  const fileProgress =
    activity.fileTotal > 0
      ? `${Math.min(activity.completedFiles, activity.fileTotal)} of ${activity.fileTotal} files ready`
      : "Import queued";
  const percent = `${Math.round(Math.max(0, Math.min(100, activity.progress)))}%`;
  return [activity.detail, `${fileProgress} · ${percent}`].filter(Boolean).join(" · ");
};

export function NotificationsClient() {
  const [activity, setActivity] = useState<ImportActivitySnapshot | null>(() => readImportActivity());

  useEffect(() => subscribeImportActivity(() => setActivity(readImportActivity())), []);

  const dismissImportActivity = () => {
    clearImportActivity();
    setActivity(null);
  };

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
        </div>
      </section>
    </CloverShell>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import { OnboardingMissions } from "@/components/onboarding-missions";
import {
  dismissInAppNotifications,
  inAppNotificationsChangedEvent,
  loadInAppNotificationFeed,
  markInAppNotificationsRead,
} from "@/lib/in-app-notifications.client";
import { formatInAppNotificationDateTime, type InAppNotification } from "@/lib/in-app-notifications";
import { getNavigationIconSrc } from "@/lib/navigation-icons";
import { TokenUsageDonut } from "@/components/token-usage-donut";

export function NotificationsClient() {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [filter, setFilter] = useState("All");
  const [readIds, setReadIds] = useState<string[]>([]);
  const [marking, setMarking] = useState(false);
  const confirm = useRef<HTMLDialogElement>(null);
  const requestVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [dismissingAll, setDismissingAll] = useState(false);

  const loadNotifications = useCallback(async (fresh = false) => {
    const version = ++requestVersion.current;
    try {
      const feed = await loadInAppNotificationFeed(null, fresh);
      if (version !== requestVersion.current) return;
      setNotifications(feed.notifications);
      setError(null);
      setReadIds(feed.readIds ?? []);
    } catch {
      if (version === requestVersion.current) setError("Clover could not load notifications right now.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const refresh = () => void loadNotifications(true);
    window.addEventListener(inAppNotificationsChangedEvent, refresh);
    const usageRefreshTimer = window.setInterval(refresh, 60_000);
    return () => {
      requestVersion.current++;
      window.removeEventListener(inAppNotificationsChangedEvent, refresh);
      window.clearInterval(usageRefreshTimer);
    };
  }, [loadNotifications]);

  const dismissOne = async (notificationId: string) => {
    const previous = notifications;
    setDismissing((current) => new Set(current).add(notificationId));
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
    try {
      await dismissInAppNotifications({ ids: [notificationId] });
    } catch {
      setNotifications(previous);
      setError("That notification could not be dismissed. Please try again.");
    } finally {
      setDismissing((current) => {
        const next = new Set(current);
        next.delete(notificationId);
        return next;
      });
    }
  };

  const dismissAll = async () => {
    const previous = notifications;
    setDismissingAll(true);
    setNotifications([]);
    try {
      await dismissInAppNotifications({ dismissAll: true });
    } catch {
      setNotifications(previous);
      setError("Notifications could not be dismissed. Please try again.");
    } finally {
      setDismissingAll(false);
    }
  };

  const visible = notifications.filter(item => filter === "All" || (filter === "Unread" ? !readIds.includes(item.id) : filter === "Needs attention" ? ["warning", "danger"].includes(item.tone) : !["warning", "danger"].includes(item.tone)));
  const markRead = async (ids: string[]) => {
    setMarking(true);
    try { await markInAppNotificationsRead(ids); setReadIds(current => [...new Set([...current, ...ids])]); }
    catch { setError("Unable to mark notifications as read. Please try again."); }
    finally { setMarking(false); }
  };
  return (
    <CloverShell active="notifications" title="Notifications">
      <section className="notifications-layout">
        <OnboardingMissions surface="notifications" />
        <nav className="notifications-filters" aria-label="Notification views">{["All", "Unread", "Needs attention", "Activity"].map(tab => <button type="button" key={tab} aria-pressed={filter === tab} onClick={() => setFilter(tab)}>{tab}</button>)}</nav>
        <div className="notifications-toolbar">
          <p>{notifications.length} active notification{notifications.length === 1 ? "" : "s"}</p>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => confirm.current?.showModal()}
            disabled={loading || dismissingAll || notifications.length === 0}
          >
            {dismissingAll ? "Clearing..." : "Clear All"}
          </button>
        </div>

        <dialog ref={confirm} className="notifications-confirm" aria-labelledby="clear-notifications-title"><h2 id="clear-notifications-title">Clear notifications?</h2><p>This clears the feed without changing your underlying records.</p><div><button className="button button-secondary" type="button" disabled={dismissingAll} onClick={() => confirm.current?.close()}>Cancel</button><button className="button button-primary" type="button" disabled={dismissingAll} onClick={() => { void dismissAll().finally(() => confirm.current?.close()); }}>Clear notifications</button></div></dialog>
        <button type="button" className="button button-secondary button-small" disabled={loading || marking || !notifications.some(item=>!readIds.includes(item.id))} onClick={() => void markRead(notifications.map(item=>item.id))}>Mark all as read</button>
        {error ? <div className="notifications-status notifications-status--error" role="alert">{error}<button type="button" className="button button-secondary" onClick={() => void loadNotifications(true)}>Try again</button></div> : null}
        {loading ? <p className="notifications-status">Loading notifications...</p> : null}
        {!loading && !error && visible.length === 0 ? (
          <div className="notifications-empty">
            <img src={getNavigationIconSrc("notifications")} alt="" aria-hidden="true" />
            <h3>You’re all caught up</h3>
            <p>New account, transaction, payment, budget, Circle, and investment updates will appear here.</p>
          </div>
        ) : null}

        <div className="notifications-list">
          {visible.map((notification) => (
            <article key={notification.id} className={`notification-item notification-item--${notification.tone}`}>
              <Link
                href={notification.productHref}
                className="notification-item__product-link"
                aria-label={`Open ${notification.productLabel}`}
                title={`Open ${notification.productLabel}`}
              >
                <img src={getNavigationIconSrc(notification.product)} alt="" aria-hidden="true" />
              </Link>
              <div className="notification-item__main">
                <h4>{notification.title}</h4>
                <p>{notification.message}</p>
                {notification.progress ? (
                  <div className="notification-item__progress">
                    <TokenUsageDonut percent={notification.progress.percent} label={notification.progress.label} compact />
                    <span>
                      {notification.progress.used.toLocaleString()} of {notification.progress.limit.toLocaleString()} tokens
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="notification-item__actions">
                <time dateTime={notification.createdAt}>{formatInAppNotificationDateTime(notification.createdAt)}</time>
                {notification.href && notification.ctaLabel ? (
                  <Link className="button button-primary button-small" href={notification.href}>
                    {notification.ctaLabel}
                  </Link>
                ) : null}
                {!readIds.includes(notification.id) ? <button type="button" className="notification-item__dismiss" disabled={marking} onClick={() => void markRead([notification.id])}>Mark as read</button> : null}
                <button
                  type="button"
                  className="notification-item__dismiss"
                  onClick={() => void dismissOne(notification.id)}
                  disabled={dismissing.has(notification.id)}
                  aria-label={`Dismiss ${notification.title}`}
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </CloverShell>
  );
}

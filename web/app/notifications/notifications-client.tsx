"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import { OnboardingMissions } from "@/components/onboarding-missions";
import {
  dismissInAppNotifications,
  inAppNotificationsChangedEvent,
  loadInAppNotificationFeed,
} from "@/lib/in-app-notifications.client";
import type { InAppNotification } from "@/lib/in-app-notifications";
import { getNavigationIconSrc } from "@/lib/navigation-icons";

const formatNotificationTime = (createdAt: string) => {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return "Just now";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(new Date(timestamp));
};

export function NotificationsClient() {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [dismissingAll, setDismissingAll] = useState(false);

  const loadNotifications = useCallback(async (fresh = false) => {
    try {
      const feed = await loadInAppNotificationFeed(null, fresh);
      setNotifications(feed.notifications);
      setError(null);
    } catch {
      setError("Clover could not load notifications right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
    const refresh = () => void loadNotifications(true);
    window.addEventListener(inAppNotificationsChangedEvent, refresh);
    return () => window.removeEventListener(inAppNotificationsChangedEvent, refresh);
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

  return (
    <CloverShell active="notifications" title="Notifications">
      <section className="notifications-layout">
        <OnboardingMissions surface="notifications" />
        <div className="notifications-toolbar">
          <p>{notifications.length} active notification{notifications.length === 1 ? "" : "s"}</p>
          <button
            type="button"
            className="button button-secondary button-small"
            onClick={() => void dismissAll()}
            disabled={loading || dismissingAll || notifications.length === 0}
          >
            {dismissingAll ? "Dismissing..." : "Dismiss all"}
          </button>
        </div>

        {error ? <p className="notifications-status notifications-status--error" role="alert">{error}</p> : null}
        {loading ? <p className="notifications-status">Loading notifications...</p> : null}
        {!loading && notifications.length === 0 ? (
          <div className="notifications-empty">
            <img src={getNavigationIconSrc("notifications")} alt="" aria-hidden="true" />
            <h3>You’re all caught up</h3>
            <p>New account, transaction, payment, budget, Circle, and investment updates will appear here.</p>
          </div>
        ) : null}

        <div className="notifications-list">
          {notifications.map((notification) => (
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
                <p className="notification-item__tone">{notification.productLabel}</p>
                <h4>{notification.title}</h4>
                <p>{notification.message}</p>
              </div>
              <div className="notification-item__actions">
                <time dateTime={notification.createdAt}>{formatNotificationTime(notification.createdAt)}</time>
                {notification.href && notification.ctaLabel ? (
                  <Link className="button button-primary button-small" href={notification.href}>
                    {notification.ctaLabel}
                  </Link>
                ) : null}
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

import {
  IN_APP_NOTIFICATIONS_CHANGED_EVENT,
  IN_APP_NOTIFICATIONS_READ_EVENT,
  notifyInAppNotificationsChanged,
  notifyInAppNotificationsRead,
  type InAppNotificationFeed,
} from "@/lib/in-app-notifications";
import { clearJsonRequestCache, fetchJsonOnce } from "@/lib/request-dedupe";

const notificationCachePrefix = "in-app-notifications:";

export const loadInAppNotificationFeed = async (workspaceId?: string | null, fresh = false) => {
  if (fresh) clearJsonRequestCache(notificationCachePrefix);
  const key = `${notificationCachePrefix}${workspaceId || "selected"}`;
  const response = await fetchJsonOnce<InAppNotificationFeed>({
    key,
    route: "/api/notifications",
    workspaceId,
    input: "/api/notifications",
    cacheTtlMs: 30_000,
  });
  if (!response.ok || !response.json) throw new Error("Unable to load notifications.");
  return response.json;
};

export async function loadInAppNotificationCount(userId: string, workspaceId?: string | null, fresh = false) {
  const key = `${notificationCachePrefix}count:${JSON.stringify([userId, workspaceId])}`;
  if (fresh) clearJsonRequestCache(key);
  const response = await fetchJsonOnce<{ count: number }>({
    key, route: "/api/notifications/count", workspaceId, input: "/api/notifications/count", cacheTtlMs: 30_000,
  });
  if (!response.ok || !response.json) throw new Error("Unable to load notification count.");
  return response.json.count;
}

export const dismissInAppNotifications = async (input: { ids?: string[]; dismissAll?: boolean }) => {
  const response = await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as InAppNotificationFeed | { error?: unknown } | null;
  if (!response.ok) throw new Error("Unable to dismiss notifications.");
  clearJsonRequestCache(notificationCachePrefix);
  notifyInAppNotificationsChanged();
  return payload as InAppNotificationFeed;
};

export const markInAppNotificationsRead = async (ids: string[]) => {
  if (ids.length === 0) return null;
  const response = await fetch("/api/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markRead: true, ids }),
  });
  const payload = (await response.json().catch(() => null)) as InAppNotificationFeed | { error?: unknown } | null;
  if (!response.ok) throw new Error("Unable to mark notifications as read.");
  clearJsonRequestCache(notificationCachePrefix);
  notifyInAppNotificationsRead(payload as InAppNotificationFeed);
  return payload as InAppNotificationFeed;
};

export const inAppNotificationsChangedEvent = IN_APP_NOTIFICATIONS_CHANGED_EVENT;
export const inAppNotificationsReadEvent = IN_APP_NOTIFICATIONS_READ_EVENT;

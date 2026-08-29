import {
  IN_APP_NOTIFICATIONS_CHANGED_EVENT,
  notifyInAppNotificationsChanged,
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

export const inAppNotificationsChangedEvent = IN_APP_NOTIFICATIONS_CHANGED_EVENT;

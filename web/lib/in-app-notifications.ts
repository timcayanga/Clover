import type { NavigationIconName } from "@/lib/navigation-icons";

export type InAppNotificationPriority = "critical" | "high" | "normal" | "low";
export type InAppNotificationTone = "danger" | "warning" | "positive" | "neutral";

export type InAppNotification = {
  id: string;
  product: NavigationIconName;
  productLabel: string;
  productHref: string;
  title: string;
  message: string;
  tone: InAppNotificationTone;
  priority: InAppNotificationPriority;
  createdAt: string;
  href: string | null;
  ctaLabel: string | null;
};

export type InAppNotificationFeed = {
  notifications: InAppNotification[];
  count: number;
  workspaceId: string | null;
};

export const IN_APP_NOTIFICATIONS_CHANGED_EVENT = "clover:in-app-notifications-changed";

export const notifyInAppNotificationsChanged = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(IN_APP_NOTIFICATIONS_CHANGED_EVENT));
  }
};

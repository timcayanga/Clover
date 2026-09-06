import { prisma } from "@/lib/prisma";
import {
  defaultNotificationTemplates,
  type NotificationTemplateView,
} from "@/lib/notification-template-rules";

export async function loadNotificationTemplates(
  environment: string,
): Promise<NotificationTemplateView[]> {
  const rows = await prisma.notificationTemplate.findMany({
    where: { environment },
  });
  const merged = new Map(defaultNotificationTemplates.map((t) => [t.key, t]));
  for (const row of rows)
    merged.set(row.key, {
      ...row,
      triggerKey: row.triggerKey as NotificationTemplateView["triggerKey"],
      emailEnabledAt: row.emailEnabledAt?.toISOString() ?? null,
    });
  return [...merged.values()];
}

// Only missing-table rollout errors may use defaults. Other failures surface,
// rather than unexpectedly re-enabling an Admin-disabled message.
export async function loadRuntimeNotificationTemplates(environment: string) {
  try {
    return await loadNotificationTemplates(environment);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2021"
    )
      return defaultNotificationTemplates;
    throw error;
  }
}

import type { InAppNotification } from "./in-app-notifications";
import { reportDay } from "../../shared/reports/analysis";

export const INSIGHT_MINIMUM_TRANSACTIONS = 10;

export function activityInsightNotifications(
  workspaceId: string,
  timeZone: string,
  groups: {
    key: string;
    name: string;
    rows: { date: Date; createdAt: Date; currency: string }[];
  }[],
  now: Date,
): InAppNotification[] {
  const today = reportDay(now, timeZone);
  return groups.flatMap(({ key, name, rows }) => {
    const datesByCurrency = new Map<string, { days: string[]; readyAt: Date }>();
    for (const row of rows) {
      const day = reportDay(row.date, timeZone);
      if (day > today) continue;
      const currency = row.currency;
      const group = datesByCurrency.get(currency) ?? { days: [], readyAt: row.createdAt };
      group.days.push(day);
      if (row.createdAt > group.readyAt) group.readyAt = row.createdAt;
      datesByCurrency.set(currency, group);
    }

    return [...datesByCurrency].flatMap(([currency, { days, readyAt }]) => {
      if (days.length < INSIGHT_MINIMUM_TRANSACTIONS) return [];
      days.sort();
      const params = new URLSearchParams({
        section: "spending", range: "custom", from: days[0], to: days[days.length - 1],
        currency, transfers: "exclude",
      });
      return [{
        id: `activity-insights:${workspaceId}:${key}:${currency}`,
        product: "reports",
        productLabel: "Reports",
        productHref: "/reports",
        title: `Your insights from ${name} are ready`,
        message: `${days.length} ${currency} transactions are recorded. See spending for those dates in this Profile’s report.`,
        tone: "positive",
        priority: "normal",
        createdAt: readyAt.toISOString(),
        href: `/reports?${params}`,
        ctaLabel: "View insights",
      }];
    });
  });
}

import type { InAppNotification } from "./in-app-notifications";
import { reportDay } from "../../shared/reports/analysis";

export const INSIGHT_MINIMUM_TRANSACTIONS = 10;
export const ACTIVITY_INSIGHT_FEED_DAYS = 7;
export const FIRST_INSIGHT_HISTORY_DAYS = 90;

export function firstInsightNotification(
  workspaceId: string,
  timeZone: string,
  rows: { date: Date; createdAt: Date; currency: string; type: "expense" | "income" | "transfer" }[],
  now: Date,
): InAppNotification | undefined {
  const today = reportDay(now, timeZone);
  const oldestReadyAt = +now - ACTIVITY_INSIGHT_FEED_DAYS * 86_400_000;
  const groups = new Map<string, { dates: string[]; hasSpending: boolean }>();
  for (const row of [...rows].sort((a, b) => +a.createdAt - +b.createdAt)) {
    const day = reportDay(row.date, timeZone);
    if (day > today || row.createdAt > now || row.type === "transfer") continue;
    const group = groups.get(row.currency) ?? { dates: [], hasSpending: false };
    group.dates.push(day);
    group.hasSpending ||= row.type === "expense";
    groups.set(row.currency, group);
    if (group.dates.length < INSIGHT_MINIMUM_TRANSACTIONS || !group.hasSpending) continue;
    // An established Profile stays out of the first-insight feed.
    if (+row.createdAt < oldestReadyAt) return;
    group.dates.sort();
    const params = new URLSearchParams({
      section: "spending", range: "custom", from: group.dates[0], to: group.dates.at(-1)!,
      currency: row.currency, transfers: "exclude", review: "confirmed",
    });
    return {
      id: `first-activity-insight:${workspaceId}`,
      product: "reports",
      productLabel: "Reports",
      productHref: "/reports",
      title: "Your first spending insight is ready",
      message: `Clover has ${group.dates.length} confirmed ${row.currency} transactions. See where your money went in this Profile.`,
      tone: "positive",
      priority: "normal",
      href: `/reports?${params}`,
      ctaLabel: "See where it went",
      createdAt: row.createdAt.toISOString(),
    };
  }
}

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

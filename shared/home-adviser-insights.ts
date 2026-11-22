export type HomeInsight = {
  emoji: string;
  label: string;
  parts: Array<string | { amount: number; currency: string }>;
  href: string;
  actionLabel: string;
  kind?: "reminder";
  tone: "neutral" | "positive" | "warning";
};

// Serializable, read-only advice shared by web and native. Monetary parts stay
// separate so every client can honor the user's hide-balances preference.
export function buildHomeAdviserInsights(input: {
  currency: string;
  backfilledDate?: string;
  reportEntries?: number;
  importedEntries?: number;
  hasRecentTransactionActivity?: boolean;
  categorySpike: { name: string; delta: number } | null;
  paymentTitles: string[];
  recurringCount: number;
  weekly: { income: number; expense: number; transfer: number };
  previousWeeklyExpense: number;
  monthNet: number;
  hasRecentTransactions: boolean;
  recentReviewCount: number;
}): HomeInsight[] {
  const items: HomeInsight[] = [];
  const amount = (value: number) => ({ amount: value, currency: input.currency });
  if (input.categorySpike) items.push({
    emoji: "📈", label: "Spending spike", tone: "warning",
    parts: [`${input.categorySpike.name} is up `, amount(input.categorySpike.delta), " vs the previous 30 days."],
    href: `/transactions?category=${encodeURIComponent(input.categorySpike.name)}`, actionLabel: "Review category",
  });
  if (input.paymentTitles.length) items.push({
    emoji: "🗓️", label: "Upcoming payment", tone: "warning",
    parts: [`${input.paymentTitles.join(", ")} ${input.paymentTitles.length === 1 ? "is" : "are"} due in the next 7 days.`],
    href: "/recurring", actionLabel: "Review payments",
  });
  if (input.recurringCount) items.push({
    emoji: "🔁", label: "Recurring check", tone: "neutral",
    parts: [`${input.recurringCount} potential recurring payment${input.recurringCount === 1 ? "" : "s"} found.`],
    href: "/recurring", actionLabel: "Review recurring",
  });
  if (input.previousWeeklyExpense > input.weekly.expense) items.push({
    emoji: "🌿", label: "Spending eased", tone: "positive",
    parts: ["You spent ", amount(input.previousWeeklyExpense - input.weekly.expense), " less than last week."],
    href: "/adviser?section=trends", actionLabel: "See the trend",
  });
  if (input.monthNet > 0) items.push({
    emoji: "✨", label: "Positive cash flow", tone: "positive",
    parts: [amount(input.monthNet), " more came in than went out this month."],
    href: "/adviser?section=trends", actionLabel: "Open Ask Clover",
  });
  if (input.hasRecentTransactions && input.recentReviewCount === 0) items.push({
    emoji: "✅", label: "Recent review", tone: "positive",
    parts: ["No recent transactions need review. Older transactions may still need attention."],
    href: "/transactions", actionLabel: "View transactions",
  });
  if (input.backfilledDate) {
    const date = new Date(input.backfilledDate + "T00:00:00Z");
    const month = date.toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"});
    const from = input.backfilledDate.slice(0,7) + "-01";
    const to = new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).toISOString().slice(0,10);
    items.unshift({emoji:"📊",label:"Latest report",parts:[`Your ${month} report is ready.`],tone:"neutral",actionLabel:"View report",
      href:`/reports?section=overview&range=custom&from=${from}&to=${to}&currency=${encodeURIComponent(input.currency)}&transfers=exclude`});
  } else if (input.reportEntries) {
    const period = input.hasRecentTransactions ? "weekly" : "monthly";
    const source = (input.importedEntries ?? 0) > input.reportEntries / 2 ? "imported transactions" : "recorded transactions";
    items.unshift({ emoji: "📊", label: "Latest report", parts: [`Your ${period} report is ready with your ${source}.`],
      href: `/reports?section=overview&range=${input.hasRecentTransactions ? "7d" : "30d"}&currency=${encodeURIComponent(input.currency)}`, actionLabel: "View report", tone: "neutral" });
  } else if (input.hasRecentTransactions && input.reportEntries === undefined) {
    const delta = input.weekly.expense - input.previousWeeklyExpense;
    const parts: HomeInsight["parts"] = input.weekly.expense > 0
      ? [amount(input.weekly.expense), " in spending recorded this week", ...(input.weekly.transfer > 0 ? ["; ", amount(input.weekly.transfer), " moved between accounts"] : []), "."]
      : ["No spending was recorded this week."];
    parts.push(...(input.previousWeeklyExpense > 0
      ? [` Spending is ${delta >= 0 ? "up" : "down"} `, amount(Math.abs(delta)), " vs last week."]
      : [input.weekly.expense > 0 ? " There is not enough prior activity to compare yet." : " There is no spending to compare yet."]));
    items.push({ emoji: "🗓️", label: "Weekly summary", parts, href: "/adviser", actionLabel: "Open Ask Clover", tone: input.weekly.income >= input.weekly.expense ? "positive" : "warning" });
  }
  const insights = items.slice(0, 3);
  if (!input.hasRecentTransactionActivity && !input.hasRecentTransactions) insights.push({
    kind: "reminder", emoji: "📝", label: "Add recent transactions", tone: "neutral",
    parts: ["Add a transaction, upload a file, or sync a linked account to keep your insights up to date."],
    href: "/transactions", actionLabel: "Add a transaction",
  });
  return insights;
}

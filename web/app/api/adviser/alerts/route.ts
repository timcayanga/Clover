import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { isMissingBudgetTableError, loadBudgetWorkspaceData } from "@/lib/budgeting-data";

export const dynamic = "force-dynamic";

const sumExpenses = (transactions: Array<{ amount: unknown; type: string }>) =>
  transactions.reduce((sum, transaction) => (transaction.type === "expense" ? sum + Math.abs(Number(transaction.amount)) : sum), 0);

export async function GET() {
  try {
    const context = await resolveBudgetingWorkspace();
    if (!context.workspaceId) {
      return NextResponse.json({ alerts: [] });
    }

    const now = new Date();
    const nextFourteenDays = new Date(now);
    nextFourteenDays.setDate(nextFourteenDays.getDate() + 14);
    const [transactions, recurring, budgetData] = await Promise.all([
      prisma.transaction.findMany({
        where: { workspaceId: context.workspaceId, isExcluded: false },
        orderBy: { date: "desc" },
        take: 5000,
        select: { date: true, amount: true, type: true },
      }),
      prisma.recurringPattern.findMany({
        where: { workspaceId: context.workspaceId, nextExpectedDate: { gte: now, lte: nextFourteenDays } },
        orderBy: { nextExpectedDate: "asc" },
        take: 4,
        select: { id: true, merchantClean: true, merchantRaw: true, amount: true, currency: true, nextExpectedDate: true },
      }),
      loadBudgetWorkspaceData(context.workspaceId).catch((error) => {
        if (isMissingBudgetTableError(error)) return null;
        throw error;
      }),
    ]);

    const alerts: Array<{ id: string; tone: "positive" | "warning" | "danger"; title: string; body: string; href: string; actionLabel: string }> = [];
    const anchor = transactions[0]?.date ?? now;
    const currentStart = new Date(anchor);
    currentStart.setDate(currentStart.getDate() - 30);
    const previousStart = new Date(anchor);
    previousStart.setDate(previousStart.getDate() - 60);
    const current = transactions.filter((transaction) => transaction.date > currentStart && transaction.date <= anchor);
    const previous = transactions.filter((transaction) => transaction.date > previousStart && transaction.date <= currentStart);
    const currentSpend = sumExpenses(current);
    const previousSpend = sumExpenses(previous);
    const spendingChange = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;

    if (spendingChange !== null && spendingChange >= 15) {
      alerts.push({
        id: "adviser-spending-change",
        tone: spendingChange >= 30 ? "danger" : "warning",
        title: "Spending moved up",
        body: `Spending is up ${Math.round(spendingChange)}% versus the previous available 30-day window.`,
        href: "/adviser",
        actionLabel: "Open Adviser",
      });
    }

    if (recurring.length > 0) {
      const recurringTotal = recurring.reduce((sum, item) => sum + Math.abs(Number(item.amount ?? 0)), 0);
      alerts.push({
        id: "adviser-upcoming-bills",
        tone: recurringTotal > 0 ? "warning" : "positive",
        title: "Bills are coming up",
        body: `${recurring.length} recurring item${recurring.length === 1 ? " is" : "s are"} expected within the next 14 days${recurringTotal > 0 ? `, totaling about ${recurringTotal.toLocaleString("en-PH", { style: "currency", currency: recurring[0].currency || "PHP" })}` : ""}.`,
        href: "/recurring",
        actionLabel: "Review recurring",
      });
    }

    for (const budget of budgetData?.overview.alerts.slice(0, 3) ?? []) {
      alerts.push({
        id: `adviser-budget-${budget.id}`,
        tone: budget.tone === "danger" ? "danger" : "warning",
        title: budget.name,
        body: `${budget.statusLabel} · ${Math.round(budget.progressPercent)}% of ${budget.periodLabel.toLowerCase()} limit used.`,
        href: budget.href,
        actionLabel: budget.actionLabel,
      });
    }

    return NextResponse.json({ alerts: alerts.slice(0, 6), generatedAt: now.toISOString() });
  } catch (error) {
    console.error("Unable to load Adviser alerts", error);
    return NextResponse.json({ alerts: [] });
  }
}

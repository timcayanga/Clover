import { reportDay, shiftDay } from "../../shared/reports/analysis";
import { resolveFinancialTransactionType } from "./transaction-directions";
import { activityInsightNotifications, firstInsightNotification, ACTIVITY_INSIGHT_FEED_DAYS, FIRST_INSIGHT_HISTORY_DAYS } from "./activity-insight-notifications";
import { buildActiveWorkspaceTransactionWhere } from "./transaction-query";
import { prisma } from "./prisma";
import { normalizeRegionalPreferences } from "./regional-preferences";

export async function loadActivityInsightNotifications(workspaceId: string, now: Date) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { user: { select: { regionalPreferences: true } } },
  });
  if (!workspace) return [];
  const { timeZone } = normalizeRegionalPreferences(workspace.user.regionalPreferences);
  const today = reportDay(now, timeZone);
  const weekday = new Date(today + "T00:00:00Z").getUTCDay();
  const weekKey = shiftDay(today, -((weekday + 6) % 7));
  const recent = new Date(+now - ACTIVITY_INSIGHT_FEED_DAYS * 86_400_000);
  const firstHistoryFrom = new Date(+now - FIRST_INSIGHT_HISTORY_DAYS * 86_400_000);
  const rows = await prisma.transaction.findMany({
    where: buildActiveWorkspaceTransactionWhere(workspaceId, {
      workspaceId,
      createdAt: { gte: firstHistoryFrom, lte: now }, reviewStatus: { in: ["confirmed", "edited"] },
      type: { in: ["expense", "income"] }, isTransfer: false, amount: { not: 0 },
      OR: [
        { importFile: { status: "done" } },
        { importFileId: null, finverseTransactionRecord: { isNot: null } },
        { importFileId: null, rawPayload: { path: ["source"], equals: "manual" } },
        { importFileId: null, rawPayload: { path: ["source"], equals: "adviser_manual" } },
      ],
    }),
    select: {
      date: true, createdAt: true, currency: true, type: true, isTransfer: true,
      merchantRaw: true, merchantClean: true, description: true,
      amount: true, category: { select: { name: true } }, account: { select: { institution: true } },
      importFile: { select: { id: true, fileName: true } },
      finverseTransactionRecord: { select: { connection: { select: { id: true, institutionName: true } } } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1000,
  });

  const groups = new Map<string, { key: string; name: string; rows: typeof rows }>();
  for (const row of rows) {
    const bank = row.finverseTransactionRecord?.connection;
    if (row.createdAt < recent) continue;
    if (!row.importFile && reportDay(row.createdAt, timeZone) < weekKey) continue;
    const key = row.importFile ? `upload:${row.importFile.id}` : bank ? `bank:${bank.id}:${weekKey}` : `manual:${weekKey}`;
    const name = row.importFile?.fileName ?? bank?.institutionName ?? (bank ? "your bank sync" : "your manual entries");
    const group = groups.get(key) ?? { key, name, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const first = firstInsightNotification(workspaceId, timeZone, rows.map(row => ({
    ...row, type: resolveFinancialTransactionType({ ...row, categoryName: row.category?.name, institution: row.account.institution }),
  })), now);
  const sourceInsights = activityInsightNotifications(workspaceId, timeZone, [...groups.values()], now);
  return first ? [first, ...sourceInsights] : sourceInsights;
}

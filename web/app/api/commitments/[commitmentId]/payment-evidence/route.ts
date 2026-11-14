import { NextResponse } from "next/server";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { buildActiveWorkspaceTransactionWhere } from "@/lib/transaction-query";
import { parseRecurringTracking } from "@/lib/recurring-tracking";
import { matchRecurringPayment, recurringPaymentWindow, sharesRecurringPaymentIdentity } from "@/lib/recurring-payment-evidence";

export async function GET(request: Request, { params }: { params: Promise<{ commitmentId: string }> }) {
  try {
    const userId = await isLocalDevHost() ? "local-admin" : (await requireAuth()).userId;
    const { commitmentId } = await params;
    const dueDate = new URL(request.url).searchParams.get("dueDate") ?? "";
    const item = await prisma.financialCommitment.findUnique({ where: { id: commitmentId } });
    if (!item) return NextResponse.json({ error: "Recurring bill not found." }, { status: 404 });
    await assertWorkspaceAccess(userId, item.workspaceId);
    const bill = { ...item, amount: item.amount?.toString() ?? null, tracking: parseRecurringTracking(item.tracking) };
    const window = recurringPaymentWindow(bill, dueDate);
    if (!window) return NextResponse.json({ evidence: null });
    const [rows, peers, account] = await Promise.all([
      prisma.transaction.findMany({
        where: buildActiveWorkspaceTransactionWhere(item.workspaceId, {
          date: { gte: window.start, lt: window.end },
          type: "expense", isTransfer: false, isExcluded: false,
          reviewStatus: { notIn: ["rejected", "duplicate_skipped"] },
          currency: item.currency, amount: { in: [item.amount!, item.amount!.negated()] },
          ...(item.accountId ? { accountId: item.accountId } : {}),
        }),
        select: { id: true, date: true, accountId: true, amount: true, currency: true, merchantClean: true, merchantRaw: true, reviewStatus: true, reviewPriority: true },
      }),
      prisma.financialCommitment.findMany({
        where: { workspaceId: item.workspaceId, id: { not: item.id }, status: "active", kind: "planned_payment", currency: item.currency, amount: item.amount },
        select: { title: true, counterparty: true, amount: true, currency: true, accountId: true, kind: true, status: true, tracking: true, recurrence: true },
      }),
      item.accountId ? prisma.account.findFirst({
        where: { id: item.accountId, workspaceId: item.workspaceId },
        select: {
          finverseAccountLink: { select: { unlinkedAt: true, connection: { select: { lastSyncedAt: true } } } },
          lunchFlowAccountLink: { select: { connection: { select: { lastSyncedAt: true } } } },
        },
      }) : null,
    ]);
    const syncDates = [account?.finverseAccountLink?.unlinkedAt ? null : account?.finverseAccountLink?.connection.lastSyncedAt,
      account?.lunchFlowAccountLink?.connection.lastSyncedAt].flatMap(date => date ? [date.toISOString()] : []).sort();
    const evidence = matchRecurringPayment(bill, dueDate, rows.map(row => ({
      ...row, date: row.date.toISOString(), amount: row.amount.toString(),
    })), syncDates.at(-1) ?? null, peers.some(peer => sharesRecurringPaymentIdentity(bill, {
      ...peer, amount: peer.amount?.toString() ?? null, tracking: parseRecurringTracking(peer.tracking),
    })));
    return NextResponse.json({ evidence }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHORIZED") return NextResponse.json({ error: "Sign in to check payments." }, { status: 401 });
    if (code === "WORKSPACE_NOT_FOUND") return NextResponse.json({ error: "Recurring bill not found." }, { status: 404 });
    console.error("Unable to check recurring payment evidence", error);
    return NextResponse.json({ error: "Payment evidence is unavailable." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { parseCommitmentPayload, serializeFinancialCommitment } from "@/lib/commitments";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";

export const dynamic = "force-dynamic";

const resolveCommitmentsRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveCommitmentsRouteUserId();
    const payload = parseCommitmentPayload((await request.json()) as Record<string, unknown>);

    if (!payload.workspaceId || !payload.kind || !payload.title) {
      return NextResponse.json({ error: "workspaceId, kind, and title are required" }, { status: 400 });
    }
    if (payload.plannedPaymentDate && payload.dueDate && new Date(payload.plannedPaymentDate) > new Date(payload.dueDate)) {
      return NextResponse.json({ error: "Planned payment date must be on or before the due date" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, payload.workspaceId);

    if (payload.tracking) {
      if (payload.amount !== null && Number(payload.amount) < 0) return NextResponse.json({ error: "Amount must be non-negative" }, { status: 400 });
      if (payload.tracking.endDate && payload.dueDate && payload.tracking.endDate < payload.dueDate.slice(0, 10)) return NextResponse.json({ error: "End date must be on or after the next due date" }, { status: 400 });
      if (payload.kind === "reminder" && (!payload.tracking.totalPayments || !payload.dueDate || payload.recurrence === "once")) return NextResponse.json({ error: "Installments need a payment count, next date, and repeating frequency" }, { status: 400 });
      const linkedAccountIds = [payload.accountId, payload.tracking.liabilityAccountId].filter((id): id is string => Boolean(id));
      const uniqueIds = [...new Set(linkedAccountIds)];
      if (uniqueIds.length && await prisma.account.count({ where: { id: { in: uniqueIds }, workspaceId: payload.workspaceId! } }) !== uniqueIds.length) return NextResponse.json({ error: "Choose an account in this Profile" }, { status: 400 });
    }

    const requestedEvidenceIds = payload.evidenceTransactionIds.length > 0
      ? payload.evidenceTransactionIds
      : payload.transactionId
        ? [payload.transactionId]
        : [];
    const validEvidence = requestedEvidenceIds.length > 0
      ? await prisma.transaction.findMany({
          where: { id: { in: requestedEvidenceIds }, workspaceId: payload.workspaceId, deletedAt: null },
          select: { id: true },
        })
      : [];
    if (validEvidence.length !== requestedEvidenceIds.length) {
      return NextResponse.json({ error: "One or more linked transactions are unavailable" }, { status: 400 });
    }
    const evidenceTransactionIds = validEvidence.map((transaction) => transaction.id);
    const { workspaceId, kind, title } = payload;

    const result = await prisma.$transaction(async (tx) => {
      // Serialize linked creation within a Profile, including simultaneous retries.
      if (evidenceTransactionIds.length) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
        const existing = await tx.financialCommitment.findFirst({
          where: { workspaceId, OR: [
            { transactionId: { in: evidenceTransactionIds } },
            ...evidenceTransactionIds.map((id) => ({ evidenceTransactionIds: { array_contains: [id] } })),
          ] },
          select: { id: true },
        });
        if (existing) return { duplicate: true as const, commitment: null };
      }
      const commitment = await tx.financialCommitment.create({
      data: {
        workspaceId,
        kind,
        title,
        counterparty: payload.counterparty,
        amount: payload.amount,
        currency: payload.currency,
        categoryName: payload.categoryName,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        plannedPaymentDate: payload.plannedPaymentDate ? new Date(payload.plannedPaymentDate) : null,
        recurrence: payload.recurrence,
        nextDueDate: payload.nextDueDate ? new Date(payload.nextDueDate) : payload.dueDate ? new Date(payload.dueDate) : null,
        tracking: payload.tracking ?? undefined,
        notes: payload.notes,
        accountId: payload.accountId,
        transactionId: evidenceTransactionIds[0] ?? payload.transactionId,
        evidenceTransactionIds,
        statementCheckpointId: payload.statementCheckpointId,
        status: payload.status,
        source: "manual",
        confidence: 100,
      },
      include: {
        account: true,
        transaction: {
          include: {
            account: {
              select: { name: true },
            },
          },
        },
      },
    });
      return { duplicate: false as const, commitment };
    });
    if (result.duplicate) return NextResponse.json({ error: "This transaction is already linked to a recurring item." }, { status: 409 });
    const commitment = result.commitment;
    invalidateWorkspaceSummaryCache(payload.workspaceId);

    return NextResponse.json({ commitment: serializeFinancialCommitment(commitment) }, { status: 201 });
  } catch (error) {
    console.error("Unable to create commitment", error);
    return NextResponse.json({ error: "Unable to create recurring item" }, { status: 400 });
  }
}

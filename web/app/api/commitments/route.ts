import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { parseCommitmentPayload, serializeFinancialCommitment } from "@/lib/commitments";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

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

    const commitment = await prisma.financialCommitment.create({
      data: {
        workspaceId: payload.workspaceId,
        kind: payload.kind,
        title: payload.title,
        counterparty: payload.counterparty,
        amount: payload.amount,
        currency: payload.currency,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        plannedPaymentDate: payload.plannedPaymentDate ? new Date(payload.plannedPaymentDate) : null,
        recurrence: payload.recurrence,
        nextDueDate: payload.nextDueDate ? new Date(payload.nextDueDate) : payload.dueDate ? new Date(payload.dueDate) : null,
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

    return NextResponse.json({ commitment: serializeFinancialCommitment(commitment) }, { status: 201 });
  } catch (error) {
    console.error("Unable to create commitment", error);
    return NextResponse.json({ error: "Unable to create recurring item" }, { status: 400 });
  }
}

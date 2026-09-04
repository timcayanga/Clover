import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { parseCommitmentPayload, serializeFinancialCommitment } from "@/lib/commitments";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";

export const dynamic = "force-dynamic";

const resolveCommitmentRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ commitmentId: string }> }
) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveCommitmentRouteUserId();
    const { commitmentId } = await params;
    const current = await prisma.financialCommitment.findUnique({
      where: { id: commitmentId },
    });

    if (!current) {
      return NextResponse.json({ error: "Recurring item not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, current.workspaceId);
    const body = (await request.json()) as Record<string, unknown>;
    const payload = parseCommitmentPayload({
      workspaceId: current.workspaceId,
      kind: body.kind ?? current.kind,
      title: body.title ?? current.title,
      counterparty: Object.hasOwn(body, "counterparty") ? body.counterparty : current.counterparty,
      amount: Object.hasOwn(body, "amount") ? body.amount : current.amount?.toString(),
      currency: body.currency ?? current.currency,
      dueDate: Object.hasOwn(body, "dueDate") ? body.dueDate : current.dueDate?.toISOString(),
      plannedPaymentDate: Object.hasOwn(body, "plannedPaymentDate") ? body.plannedPaymentDate : current.plannedPaymentDate?.toISOString(),
      recurrence: body.recurrence ?? current.recurrence,
      nextDueDate: Object.hasOwn(body, "nextDueDate") ? body.nextDueDate : current.nextDueDate?.toISOString(),
      notes: Object.hasOwn(body, "notes") ? body.notes : current.notes,
      categoryName: Object.hasOwn(body, "categoryName") ? body.categoryName : current.categoryName,
      accountId: Object.hasOwn(body, "accountId") ? body.accountId : current.accountId,
      transactionId: Object.hasOwn(body, "transactionId") ? body.transactionId : current.transactionId,
      evidenceTransactionIds: Object.hasOwn(body, "evidenceTransactionIds") ? body.evidenceTransactionIds : current.evidenceTransactionIds,
      statementCheckpointId: Object.hasOwn(body, "statementCheckpointId") ? body.statementCheckpointId : current.statementCheckpointId,
      status: body.status ?? current.status,
    });

    if (!payload.kind || !payload.title) {
      return NextResponse.json({ error: "A title and valid recurring type are required" }, { status: 400 });
    }
    if (payload.plannedPaymentDate && payload.dueDate && new Date(payload.plannedPaymentDate) > new Date(payload.dueDate)) {
      return NextResponse.json({ error: "Planned payment date must be on or before the due date" }, { status: 400 });
    }

    const requestedEvidenceIds = payload.evidenceTransactionIds.length > 0
      ? payload.evidenceTransactionIds
      : payload.transactionId
        ? [payload.transactionId]
        : [];
    const validEvidence = requestedEvidenceIds.length > 0
      ? await prisma.transaction.findMany({
          where: { id: { in: requestedEvidenceIds }, workspaceId: current.workspaceId, deletedAt: null },
          select: { id: true },
        })
      : [];
    if (validEvidence.length !== requestedEvidenceIds.length) {
      return NextResponse.json({ error: "One or more linked transactions are unavailable" }, { status: 400 });
    }
    const evidenceTransactionIds = validEvidence.map((transaction) => transaction.id);

    const commitment = await prisma.financialCommitment.update({
      where: { id: commitmentId },
      data: {
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
        categoryName: payload.categoryName,
        accountId: payload.accountId,
        transactionId: evidenceTransactionIds[0] ?? null,
        evidenceTransactionIds,
        statementCheckpointId: payload.statementCheckpointId,
        status: payload.status,
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
    invalidateWorkspaceSummaryCache(current.workspaceId);

    return NextResponse.json({ commitment: serializeFinancialCommitment(commitment) });
  } catch (error) {
    console.error("Unable to update commitment", error);
    return NextResponse.json({ error: "Unable to update recurring item" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ commitmentId: string }> }
) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveCommitmentRouteUserId();
    const { commitmentId } = await params;
    const commitment = await prisma.financialCommitment.findUnique({
      where: { id: commitmentId },
      select: { workspaceId: true },
    });

    if (!commitment) {
      return NextResponse.json({ error: "Recurring item not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, commitment.workspaceId);
    await prisma.financialCommitment.delete({ where: { id: commitmentId } });
    invalidateWorkspaceSummaryCache(commitment.workspaceId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Unable to delete commitment", error);
    return NextResponse.json({ error: "Unable to delete recurring item" }, { status: 400 });
  }
}

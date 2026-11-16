import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { commitmentRecurrenceLabels, serializeFinancialCommitment } from "@/lib/commitments";
import type { CommitmentRecurrence } from "@prisma/client";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { invalidateWorkspaceSummaryCache } from "@/lib/workspace-summary-cache";

export const dynamic = "force-dynamic";

const resolveRecurringPatternRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const readString = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const readOptionalString = (payload: Record<string, unknown>, key: string) => {
  if (!(key in payload)) {
    return undefined;
  }

  const value = readString(payload[key]);
  return value || null;
};

const readOptionalDate = (payload: Record<string, unknown>, key: string) => {
  const value = readOptionalString(payload, key);
  if (value === undefined) {
    return undefined;
  }
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const readOptionalRecurrence = (payload: Record<string, unknown>): CommitmentRecurrence | null | undefined => {
  const value = readOptionalString(payload, "recurrence");
  if (value === undefined || value === null) {
    return value;
  }

  return value in commitmentRecurrenceLabels ? (value as CommitmentRecurrence) : undefined;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ patternId: string }> }
) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveRecurringPatternRouteUserId();
    const { patternId } = await params;
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const pattern = await prisma.recurringPattern.findUnique({
      where: { id: patternId },
    });

    if (!pattern) {
      return NextResponse.json({ error: "Recurring suggestion not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, pattern.workspaceId);

    const detectedTitle = pattern.merchantClean?.trim() || pattern.merchantRaw.trim();
    const amountOverride = readOptionalString(payload, "amount");
    const currencyOverride = readOptionalString(payload, "currency");
    const dueDateOverride = readOptionalDate(payload, "dueDate");
    const plannedPaymentDateOverride = readOptionalDate(payload, "plannedPaymentDate");
    const accountIdOverride = readOptionalString(payload, "accountId");
    const notesOverride = readOptionalString(payload, "notes");
    const title = readOptionalString(payload, "title") ?? detectedTitle;
    const counterparty = readOptionalString(payload, "counterparty") ?? detectedTitle;
    const amount = amountOverride === undefined ? pattern.amount : amountOverride;
    const currency = currencyOverride || pattern.currency;
    const dueDate = dueDateOverride === undefined ? pattern.nextExpectedDate : dueDateOverride;
    const recurrence: CommitmentRecurrence = readOptionalRecurrence(payload) ?? pattern.frequency ?? ("monthly" as CommitmentRecurrence);
    const accountId = accountIdOverride === undefined ? pattern.accountId : accountIdOverride;
    const notes =
      notesOverride === undefined
        ? `Detected from ${pattern.transactionCount} matching transaction${pattern.transactionCount === 1 ? "" : "s"}.`
        : notesOverride;
    const rawEvidenceIds = Array.isArray(payload.evidenceTransactionIds)
      ? Array.from(new Set(payload.evidenceTransactionIds.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)))
      : [];
    const validEvidence = rawEvidenceIds.length > 0
      ? await prisma.transaction.findMany({
          where: { id: { in: rawEvidenceIds }, workspaceId: pattern.workspaceId, deletedAt: null },
          select: { id: true },
        })
      : [];
    if (validEvidence.length !== rawEvidenceIds.length) {
      return NextResponse.json({ error: "One or more linked transactions are unavailable" }, { status: 400 });
    }
    const evidenceTransactionIds = validEvidence.map((transaction) => transaction.id);
    if (plannedPaymentDateOverride && dueDate && plannedPaymentDateOverride > dueDate) {
      return NextResponse.json({ error: "Planned payment date must be on or before the due date" }, { status: 400 });
    }

    const commitment = await prisma.$transaction(async (tx) => {
      const savedCommitment = await tx.financialCommitment.create({
        data: {
          workspaceId: pattern.workspaceId,
          kind: "planned_payment",
          title,
          counterparty,
          amount,
          currency,
          dueDate,
          plannedPaymentDate: plannedPaymentDateOverride ?? null,
          recurrence,
          nextDueDate: dueDate,
          accountId,
          transactionId: evidenceTransactionIds[0] ?? null,
          evidenceTransactionIds,
          status: "active",
          source: "recurring_detection",
          confidence: pattern.confidence,
          notes,
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

      await tx.recurringPattern.delete({ where: { id: pattern.id } });
      return savedCommitment;
    });
    invalidateWorkspaceSummaryCache(pattern.workspaceId);

    return NextResponse.json({ commitment: serializeFinancialCommitment(commitment) }, { status: 201 });
  } catch (error) {
    console.error("Unable to confirm recurring pattern", error);
    return NextResponse.json({ error: "Unable to add recurring item" }, { status: 400 });
  }
}

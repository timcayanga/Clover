import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ImportedLineItem = {
  description: string;
  amount: number | null;
  quantity?: number | null;
  participantAllocations?: Array<{
    participantName: string;
    amount: number;
  }>;
};

type ImportedAllocation = {
  participantName: string;
  charged: number | null;
  paid: number | null;
  due: number | null;
};

export const isImportedSplitBillStructure = (params: {
  total: number | string | null | undefined;
  lineItems: unknown[];
  allocations: Array<{
    participantName?: string | null;
    participant_name?: string | null;
    charged?: number | string | null;
    paid?: number | string | null;
    due?: number | string | null;
  }>;
}) => {
  const total = Number(params.total);
  if (!Number.isFinite(total) || total <= 0 || params.lineItems.length === 0) {
    return false;
  }

  const validParticipantCount = params.allocations.filter((allocation) => {
    const participantName = String(allocation.participantName ?? allocation.participant_name ?? "").trim();
    const shareCandidates = [allocation.charged, allocation.due, allocation.paid]
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    return Boolean(participantName) && shareCandidates.length > 0;
  }).length;

  return validParticipantCount >= 2;
};

export const ensureImportedSplitBill = async (params: {
  workspaceId: string;
  transactionId: string;
  merchantName: string;
  billDate: Date;
  currency: string;
  total: number;
  fileName: string;
  storageKey?: string | null;
  lineItems: ImportedLineItem[];
  allocations: ImportedAllocation[];
  payerName?: string | null;
  confidence: number;
}) => {
  const allocations = params.allocations
    .map((allocation) => ({
      ...allocation,
      participantName: allocation.participantName.trim(),
      share: allocation.charged ?? allocation.due ?? allocation.paid,
    }))
    .filter(
      (allocation): allocation is typeof allocation & { share: number } =>
        Boolean(allocation.participantName) &&
        typeof allocation.share === "number" &&
        Number.isFinite(allocation.share) &&
        allocation.share > 0
    );
  if (allocations.length < 2) return null;

  const workspace = await prisma.workspace.findUnique({
    where: { id: params.workspaceId },
    select: {
      userId: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
  });
  if (!workspace) return null;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.splitBill.findUnique({
      where: { transactionId: params.transactionId },
      select: { id: true },
    });
    if (existing) return existing;

    const dateLabel = params.billDate.toISOString().slice(0, 10);
    const groupName = `${params.merchantName || "Shared bill"} · ${dateLabel}`;
    const group = await tx.splitBillGroup.create({
      data: { userId: workspace.userId, name: groupName },
      select: { id: true },
    });

    const participantRows = allocations.map((allocation) => ({
      id: randomUUID(),
      name: allocation.participantName,
      share: allocation.share,
    }));
    const participantByName = new Map(
      participantRows.map((participant) => [participant.name.trim().toLowerCase(), participant] as const)
    );
    const explicitPayerName = String(params.payerName ?? "").trim();
    const ownerFirstName = String(workspace.user.firstName ?? "").trim();
    const ownerFullName = [workspace.user.firstName, workspace.user.lastName].filter(Boolean).join(" ").trim();
    const payerCandidates = [
      explicitPayerName,
      ownerFullName,
      ownerFirstName,
    ]
      .filter(Boolean)
      .map((name) => name.toLowerCase());
    const payerParticipant =
      payerCandidates
        .map((candidate) => participantByName.get(candidate))
        .find((participant): participant is (typeof participantRows)[number] => Boolean(participant)) ?? null;
    const payerWasExplicit = Boolean(
      explicitPayerName &&
      payerParticipant &&
      payerParticipant.name.trim().toLowerCase() === explicitPayerName.toLowerCase()
    );
    await tx.splitBillGroupMember.createMany({
      data: participantRows.map((participant, index) => ({
        groupId: group.id,
        name: participant.name,
        sortOrder: index,
      })),
    });
    for (const participant of participantRows) {
      await tx.splitBillPerson.upsert({
        where: { userId_name: { userId: workspace.userId, name: participant.name } },
        update: {},
        create: { userId: workspace.userId, name: participant.name },
      });
    }

    const lineItemSummary = params.lineItems
      .filter((item) => item.description.trim())
      .map((item) => `${item.quantity && item.quantity > 1 ? `${item.quantity} × ` : ""}${item.description}${item.amount !== null ? ` — ${item.amount.toFixed(2)}` : ""}`)
      .join("\n");
    const shareTotal = participantRows.reduce((sum, participant) => sum + participant.share, 0);
    const bill = await tx.splitBill.create({
      data: {
        userId: workspace.userId,
        transactionId: params.transactionId,
        groupId: group.id,
        title: params.merchantName || "Shared bill",
        note: lineItemSummary || "Imported split-bill note",
        billDate: params.billDate,
        currency: params.currency,
        sourceType: "receipt",
        merchantName: params.merchantName || "Shared bill",
        receiptFileName: params.fileName,
        receiptStorageKey: params.storageKey ?? null,
        receiptConfidence: Math.max(
          0,
          Math.min(100, Math.round(params.confidence > 0 && params.confidence <= 1 ? params.confidence * 100 : params.confidence))
        ),
        total: new Prisma.Decimal(params.total),
        rawPayload: {
          source: "digital_note_split_bill",
          declaredTotal: params.total,
          participantShareTotal: shareTotal,
          reconciliationDifference: Number((params.total - shareTotal).toFixed(2)),
          payerKnown: Boolean(payerParticipant),
          payerName: payerParticipant?.name ?? null,
          payerSource: payerWasExplicit ? "document" : payerParticipant ? "clover_account_owner" : null,
          payerReviewRequired: Boolean(payerParticipant && !payerWasExplicit) || !payerParticipant,
          lineItems: params.lineItems,
          participantShares: participantRows.map((participant) => ({
            participantName: participant.name,
            charged: participant.share,
          })),
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await tx.splitBillParticipant.createMany({
      data: participantRows.map((participant) => ({
        id: participant.id,
        billId: bill.id,
        name: participant.name,
      })),
    });
    const hasExactItemAllocations = params.lineItems.some((item) => (item.participantAllocations ?? []).length > 0);
    const normalizedLineItems = params.lineItems
      .filter((item) => item.description.trim() && item.amount !== null && Number.isFinite(item.amount))
      .map((item, index) => {
        const itemId = randomUUID();
        const exactAllocations = (item.participantAllocations ?? []).flatMap((allocation) => {
          const participant = participantByName.get(allocation.participantName.trim().toLowerCase());
          return participant && Number.isFinite(allocation.amount) && allocation.amount > 0
            ? [{ participantId: participant.id, value: Number(allocation.amount.toFixed(2)) }]
            : [];
        });
        const proportionalAllocations =
          exactAllocations.length > 0 || shareTotal <= 0
            ? []
            : participantRows.map((participant) => ({
                participantId: participant.id,
                value: Number((((item.amount ?? 0) * participant.share) / shareTotal).toFixed(2)),
              }));
        return {
          id: itemId,
          description: `${item.quantity && item.quantity > 1 ? `${item.quantity} × ` : ""}${item.description.trim()}`,
          amount: item.amount ?? 0,
          sortOrder: index,
          allocations: exactAllocations.length > 0 ? exactAllocations : proportionalAllocations,
          hasDocumentAllocations: exactAllocations.length > 0,
        };
      });
    const splitBillItemSplits = Object.fromEntries(
      normalizedLineItems.map((item) => [
        item.id,
        {
          splitMethod: "exact",
          allocations: item.allocations.map((allocation) => ({
            participantId: allocation.participantId,
            value: allocation.value.toFixed(2),
          })),
        },
      ])
    );
    await tx.splitBill.update({
      where: { id: bill.id },
      data: {
        rawPayload: {
          source: "digital_note_split_bill",
          declaredTotal: params.total,
          participantShareTotal: shareTotal,
          reconciliationDifference: Number((params.total - shareTotal).toFixed(2)),
          payerKnown: Boolean(payerParticipant),
          payerName: payerParticipant?.name ?? null,
          payerSource: payerWasExplicit ? "document" : payerParticipant ? "clover_account_owner" : null,
          payerReviewRequired: Boolean(payerParticipant && !payerWasExplicit) || !payerParticipant,
          itemAllocationSource: hasExactItemAllocations
            ? normalizedLineItems.every((item) => item.hasDocumentAllocations)
              ? "document_cells"
              : "document_cells_with_estimated_gaps"
            : "estimated_from_participant_totals",
          lineItems: params.lineItems,
          participantShares: participantRows.map((participant) => ({
            participantName: participant.name,
            charged: participant.share,
          })),
          splitBillItemSplits,
        } as Prisma.InputJsonValue,
      },
    });
    if (normalizedLineItems.length > 0) {
      await tx.splitBillItem.createMany({
        data: normalizedLineItems.map((item) => ({
          id: item.id,
          billId: bill.id,
          description: item.description,
          amount: new Prisma.Decimal(item.amount),
          sortOrder: item.sortOrder,
        })),
      });
      const itemParticipants = normalizedLineItems.flatMap((item) =>
        item.allocations.map((allocation) => ({
          itemId: item.id,
          participantId: allocation.participantId,
        }))
      );
      if (itemParticipants.length > 0) {
        await tx.splitBillItemParticipant.createMany({ data: itemParticipants });
      }
    }
    if (payerParticipant) {
      await tx.splitBillPayment.create({
        data: {
          billId: bill.id,
          participantId: payerParticipant.id,
          amount: new Prisma.Decimal(params.total),
          note: payerWasExplicit
            ? "Payer shown in imported document"
            : "Payer inferred from the Clover account owner; review recommended",
        },
      });
    }
    return bill;
  });
};

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ImportedLineItem = {
  description: string;
  amount: number | null;
  quantity?: number | null;
};

type ImportedAllocation = {
  participantName: string;
  charged: number | null;
  paid: number | null;
  due: number | null;
};

export const ensureImportedSplitBill = async (params: {
  workspaceId: string;
  transactionId: string;
  merchantName: string;
  billDate: Date;
  currency: string;
  total: number;
  fileName: string;
  lineItems: ImportedLineItem[];
  allocations: ImportedAllocation[];
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
    select: { userId: true },
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
        receiptConfidence: Math.max(0, Math.min(100, Math.round(params.confidence))),
        total: new Prisma.Decimal(params.total),
        rawPayload: {
          source: "digital_note_split_bill",
          declaredTotal: params.total,
          participantShareTotal: shareTotal,
          reconciliationDifference: Number((params.total - shareTotal).toFixed(2)),
          payerKnown: false,
          payerReviewRequired: true,
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
    const shareItems = participantRows.map((participant, index) => ({
      id: randomUUID(),
      participantId: participant.id,
      description: `${participant.name} share`,
      amount: participant.share,
      sortOrder: index,
    }));
    await tx.splitBillItem.createMany({
      data: shareItems.map((item) => ({
        id: item.id,
        billId: bill.id,
        description: item.description,
        amount: new Prisma.Decimal(item.amount),
        sortOrder: item.sortOrder,
      })),
    });
    await tx.splitBillItemParticipant.createMany({
      data: shareItems.map((item) => ({
        itemId: item.id,
        participantId: item.participantId,
      })),
    });
    return bill;
  });
};

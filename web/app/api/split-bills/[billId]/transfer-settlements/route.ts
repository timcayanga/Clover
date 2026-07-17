import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { appendSplitBillActivity, parseAmountValue, serializeSplitBillRecord, splitBillGroupMemberOrderBy, splitBillItemOrderBy } from "@/lib/split-bill";
import { createSplitBillTransferSettlement, loadSplitBillTransferSettlementsForBill } from "@/lib/split-bill-transfer-settlements";
import { recordAdviserActionCompletion } from "@/lib/adviser-actions";

export const dynamic = "force-dynamic";

const transferSettlementSchema = z.object({
  fromParticipantId: z.string().trim().min(1),
  fromParticipantName: z.string().trim().min(1),
  toParticipantId: z.string().trim().min(1),
  toParticipantName: z.string().trim().min(1),
  amount: z.union([z.string(), z.number()]),
  note: z.string().trim().nullable().optional(),
});

const getBillInclude = {
  transaction: {
    select: {
      id: true,
      workspaceId: true,
      merchantRaw: true,
      merchantClean: true,
      date: true,
      amount: true,
      currency: true,
      account: {
        select: {
          name: true,
        },
      },
    },
  },
  group: {
    include: {
      members: {
        orderBy: splitBillGroupMemberOrderBy,
      },
    },
  },
  participants: true,
  items: {
    include: {
      participants: true,
    },
    orderBy: splitBillItemOrderBy,
  },
  payments: true,
};

export async function POST(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { billId } = await params;
    const body = transferSettlementSchema.parse(await request.json());
    const amount = parseAmountValue(body.amount);

    if (!amount || amount <= 0) {
      throw new Error("Enter an amount greater than zero.");
    }

    if (body.fromParticipantId === body.toParticipantId) {
      throw new Error("Choose two different people for a transfer.");
    }

    const bill = await prisma.splitBill.findFirst({
      where: {
        id: billId,
        userId: user.id,
      },
      include: getBillInclude,
    });

    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const workspaceId = bill.transaction?.workspaceId ?? (await prisma.workspace.findFirst({
      where: { userId: user.id },
      orderBy: [{ type: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    }))?.id;
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 409 });
    }

    const fromParticipant = bill.participants.find((participant) => participant.id === body.fromParticipantId);
    const toParticipant = bill.participants.find((participant) => participant.id === body.toParticipantId);

    if (!fromParticipant || !toParticipant) {
      throw new Error("Both people must still be part of this bill.");
    }

    await createSplitBillTransferSettlement({
      billId,
      fromParticipantId: fromParticipant.id,
      fromParticipantName: fromParticipant.name,
      toParticipantId: toParticipant.id,
      toParticipantName: toParticipant.name,
      amount: amount.toFixed(2),
      note: body.note ?? null,
    });

    const rawPayload = appendSplitBillActivity(
      bill.rawPayload as Record<string, unknown> | null,
      "settled",
      `${fromParticipant.name} paid ${toParticipant.name} ${amount.toFixed(2)}`
    );
    const updatedBill = await prisma.splitBill.update({
      where: { id: bill.id },
      data: { rawPayload: rawPayload as Prisma.InputJsonValue },
      include: getBillInclude,
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        actorUserId: user.id,
        action: "split_bill_transfer_settled",
        entity: "SplitBill",
        entityId: bill.id,
        metadata: {
          fromParticipantId: fromParticipant.id,
          toParticipantId: toParticipant.id,
          amount: amount.toFixed(2),
          note: body.note ?? null,
        },
      },
    });

    await recordAdviserActionCompletion({
      workspaceId,
      actorUserId: user.id,
      group: "cashflow",
      itemId: `${bill.id}:${fromParticipant.id}:${toParticipant.id}`,
      label: `Settled split bill transfer for ${bill.title}`,
      sourceAction: "split_bill_transfer_settled",
      href: `/split-bill/${bill.id}`,
      pathname: `/split-bill/${bill.id}`,
    });

    const transferSettlements = await loadSplitBillTransferSettlementsForBill(bill.id);

    return NextResponse.json({
      bill: serializeSplitBillRecord({
        ...updatedBill,
        transferSettlements,
      } as Parameters<typeof serializeSplitBillRecord>[0]),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to record transfer settlement",
      },
      { status: 400 }
    );
  }
}

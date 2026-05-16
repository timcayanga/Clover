import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { parseAmountValue, serializeSplitBillRecord, splitBillGroupMemberOrderBy, splitBillItemOrderBy } from "@/lib/split-bill";
import { createSplitBillTransferSettlement, loadSplitBillTransferSettlementsForBill } from "@/lib/split-bill-transfer-settlements";

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

    const transferSettlements = await loadSplitBillTransferSettlementsForBill(bill.id);

    return NextResponse.json({
      bill: serializeSplitBillRecord({
        ...bill,
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

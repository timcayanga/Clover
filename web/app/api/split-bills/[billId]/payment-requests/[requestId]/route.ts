import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { appendSplitBillActivity, serializeSplitBillRecord, splitBillGroupMemberOrderBy, splitBillItemOrderBy } from "@/lib/split-bill";
import { createSplitBillTransferSettlement, loadSplitBillTransferSettlementsForBill } from "@/lib/split-bill-transfer-settlements";
import { Prisma } from "@prisma/client";

const statusSchema = z.object({ status: z.enum(["requested", "paid", "declined"]) });

const billInclude = {
  transaction: { select: { id: true, merchantRaw: true, merchantClean: true, date: true, amount: true, currency: true, account: { select: { name: true } } } },
  group: { include: { members: { orderBy: splitBillGroupMemberOrderBy } } },
  participants: true,
  items: { include: { participants: true }, orderBy: splitBillItemOrderBy },
  payments: true,
};

export async function PATCH(request: Request, { params }: { params: Promise<{ billId: string; requestId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { billId, requestId } = await params;
    const body = statusSchema.parse(await request.json());
    const existing = await prisma.splitBillPaymentRequest.findFirst({
      where: { id: requestId, billId, bill: { userId: user.id } },
      include: { bill: { include: billInclude } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }
    if (body.status === "paid" && existing.status !== "paid" && existing.payeeParticipantId && existing.recipientParticipantId) {
      const currentSettlements = await loadSplitBillTransferSettlementsForBill(billId);
      const currentBill = serializeSplitBillRecord({ ...existing.bill, transferSettlements: currentSettlements } as Parameters<typeof serializeSplitBillRecord>[0]);
      const openTransfer = currentBill.settlement.transfers.find(
        (transfer) => transfer.fromParticipantId === existing.recipientParticipantId && transfer.toParticipantId === existing.payeeParticipantId
      );
      if (!openTransfer) {
        throw new Error("This transfer is already settled.");
      }
      if (Number(existing.amount) > openTransfer.amount + 0.005) {
        throw new Error("This request is larger than the remaining transfer.");
      }
      await createSplitBillTransferSettlement({
        billId,
        fromParticipantId: existing.recipientParticipantId,
        fromParticipantName: existing.recipientName,
        toParticipantId: existing.payeeParticipantId,
        toParticipantName: existing.payeeName,
        amount: existing.amount.toString(),
        note: `Payment request confirmed${existing.note ? ` · ${existing.note}` : ""}`,
      });
      const activity = appendSplitBillActivity(existing.bill.rawPayload as Record<string, unknown> | null, "settled", `${existing.recipientName} paid ${existing.payeeName} ${existing.amount.toString()}`);
      await prisma.splitBill.update({ where: { id: billId }, data: { rawPayload: activity as Prisma.InputJsonValue } });
    }

    const updated = await prisma.splitBillPaymentRequest.update({
      where: { id: existing.id },
      data: { status: body.status, paidAt: body.status === "paid" ? new Date() : null },
      include: { paymentProfile: true },
    });
    const transferSettlements = await loadSplitBillTransferSettlementsForBill(billId);
    const refreshedBill = await prisma.splitBill.findUniqueOrThrow({ where: { id: billId }, include: billInclude });
    return NextResponse.json({
      request: updated,
      bill: serializeSplitBillRecord({ ...refreshedBill, transferSettlements } as Parameters<typeof serializeSplitBillRecord>[0]),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update payment request" }, { status: 400 });
  }
}

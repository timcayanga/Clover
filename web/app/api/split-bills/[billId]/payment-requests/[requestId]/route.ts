import { paymentRequestAmounts } from "../../../../../../../shared/payment-request-amount";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import {
  appendSplitBillActivity,
  serializeSplitBillRecord,
  splitBillGroupMemberOrderBy,
  splitBillItemOrderBy,
} from "@/lib/split-bill";
import { Prisma } from "@prisma/client";

const statusSchema = z.object({
  status: z.enum(["requested", "paid", "declined"]),
});

const billInclude = {
  transaction: {
    select: {
      id: true,
      merchantRaw: true,
      category: { select: { name: true } },
      merchantClean: true,
      date: true,
      amount: true,
      currency: true,
      account: { select: { name: true } },
    },
  },
  group: { include: { members: { orderBy: splitBillGroupMemberOrderBy } } },
  participants: true,
  items: { include: { participants: true }, orderBy: splitBillItemOrderBy },
  payments: true,
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ billId: string; requestId: string }> },
) {
  try {
    const user = await getSplitBillCurrentUser();
    const { billId, requestId } = await params;
    const body = statusSchema.parse(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      // Serialize request confirmation for a bill. A retry cannot record it twice.
      await tx.$queryRaw`SELECT id FROM "SplitBill" WHERE id = ${billId} AND "userId" = ${user.id} FOR UPDATE`;
      const existing = await tx.splitBillPaymentRequest.findFirst({
        where: { id: requestId, billId, bill: { userId: user.id } },
        include: { bill: { include: billInclude } },
      });
      if (!existing) throw new Error("Payment request not found.");
      if (existing.status === "declined" && body.status === "requested")
        throw new Error("Create a new request for a declined payment.");
      if (existing.status === "paid" && body.status !== "paid")
        throw new Error("A recorded payment cannot be reopened here.");
      if (body.status === "paid" && existing.status !== "paid") {
        if (existing.status === "declined")
          throw new Error("This request was declined. Create a new request.");
        const amounts = paymentRequestAmounts(existing, existing.bill.currency);
        const settlements = await tx.splitBillTransferSettlement.findMany({
          where: { billId },
          orderBy: { createdAt: "asc" },
        });
        const bill = serializeSplitBillRecord({
          ...existing.bill,
          transferSettlements: settlements,
        } as Parameters<typeof serializeSplitBillRecord>[0]);
        if (bill.resolved) throw new Error("This bill is resolved.");
        const open = bill.settlement.transfers.find(
          (t) =>
            t.fromParticipantId === existing.recipientParticipantId &&
            t.toParticipantId === existing.payeeParticipantId,
        );
        if (!open || amounts.billAmount > open.amount + 0.005)
          throw new Error(
            "This request is larger than the remaining transfer, or it is already settled.",
          );
        await tx.splitBillTransferSettlement.create({
          data: {
            billId,
            fromParticipantId: existing.recipientParticipantId,
            fromParticipantName: existing.recipientName,
            toParticipantId: existing.payeeParticipantId,
            toParticipantName: existing.payeeName,
            amount: amounts.billAmount.toFixed(2),
            note: `Payment request confirmed (${amounts.currency} ${amounts.amount.toFixed(2)})${existing.note ? ` · ${existing.note}` : ""}`,
          },
        });
        const activity = appendSplitBillActivity(
          existing.bill.rawPayload as Record<string, unknown> | null,
          "settled",
          `${existing.recipientName} paid ${existing.payeeName} ${amounts.billCurrency} ${amounts.billAmount.toFixed(2)}`,
        );
        await tx.splitBill.update({
          where: { id: billId },
          data: { rawPayload: activity as Prisma.InputJsonValue },
        });
      }
      const updated =
        existing.status === body.status
          ? existing
          : await tx.splitBillPaymentRequest.update({
              where: { id: existing.id },
              data: {
                status: body.status,
                paidAt: body.status === "paid" ? new Date() : null,
              },
              include: { paymentProfile: true },
            });
      const [refreshedBill, settlements] = await Promise.all([
        tx.splitBill.findUniqueOrThrow({
          where: { id: billId },
          include: billInclude,
        }),
        tx.splitBillTransferSettlement.findMany({
          where: { billId },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      return {
        request: updated,
        bill: serializeSplitBillRecord({
          ...refreshedBill,
          transferSettlements: settlements,
        } as Parameters<typeof serializeSplitBillRecord>[0]),
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update payment request",
      },
      { status: 400 },
    );
  }
}

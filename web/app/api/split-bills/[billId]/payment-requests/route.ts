import { getCurrencyCatalogCodes } from "@/lib/currencies";
import { paymentRequestAmounts } from "../../../../../../shared/payment-request-amount";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { paymentRequestSchema } from "@/lib/split-bill-payment-request-schema";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import {
  loadSplitBillBill,
  splitBillRecordInclude,
} from "@/lib/split-bill-loaders";
import { serializeSplitBillRecord } from "@/lib/split-bill";
import { loadSplitBillTransferSettlementsForBill } from "@/lib/split-bill-transfer-settlements";

export const dynamic = "force-dynamic";

const serializeRequest = (entry: {
  id: string;
  billId: string;
  paymentProfileId: string | null;
  recipientParticipantId: string;
  payeeParticipantId: string;
  recipientName: string;
  payeeName: string;
  recipientEmail: string | null;
  amount: unknown;
  currency: string;
  dueDate: Date | null;
  status: string;
  shareToken: string;
  note: string | null;
  createdAt: Date;
  paymentReportedAt: Date | null;
  paidAt: Date | null;
}) => ({
  ...entry,
  amount: entry.amount?.toString() ?? "0",
  shareUrl: `/split-bill/request/${entry.shareToken}`,
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ billId: string }> },
) {
  try {
    const user = await getSplitBillCurrentUser();
    const { billId } = await params;
    const bill = await loadSplitBillBill(user.id, billId);
    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }
    const requests = await prisma.splitBillPaymentRequest.findMany({
      where: { billId },
      include: { paymentProfile: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ requests: requests.map(serializeRequest) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load payment requests",
      },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ billId: string }> },
) {
  try {
    const user = await getSplitBillCurrentUser();
    const { billId } = await params;
    const body = paymentRequestSchema.parse(await request.json());
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter an amount greater than zero.");
    }

    const parsedDueDate = body.dueDate
      ? new Date(`${body.dueDate}T12:00:00`)
      : null;
    if (
      body.dueDate &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ||
        !parsedDueDate ||
        Number.isNaN(parsedDueDate.getTime()))
    ) {
      throw new Error("Choose a valid due date.");
    }

    const bill = await loadSplitBillBill(user.id, billId);
    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }
    const amounts = paymentRequestAmounts(body, bill.currency);
    if (!getCurrencyCatalogCodes().some((c) => c === amounts.currency))
      throw new Error("Choose a supported currency.");
    const transferSettlements =
      await loadSplitBillTransferSettlementsForBill(billId);
    const serializedBill = serializeSplitBillRecord({
      ...bill,
      transferSettlements,
    } as Parameters<typeof serializeSplitBillRecord>[0]);
    if (serializedBill.resolved)
      throw new Error("This bill is resolved. No payment is requested.");
    const recipient = bill.participants.find(
      (participant) => participant.id === body.recipientParticipantId,
    );
    const payee = bill.participants.find(
      (participant) => participant.id === body.payeeParticipantId,
    );
    if (!recipient || !payee) {
      throw new Error("Recipient must be part of this bill.");
    }
    if (recipient.id === payee.id) {
      throw new Error("Choose two different people for a payment request.");
    }
    const transfer = serializedBill.settlement.transfers.find(
      (entry) =>
        entry.fromParticipantId === recipient.id &&
        entry.toParticipantId === payee.id,
    );
    if (!transfer) {
      throw new Error("There is no open balance for this payment request.");
    }
    return await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SplitBill" WHERE id = ${billId} AND "userId" = ${user.id} FOR UPDATE`;
        const lockedBill = await tx.splitBill.findFirst({
          where: { id: billId, userId: user.id },
          include: splitBillRecordInclude,
        });
        if (!lockedBill || lockedBill.currency !== amounts.billCurrency)
          throw new Error(
            "The bill has changed. Reload it before creating a request.",
          );
        const currentBill = serializeSplitBillRecord({
          ...lockedBill,
          transferSettlements: await tx.splitBillTransferSettlement.findMany({
            where: { billId },
            orderBy: { createdAt: "asc" },
          }),
        } as Parameters<typeof serializeSplitBillRecord>[0]);
        if (currentBill.resolved) throw new Error("This bill is resolved.");
        const lockedTransfer = currentBill.settlement.transfers.find(
          (t) =>
            t.fromParticipantId === recipient.id &&
            t.toParticipantId === payee.id,
        );
        if (!lockedTransfer)
          throw new Error("There is no open balance for this payment request.");
        const existing = await tx.splitBillPaymentRequest.findFirst({
          where: {
            billId,
            recipientParticipantId: recipient.id,
            payeeParticipantId: payee.id,
            status: { in: ["requested", "payment_reported"] },
            amount: amounts.amount.toFixed(2),
            currency: amounts.currency,
            OR: [
              {
                billAmount: amounts.billAmount.toFixed(2),
                billCurrency: amounts.billCurrency,
              },
              ...(amounts.currency === amounts.billCurrency
                ? [{ billAmount: null, billCurrency: null }]
                : []),
            ],
            paymentProfileId: body.paymentProfileId || null,
            note: body.note || null,
            dueDate: parsedDueDate,
          },
          include: { paymentProfile: true },
        });
        if (existing)
          return NextResponse.json({ request: serializeRequest(existing) });
        const activeRequests = await tx.splitBillPaymentRequest.findMany({
          where: {
            billId,
            recipientParticipantId: recipient.id,
            payeeParticipantId: payee.id,
            status: { in: ["requested", "payment_reported"] },
          },
          select: {
            amount: true,
            currency: true,
            billAmount: true,
            billCurrency: true,
          },
        });
        const alreadyRequested = activeRequests.reduce(
          (sum, entry) =>
            sum + paymentRequestAmounts(entry, bill.currency).billAmount,
          0,
        );
        const remainingAfterRequests = lockedTransfer.amount - alreadyRequested;
        if (amounts.billAmount > remainingAfterRequests + 0.005) {
          throw new Error(
            `This request can be up to ${bill.currency.toUpperCase()} ${Math.max(0, remainingAfterRequests).toFixed(2)}.`,
          );
        }
        if (body.paymentProfileId) {
          const profile = await tx.splitBillPaymentProfile.findFirst({
            where: { id: body.paymentProfileId, userId: user.id },
            select: { id: true, currency: true },
          });
          if (profile && profile.currency.toUpperCase() !== amounts.currency)
            throw new Error("Choose a payment option in the request currency.");
          if (!profile) {
            throw new Error("Payment option not found.");
          }
        }

        const entry = await tx.splitBillPaymentRequest.create({
          data: {
            billId,
            paymentProfileId: body.paymentProfileId || null,
            recipientParticipantId: recipient.id,
            payeeParticipantId: payee.id,
            recipientName: recipient.name,
            payeeName: payee.name,
            recipientEmail: body.recipientEmail || null,
            amount: amounts.amount.toFixed(2),
            currency: amounts.currency,
            billAmount: amounts.billAmount.toFixed(2),
            billCurrency: amounts.billCurrency,
            dueDate: parsedDueDate,
            note: body.note || null,
            shareToken: randomUUID().replaceAll("-", ""),
          },
          include: { paymentProfile: true },
        });

        return NextResponse.json(
          { request: serializeRequest(entry) },
          { status: 201 },
        );
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create payment request",
      },
      { status: 400 },
    );
  }
}

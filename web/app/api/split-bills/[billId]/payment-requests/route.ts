import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { loadSplitBillBill } from "@/lib/split-bill-loaders";
import { serializeSplitBillRecord } from "@/lib/split-bill";
import { loadSplitBillTransferSettlementsForBill } from "@/lib/split-bill-transfer-settlements";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  recipientParticipantId: z.string().min(1),
  payeeParticipantId: z.string().min(1),
  paymentProfileId: z.string().nullable().optional(),
  recipientEmail: z.string().email().nullable().optional(),
  amount: z.union([z.string(), z.number()]),
  dueDate: z.string().nullable().optional(),
  note: z.string().trim().max(240).nullable().optional(),
});

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

export async function GET(_request: Request, { params }: { params: Promise<{ billId: string }> }) {
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load payment requests" }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { billId } = await params;
    const body = requestSchema.parse(await request.json());
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter an amount greater than zero.");
    }

    const parsedDueDate = body.dueDate ? new Date(`${body.dueDate}T12:00:00`) : null;
    if (body.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) || !parsedDueDate || Number.isNaN(parsedDueDate.getTime()))) {
      throw new Error("Choose a valid due date.");
    }

    const bill = await loadSplitBillBill(user.id, billId);
    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }
    const transferSettlements = await loadSplitBillTransferSettlementsForBill(billId);
    const serializedBill = serializeSplitBillRecord({
      ...bill,
      transferSettlements,
    } as Parameters<typeof serializeSplitBillRecord>[0]);
    const recipient = bill.participants.find((participant) => participant.id === body.recipientParticipantId);
    const payee = bill.participants.find((participant) => participant.id === body.payeeParticipantId);
    if (!recipient || !payee) {
      throw new Error("Recipient must be part of this bill.");
    }
    if (recipient.id === payee.id) {
      throw new Error("Choose two different people for a payment request.");
    }
    const transfer = serializedBill.settlement.transfers.find(
      (entry) => entry.fromParticipantId === recipient.id && entry.toParticipantId === payee.id
    );
    if (!transfer) {
      throw new Error("There is no open balance for this payment request.");
    }
    const activeRequests = await prisma.splitBillPaymentRequest.findMany({
      where: {
        billId,
        recipientParticipantId: recipient.id,
        payeeParticipantId: payee.id,
        status: { in: ["requested", "payment_reported"] },
      },
      select: { amount: true },
    });
    const alreadyRequested = activeRequests.reduce((sum, entry) => sum + Number(entry.amount), 0);
    const remainingAfterRequests = transfer.amount - alreadyRequested;
    if (amount > remainingAfterRequests + 0.005) {
      throw new Error(`This request can be up to ${bill.currency.toUpperCase()} ${Math.max(0, remainingAfterRequests).toFixed(2)}.`);
    }
    if (body.paymentProfileId) {
      const profile = await prisma.splitBillPaymentProfile.findFirst({
        where: { id: body.paymentProfileId, userId: user.id },
        select: { id: true, personName: true, currency: true },
      });
      if (!profile) {
        throw new Error("Payment method not found.");
      }
      if (profile.personName && profile.personName !== payee.name) {
        throw new Error("Choose a payment method saved for this person.");
      }
      if (profile.currency.toUpperCase() !== bill.currency.toUpperCase()) {
        throw new Error(`Choose a ${bill.currency.toUpperCase()} payment method for this request.`);
      }
    }

    const entry = await prisma.splitBillPaymentRequest.create({
      data: {
        billId,
        paymentProfileId: body.paymentProfileId || null,
        recipientParticipantId: recipient.id,
        payeeParticipantId: payee.id,
        recipientName: recipient.name,
        payeeName: payee.name,
        recipientEmail: body.recipientEmail || null,
        amount: amount.toFixed(2),
        currency: bill.currency,
        dueDate: parsedDueDate,
        note: body.note || null,
        shareToken: randomUUID().replaceAll("-", ""),
      },
      include: { paymentProfile: true },
    });

    return NextResponse.json({ request: serializeRequest(entry) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create payment request" }, { status: 400 });
  }
}

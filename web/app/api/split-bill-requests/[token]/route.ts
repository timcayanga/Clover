import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const publicRequestInclude = {
  bill: { select: { title: true, billDate: true, currency: true } },
  paymentProfile: {
    select: { label: true, provider: true, currency: true, accountName: true, accountNumber: true, qrPayload: true, qrImageData: true },
  },
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const entry = await prisma.splitBillPaymentRequest.findUnique({ where: { shareToken: token }, include: publicRequestInclude });
  if (!entry) {
    return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
  }
  return NextResponse.json({
    request: {
      id: entry.id,
      recipientName: entry.recipientName,
      amount: entry.amount.toString(),
      currency: entry.currency,
      dueDate: entry.dueDate,
      status: entry.status,
      note: entry.note,
      bill: entry.bill,
      paymentProfile: entry.paymentProfile,
    },
  });
}

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const entry = await prisma.splitBillPaymentRequest.findUnique({ where: { shareToken: token }, select: { id: true, status: true } });
  if (!entry) {
    return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
  }
  if (entry.status === "paid" || entry.status === "payment_reported") {
    return NextResponse.json({ ok: true, status: entry.status });
  }
  if (entry.status !== "requested") {
    return NextResponse.json({ error: "This payment request is no longer active." }, { status: 409 });
  }
  const updated = await prisma.splitBillPaymentRequest.update({
    where: { id: entry.id },
    data: { status: "payment_reported", paymentReportedAt: new Date() },
    select: { status: true },
  });
  return NextResponse.json({ ok: true, status: updated.status });
}

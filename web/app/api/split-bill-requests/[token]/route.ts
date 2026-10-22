import { paymentOptionBrand } from "@/lib/payment-option-brand";
import { isSplitBillResolved } from "@/lib/split-bill-resolution";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const publicRequestInclude = {
  bill: {
    select: {
      title: true,
      billDate: true,
      currency: true,
      rawPayload: true,
      items: {
        select: {
          description: true,
          amount: true,
          participants: { select: { participantId: true } },
        },
        orderBy: { sortOrder: "asc" as const },
      },
    },
  },
  paymentProfile: {
    select: {
      label: true,
      provider: true,
      currency: true,
      accountName: true,
      accountNumber: true,
      qrPayload: true,
      qrImageData: true,
    },
  },
} as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const entry = await prisma.splitBillPaymentRequest.findUnique({
    where: { shareToken: token },
    include: publicRequestInclude,
  });
  if (!entry) {
    return NextResponse.json(
      { error: "Payment request not found" },
      { status: 404 },
    );
  }
  return NextResponse.json({
    request: {
      id: entry.id,
      recipientName: entry.recipientName,
      amount: entry.amount.toString(),
      currency: entry.currency,
      dueDate: entry.dueDate,
      status: isSplitBillResolved(entry.bill.rawPayload)
        ? "resolved"
        : entry.status,
      note: entry.note,
      items: entry.bill.items
        .filter(
          (item) =>
            !item.participants.length ||
            item.participants.some(
              (p) => p.participantId === entry.recipientParticipantId,
            ),
        )
        .map((item) => ({
          description: item.description,
          amount: item.amount.toString(),
        })),
      bill: {
        title: entry.bill.title,
        billDate: entry.bill.billDate,
        currency: entry.bill.currency,
      },
      paymentProfile: entry.paymentProfile
        ? {
            ...entry.paymentProfile,
            ...paymentOptionBrand(
              entry.paymentProfile.provider,
              entry.paymentProfile.label,
            ),
          }
        : null,
    },
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const entry = await prisma.splitBillPaymentRequest.findUnique({
    where: { shareToken: token },
    select: { id: true, status: true, bill: { select: { rawPayload: true } } },
  });
  if (!entry) {
    return NextResponse.json(
      { error: "Payment request not found" },
      { status: 404 },
    );
  }
  if (isSplitBillResolved(entry.bill.rawPayload))
    return NextResponse.json(
      { error: "This bill is resolved. No payment is requested." },
      { status: 409 },
    );
  if (entry.status === "paid" || entry.status === "payment_reported") {
    return NextResponse.json({ ok: true, status: entry.status });
  }
  if (entry.status !== "requested") {
    return NextResponse.json(
      { error: "This payment request is no longer active." },
      { status: 409 },
    );
  }
  await prisma.splitBillPaymentRequest.updateMany({
    where: { id: entry.id, status: "requested" },
    data: { status: "payment_reported", paymentReportedAt: new Date() },
  });
  const updated = await prisma.splitBillPaymentRequest.findUnique({
    where: { id: entry.id },
    select: { status: true },
  });
  return NextResponse.json({
    ok: true,
    status: updated?.status ?? entry.status,
  });
}

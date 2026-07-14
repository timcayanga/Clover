import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

const statusSchema = z.object({ status: z.enum(["requested", "paid", "declined"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ billId: string; requestId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { billId, requestId } = await params;
    const body = statusSchema.parse(await request.json());
    const existing = await prisma.splitBillPaymentRequest.findFirst({
      where: { id: requestId, billId, bill: { userId: user.id } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Payment request not found" }, { status: 404 });
    }
    const updated = await prisma.splitBillPaymentRequest.update({
      where: { id: existing.id },
      data: { status: body.status, paidAt: body.status === "paid" ? new Date() : null },
      include: { paymentProfile: true },
    });
    return NextResponse.json({ request: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update payment request" }, { status: 400 });
  }
}

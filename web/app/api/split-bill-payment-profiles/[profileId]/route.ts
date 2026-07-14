import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

export async function DELETE(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { profileId } = await params;
    const profile = await prisma.splitBillPaymentProfile.findFirst({ where: { id: profileId, userId: user.id }, select: { id: true } });
    if (!profile) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }
    await prisma.splitBillPaymentProfile.delete({ where: { id: profile.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to remove payment method" }, { status: 400 });
  }
}

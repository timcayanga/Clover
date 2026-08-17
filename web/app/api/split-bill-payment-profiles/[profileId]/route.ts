import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { splitBillPaymentProfileSchema } from "@/lib/split-bill-payment-profile-schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { profileId } = await params;
    const body = splitBillPaymentProfileSchema.parse(await request.json());
    const existing = await prisma.splitBillPaymentProfile.findFirst({ where: { id: profileId, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    const profile = await prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.splitBillPaymentProfile.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return tx.splitBillPaymentProfile.update({ where: { id: existing.id }, data: {
        label: body.label, provider: body.provider, currency: body.currency.toUpperCase(),
        personName: body.personName?.trim() || null, accountName: body.accountName?.trim() || null,
        accountNumber: body.accountNumber?.trim() || null, qrPayload: body.qrPayload?.trim() || null,
        routingCode: body.routingCode?.trim() || null,
        qrImageData: body.qrImageData?.trim() || null, isDefault: body.isDefault ?? existing.isDefault,
      } });
    });
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update payment method" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { profileId } = await params;
    const profile = await prisma.splitBillPaymentProfile.findFirst({ where: { id: profileId, userId: user.id }, select: { id: true } });
    if (!profile) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }
    await prisma.$transaction(async (tx) => {
      const deleted = await tx.splitBillPaymentProfile.delete({ where: { id: profile.id } });
      if (deleted.isDefault) {
        const replacement = await tx.splitBillPaymentProfile.findFirst({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        });
        if (replacement) {
          await tx.splitBillPaymentProfile.update({ where: { id: replacement.id }, data: { isDefault: true } });
        }
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to remove payment method" }, { status: 400 });
  }
}

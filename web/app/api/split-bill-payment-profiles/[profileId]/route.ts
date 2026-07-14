import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { z } from "zod";

const profileSchema = z.object({
  label: z.string().trim().min(1).max(80),
  provider: z.string().trim().min(1).max(80),
  currency: z.string().trim().min(3).max(8),
  personName: z.string().trim().max(120).nullable().optional(),
  accountName: z.string().trim().max(120).nullable().optional(),
  accountNumber: z.string().trim().max(120).nullable().optional(),
  qrPayload: z.string().trim().max(10000).nullable().optional(),
  qrImageData: z.string().trim().max(1500000).nullable().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  try {
    const user = await getSplitBillCurrentUser();
    const { profileId } = await params;
    const body = profileSchema.parse(await request.json());
    const existing = await prisma.splitBillPaymentProfile.findFirst({ where: { id: profileId, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    const profile = await prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.splitBillPaymentProfile.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return tx.splitBillPaymentProfile.update({ where: { id: existing.id }, data: {
        label: body.label, provider: body.provider, currency: body.currency.toUpperCase(),
        personName: body.personName?.trim() || null, accountName: body.accountName?.trim() || null,
        accountNumber: body.accountNumber?.trim() || null, qrPayload: body.qrPayload?.trim() || null,
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
    await prisma.splitBillPaymentProfile.delete({ where: { id: profile.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to remove payment method" }, { status: 400 });
  }
}

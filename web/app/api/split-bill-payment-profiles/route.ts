import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { splitBillPaymentProfileSchema } from "@/lib/split-bill-payment-profile-schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSplitBillCurrentUser();
    const profiles = await prisma.splitBillPaymentProfile.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ profiles });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load payment methods" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSplitBillCurrentUser();
    const body = splitBillPaymentProfileSchema.parse(await request.json());
    const profile = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.splitBillPaymentProfile.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      }

      const hasExisting = await tx.splitBillPaymentProfile.count({ where: { userId: user.id } });
      return tx.splitBillPaymentProfile.create({
        data: {
          userId: user.id,
          label: body.label,
          provider: body.provider,
          currency: body.currency.toUpperCase(),
          personName: body.personName?.trim() || null,
          accountName: body.accountName?.trim() || null,
          accountNumber: body.accountNumber?.trim() || null,
          routingCode: body.routingCode?.trim() || null,
          qrPayload: body.qrPayload?.trim() || null,
          qrImageData: body.qrImageData?.trim() || null,
          isDefault: body.isDefault || hasExisting === 0,
        },
      });
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save payment method" }, { status: 400 });
  }
}

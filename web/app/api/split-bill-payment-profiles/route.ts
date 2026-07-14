import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  label: z.string().trim().min(1).max(80),
  provider: z.string().trim().min(1).max(80),
  currency: z.string().trim().min(3).max(8).default("PHP"),
  personName: z.string().trim().max(120).nullable().optional(),
  accountName: z.string().trim().max(120).nullable().optional(),
  accountNumber: z.string().trim().max(120).nullable().optional(),
  qrPayload: z.string().trim().max(10000).nullable().optional(),
  qrImageData: z.string().trim().max(1500000).nullable().optional(),
  isDefault: z.boolean().optional().default(false),
});

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
    const body = profileSchema.parse(await request.json());
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

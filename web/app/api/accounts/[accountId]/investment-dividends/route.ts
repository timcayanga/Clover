import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { recordAdviserActionCompletion } from "@/lib/adviser-actions";
import { canTrackInvestmentUnits } from "@/lib/investments";

export const dynamic = "force-dynamic";

const resolveUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const dividendSchema = z.object({
  paidAt: z.string().min(1),
  amount: z.union([z.string(), z.number(), z.null()]).optional(),
  currency: z.string().optional(),
  note: z.string().nullable().optional(),
  reinvestedQuantity: z.union([z.string(), z.number(), z.null()]).optional(),
});

const parseNullableDecimal = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toString() : null;
};

const parseDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid paidAt date.");
  }

  return date;
};

const serializeDividend = (dividend: {
  id: string;
  accountId: string;
  paidAt: Date;
  amount: Prisma.Decimal | null;
  currency: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...dividend,
  amount: dividend.amount?.toString() ?? null,
  paidAt: dividend.paidAt.toISOString(),
  createdAt: dividend.createdAt.toISOString(),
  updatedAt: dividend.updatedAt.toISOString(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveUserId();
    const { accountId } = await params;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, workspaceId: true, type: true },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    const dividends = await prisma.investmentDividend.findMany({
      where: { accountId },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ dividends: dividends.map(serializeDividend) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveUserId();
    const { accountId } = await params;
    const payload = dividendSchema.parse(await request.json());

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        workspaceId: true,
        type: true,
        investmentSubtype: true,
        investmentCostBasis: true,
        investmentQuantity: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    if (account.type !== "investment") {
      return NextResponse.json({ error: "Only investment accounts can have dividends." }, { status: 400 });
    }

    const paidAt = parseDate(payload.paidAt);
    const amount = parseNullableDecimal(payload.amount);
    const currency = payload.currency ? payload.currency.trim().toUpperCase() : "PHP";
    const note = payload.note?.trim() || null;
    const reinvestedQuantity = parseNullableDecimal(payload.reinvestedQuantity);

    if (amount === null || Number(amount) <= 0) {
      return NextResponse.json({ error: "amount must be greater than zero" }, { status: 400 });
    }
    if (reinvestedQuantity !== null && Number(reinvestedQuantity) <= 0) {
      return NextResponse.json({ error: "reinvestedQuantity must be greater than zero" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const dividend = await tx.investmentDividend.create({
        data: {
          accountId,
          paidAt,
          amount,
          currency,
          note,
        },
      });

      if (reinvestedQuantity === null) {
        return { dividend, purchase: null };
      }

      if (!canTrackInvestmentUnits(account.investmentSubtype)) {
        throw new Error("This investment type does not support unit-based reinvestment.");
      }

      const purchase = await tx.investmentPurchase.create({
        data: {
          accountId,
          purchasedAt: paidAt,
          quantity: reinvestedQuantity,
          totalCost: amount,
          currency,
          note: note ? `Reinvested dividend · ${note}` : "Reinvested dividend",
        },
      });
      const nextCostBasis = new Prisma.Decimal(account.investmentCostBasis?.toString() ?? 0).plus(new Prisma.Decimal(amount));
      const nextQuantity = new Prisma.Decimal(account.investmentQuantity?.toString() ?? 0).plus(new Prisma.Decimal(reinvestedQuantity));
      await tx.account.update({
        where: { id: accountId },
        data: {
          investmentCostBasis: nextCostBasis.toString(),
          investmentQuantity: nextQuantity.toString(),
        },
      });
      return { dividend, purchase };
    });
    const { dividend, purchase } = result;

    await recordAdviserActionCompletion({
      workspaceId: account.workspaceId,
      actorUserId: userId,
      group: "investments",
      itemId: `${accountId}:${dividend.id}`,
      label: "Added investment dividend",
      sourceAction: "investment_dividend_created",
      href: `/accounts/${accountId}`,
      pathname: `/accounts/${accountId}`,
    });

    return NextResponse.json({
      dividend: serializeDividend(dividend),
      purchase: purchase
        ? {
            ...purchase,
            quantity: purchase.quantity?.toString() ?? null,
            totalCost: purchase.totalCost?.toString() ?? null,
            purchasedAt: purchase.purchasedAt.toISOString(),
            createdAt: purchase.createdAt.toISOString(),
            updatedAt: purchase.updatedAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add dividend." }, { status: 400 });
  }
}

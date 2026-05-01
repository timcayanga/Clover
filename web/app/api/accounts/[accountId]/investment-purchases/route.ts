import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { isFixedIncomeInvestmentSubtype } from "@/lib/investments";

export const dynamic = "force-dynamic";

const resolveUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const purchaseSchema = z.object({
  purchasedAt: z.string().min(1),
  quantity: z.union([z.string(), z.number(), z.null()]).optional(),
  totalCost: z.union([z.string(), z.number(), z.null()]).optional(),
  currency: z.string().optional(),
  note: z.string().nullable().optional(),
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
    throw new Error("Invalid purchasedAt date.");
  }

  return date;
};

const serializePurchase = (purchase: {
  id: string;
  accountId: string;
  purchasedAt: Date;
  quantity: Prisma.Decimal | null;
  totalCost: Prisma.Decimal | null;
  currency: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  ...purchase,
  quantity: purchase.quantity?.toString() ?? null,
  totalCost: purchase.totalCost?.toString() ?? null,
  purchasedAt: purchase.purchasedAt.toISOString(),
  createdAt: purchase.createdAt.toISOString(),
  updatedAt: purchase.updatedAt.toISOString(),
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

    const purchases = await prisma.investmentPurchase.findMany({
      where: { accountId },
      orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ purchases: purchases.map(serializePurchase) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveUserId();
    const { accountId } = await params;
    const payload = purchaseSchema.parse(await request.json());

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        workspaceId: true,
        type: true,
        investmentSubtype: true,
        investmentCostBasis: true,
        investmentPrincipal: true,
      },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    if (account.type !== "investment") {
      return NextResponse.json({ error: "Only investment accounts can have purchases." }, { status: 400 });
    }

    const purchasedAt = parseDate(payload.purchasedAt);
    const totalCost = parseNullableDecimal(payload.totalCost);
    const quantity = parseNullableDecimal(payload.quantity);
    const currency = payload.currency ? payload.currency.trim().toUpperCase() : "PHP";
    const note = payload.note?.trim() || null;

    if (totalCost === null) {
      return NextResponse.json({ error: "totalCost is required" }, { status: 400 });
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.investmentPurchase.create({
        data: {
          accountId,
          purchasedAt,
          quantity,
          totalCost,
          currency,
          note,
        },
      });

      const summaryField = isFixedIncomeInvestmentSubtype(account.investmentSubtype) ? "investmentPrincipal" : "investmentCostBasis";
      const currentSummary = Number(
        summaryField === "investmentPrincipal" ? account.investmentPrincipal?.toString() ?? 0 : account.investmentCostBasis?.toString() ?? 0
      );
      const nextSummary = new Prisma.Decimal(currentSummary).plus(new Prisma.Decimal(totalCost));

      await tx.account.update({
        where: { id: accountId },
        data:
          summaryField === "investmentPrincipal"
            ? { investmentPrincipal: nextSummary.toString() }
            : { investmentCostBasis: nextSummary.toString() },
      });

      return created;
    });

    return NextResponse.json({ purchase: serializePurchase(purchase) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add purchase." }, { status: 400 });
  }
}

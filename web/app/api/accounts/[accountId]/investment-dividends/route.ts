import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";

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
      select: { id: true, workspaceId: true, type: true },
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

    if (amount === null) {
      return NextResponse.json({ error: "amount is required" }, { status: 400 });
    }

    const dividend = await prisma.investmentDividend.create({
      data: {
        accountId,
        paidAt,
        amount,
        currency,
        note,
      },
    });

    return NextResponse.json({ dividend: serializeDividend(dividend) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add dividend." }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { buildTransactionQueryWhere } from "@/lib/transaction-query";

export const dynamic = "force-dynamic";

type TransactionApiRow = {
  id: string;
  accountId: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  date: string;
  merchantRaw: string;
  merchantClean: string | null;
  categoryName: string | null;
  description: string | null;
  isExcluded: boolean;
  importFileId: string | null;
  source: string;
};

const mapTransactionRow = (transaction: {
  id: string;
  accountId: string;
  date: Date;
  amount: Prisma.Decimal | bigint | number | string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  category: { name: string } | null;
  description: string | null;
  isExcluded: boolean;
  importFileId: string | null;
}): TransactionApiRow => ({
  id: transaction.id,
  accountId: transaction.accountId,
  amount: transaction.amount.toString(),
  type: transaction.type,
  date: transaction.date.toISOString(),
  merchantRaw: transaction.merchantRaw,
  merchantClean: transaction.merchantClean,
  categoryName: transaction.category?.name ?? null,
  description: transaction.description,
  isExcluded: transaction.isExcluded,
  importFileId: transaction.importFileId,
  source: transaction.importFileId ? "upload" : "manual",
});

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { userId } = await requireAuth();
    const { accountId } = await params;
    const { searchParams } = new URL(request.url);

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, workspaceId: true },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.max(1, Number(searchParams.get("pageSize") ?? "25") || 25);
    const where = buildTransactionQueryWhere(account.workspaceId, { accountIds: [accountId] });
    const skip = (page - 1) * pageSize;

    const [totalCount, rows] = await Promise.all([
      prisma.transaction.count({ where }),
      prisma.transaction.findMany({
        where,
        select: {
          id: true,
          accountId: true,
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          description: true,
          isExcluded: true,
          category: {
            select: {
              name: true,
            },
          },
          importFileId: true,
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      transactions: rows.map(mapTransactionRow),
      page,
      pageSize,
      totalCount,
      hasMore: skip + rows.length < totalCount,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

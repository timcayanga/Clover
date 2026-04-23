import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const transactions = await prisma.transaction.findMany({
      where: {
        workspaceId,
        OR: [
          { reviewStatus: { not: "confirmed" } },
          { categoryId: null },
          { categoryConfidence: { lt: 70 } },
        ],
      },
      include: {
        account: true,
        category: true,
      },
      orderBy: [{ categoryConfidence: "asc" }, { date: "desc" }],
      take: 100,
    });

    return NextResponse.json({
      transactions: transactions.map((transaction: any) => ({
        id: transaction.id,
        workspaceId: transaction.workspaceId,
        accountId: transaction.accountId,
        accountName: transaction.account.name,
        categoryId: transaction.categoryId,
        categoryName: transaction.category?.name ?? null,
        reviewStatus: transaction.reviewStatus,
        parserConfidence: transaction.parserConfidence,
        categoryConfidence: transaction.categoryConfidence,
        accountMatchConfidence: transaction.accountMatchConfidence,
        duplicateConfidence: transaction.duplicateConfidence,
        transferConfidence: transaction.transferConfidence,
        date: transaction.date.toISOString(),
        amount: transaction.amount.toString(),
        currency: transaction.currency,
        type: transaction.type,
        merchantRaw: transaction.merchantRaw,
        merchantClean: transaction.merchantClean,
        description: transaction.description,
        isTransfer: transaction.isTransfer,
        isExcluded: transaction.isExcluded,
        createdAt: transaction.createdAt.toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordTrainingSignal } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

const transactionSchema = z.object({
  workspaceId: z.string().min(1),
  accountId: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  date: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().default("PHP"),
  type: z.enum(["income", "expense", "transfer"]),
  merchantRaw: z.string().min(1),
  merchantClean: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  isTransfer: z.boolean().optional(),
  isExcluded: z.boolean().optional(),
});

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
      where: { workspaceId },
      include: {
        category: true,
        account: true,
      },
      orderBy: { date: "desc" },
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

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const payload = transactionSchema.parse(await request.json());

    await assertWorkspaceAccess(userId, payload.workspaceId);

    const resolvedCategoryId =
      payload.categoryId ??
      (
        await prisma.category.findFirst({
          where: {
            workspaceId: payload.workspaceId,
            name: "Other",
          },
        })
      )?.id ??
      null;

    const transaction = await prisma.transaction.create({
      data: {
        workspaceId: payload.workspaceId,
        accountId: payload.accountId,
        categoryId: resolvedCategoryId,
        date: new Date(payload.date),
        amount: payload.amount.toString(),
        currency: payload.currency.toUpperCase(),
        type: payload.type,
        merchantRaw: payload.merchantRaw,
        merchantClean: payload.merchantClean ?? null,
        description: payload.description ?? null,
        isTransfer: payload.isTransfer ?? false,
        isExcluded: payload.isExcluded ?? false,
        reviewStatus: "confirmed",
        parserConfidence: 100,
        categoryConfidence: resolvedCategoryId ? 100 : 0,
        accountMatchConfidence: 100,
        duplicateConfidence: 0,
        transferConfidence: payload.isTransfer ? 100 : 0,
        rawPayload: {
          source: "manual",
          merchantRaw: payload.merchantRaw,
          merchantClean: payload.merchantClean ?? null,
          description: payload.description ?? null,
        },
        normalizedPayload: {
          merchantClean: payload.merchantClean ?? payload.merchantRaw,
          categoryId: resolvedCategoryId,
          type: payload.type,
        },
        learnedRuleIdsApplied: [],
      },
    });

    if (resolvedCategoryId) {
      const category = await prisma.category.findUnique({
        where: { id: resolvedCategoryId },
      });

      if (category) {
        await recordTrainingSignal({
          workspaceId: payload.workspaceId,
          transactionId: transaction.id,
          merchantText: payload.merchantClean ?? payload.merchantRaw,
          categoryId: category.id,
          categoryName: category.name,
          type: payload.type,
          source: "manual_transaction_creation",
          confidence: 100,
          notes: payload.accountId ? "Manual transaction created in the app." : null,
        });
      }
    }

    return NextResponse.json({
      transaction: {
        ...transaction,
        amount: transaction.amount.toString(),
        date: transaction.date.toISOString(),
        createdAt: transaction.createdAt.toISOString(),
        updatedAt: transaction.updatedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Invalid transaction payload" }, { status: 400 });
  }
}

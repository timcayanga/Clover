import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordTrainingSignal } from "@/lib/data-engine";
import { capturePostHogServerEvent } from "@/lib/analytics";
import {
  buildTransactionQueryWhere,
  parseTransactionQueryFilters,
  type TransactionQueryFilters,
} from "@/lib/transaction-query";

export const dynamic = "force-dynamic";

type TransactionApiRow = {
  id: string;
  workspaceId: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  reviewStatus: string | null;
  parserConfidence: number;
  categoryConfidence: number;
  accountMatchConfidence: number;
  duplicateConfidence: number;
  transferConfidence: number;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
  createdAt: string;
  warningReason: string | null;
};

type TransactionSummaryRow = {
  id: string;
  date: Date;
  amount: Prisma.Decimal | bigint | number | string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  categoryId: string | null;
  reviewStatus: string | null;
  parserConfidence: number;
  categoryConfidence: number;
  accountMatchConfidence: number;
  duplicateConfidence: number;
  transferConfidence: number;
  currency: string;
  description: string | null;
  category: { name: string } | null;
  account: { name: string } | null;
  createdAt: Date;
  isTransfer: boolean;
  isExcluded: boolean;
};

const isResolvedReviewStatus = (status: string | null) =>
  status === "confirmed" || status === "rejected" || status === "duplicate_skipped";

const normalizeTransactionKey = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const getTransactionWarningReason = (transaction: TransactionSummaryRow, duplicateCounts: Map<string, number>) => {
  if (isResolvedReviewStatus(transaction.reviewStatus)) {
    return null;
  }

  const signature = [
    transaction.date.toISOString().slice(0, 10),
    Number(transaction.amount).toFixed(2),
    normalizeTransactionKey(transaction.merchantClean ?? transaction.merchantRaw),
  ].join("|");

  if (transaction.isExcluded) {
    return "Ignored from totals";
  }

  if (!transaction.categoryId) {
    return "Needs category review";
  }

  if ((duplicateCounts.get(signature) ?? 0) > 1) {
    return "Possible duplicate";
  }

  return null;
};

const mapTransactionRow = (transaction: {
  id: string;
  workspaceId: string;
  accountId: string;
  account: { name: string };
  categoryId: string | null;
  category: { name: string } | null;
  reviewStatus: string | null;
  createdAt: Date;
  parserConfidence: number;
  categoryConfidence: number;
  accountMatchConfidence: number;
  duplicateConfidence: number;
  transferConfidence: number;
  date: Date;
  amount: Prisma.Decimal | bigint | number | string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
  warningReason: string | null;
}): TransactionApiRow => ({
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
  warningReason: transaction.warningReason,
});

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

    const filters: TransactionQueryFilters = parseTransactionQueryFilters(searchParams);
    const where = buildTransactionQueryWhere(workspaceId, filters);
    const pageSizeParam = searchParams.get("pageSize");
    const includeAll = pageSizeParam === "all";
    const requestedPage = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const requestedPageSize = includeAll ? null : Math.max(1, Number(pageSizeParam ?? "25") || 25);

    const summaryRows = await prisma.transaction.findMany({
      where,
      select: {
        id: true,
        accountId: true,
        date: true,
        amount: true,
        type: true,
        merchantRaw: true,
        merchantClean: true,
        categoryId: true,
        reviewStatus: true,
        parserConfidence: true,
        categoryConfidence: true,
        accountMatchConfidence: true,
        duplicateConfidence: true,
        transferConfidence: true,
        currency: true,
        description: true,
        category: {
          select: {
            name: true,
          },
        },
        account: {
          select: {
            name: true,
          },
        },
        createdAt: true,
        isTransfer: true,
        isExcluded: true,
      },
      orderBy: { date: "desc" },
    });

    const duplicateCounts = new Map<string, number>();
    for (const transaction of summaryRows) {
      const signature = [
        transaction.date.toISOString().slice(0, 10),
        Number(transaction.amount).toFixed(2),
        normalizeTransactionKey(transaction.merchantClean ?? transaction.merchantRaw),
      ].join("|");

      duplicateCounts.set(signature, (duplicateCounts.get(signature) ?? 0) + 1);
    }

    const summaryState = {
      totalCount: summaryRows.length,
      income: 0,
      spending: 0,
      transfers: 0,
      review: 0,
      topCategories: new Map<string, number>(),
      topAccounts: new Map<string, number>(),
      firstTransactionDate: summaryRows[summaryRows.length - 1]?.date.toISOString() ?? null,
      lastTransactionDate: summaryRows[0]?.date.toISOString() ?? null,
      firstReviewTransaction: null as TransactionApiRow | null,
      firstReviewTransactionIndex: null as number | null,
    };

    const transactions: TransactionApiRow[] = [];
    summaryRows.forEach((transaction, index) => {
      const warningReason = getTransactionWarningReason(transaction, duplicateCounts);
      const amount = Math.abs(Number(transaction.amount));
      const categoryName = transaction.category?.name ?? "Other";
      const accountName = transaction.account?.name ?? "";
      const mappedTransaction = mapTransactionRow({
        id: transaction.id,
        workspaceId,
        accountId: transaction.accountId,
        account: transaction.account,
        categoryId: transaction.categoryId,
        category: transaction.category,
        reviewStatus: transaction.reviewStatus,
        parserConfidence: transaction.parserConfidence,
        categoryConfidence: transaction.categoryConfidence,
        accountMatchConfidence: transaction.accountMatchConfidence,
        duplicateConfidence: transaction.duplicateConfidence,
        transferConfidence: transaction.transferConfidence,
        date: transaction.date,
        amount: transaction.amount,
        currency: transaction.currency,
        type: transaction.type,
        merchantRaw: transaction.merchantRaw,
        merchantClean: transaction.merchantClean,
        description: transaction.description,
        isTransfer: transaction.isTransfer,
        isExcluded: transaction.isExcluded,
        createdAt: transaction.createdAt,
        warningReason,
      });
      transactions.push(mappedTransaction);

      if (!transaction.isExcluded) {
        if (transaction.type === "income") {
          summaryState.income += amount;
        } else if (transaction.type === "transfer") {
          summaryState.transfers += amount;
        } else {
          summaryState.spending += amount;
        }

        summaryState.topCategories.set(categoryName, (summaryState.topCategories.get(categoryName) ?? 0) + amount);
        summaryState.topAccounts.set(accountName, (summaryState.topAccounts.get(accountName) ?? 0) + amount);
      }

      if (warningReason) {
        summaryState.review += 1;
        if (!summaryState.firstReviewTransaction) {
          summaryState.firstReviewTransaction = mappedTransaction;
          summaryState.firstReviewTransactionIndex = index + 1;
        }
      }
    });

    const topCategory = Array.from(summaryState.topCategories.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
    const topAccount = Array.from(summaryState.topAccounts.entries()).sort((a, b) => b[1] - a[1])[0] ?? null;
    const pageStart = (requestedPage - 1) * (requestedPageSize ?? 25);
    const pageTransactions = includeAll ? transactions : transactions.slice(pageStart, pageStart + (requestedPageSize ?? 25));

    return NextResponse.json({
      transactions: pageTransactions,
      page: includeAll ? 1 : requestedPage,
      pageSize: includeAll ? summaryState.totalCount : requestedPageSize ?? 25,
      totalCount: summaryState.totalCount,
      summary: {
        totalCount: summaryState.totalCount,
        income: summaryState.income,
        spending: summaryState.spending,
        transfers: summaryState.transfers,
        review: summaryState.review,
        topCategory,
        topAccount,
        firstTransactionDate: summaryState.firstTransactionDate,
        lastTransactionDate: summaryState.lastTransactionDate,
        firstReviewTransaction: summaryState.firstReviewTransaction,
        firstReviewTransactionIndex: summaryState.firstReviewTransactionIndex,
      },
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

    void capturePostHogServerEvent("feature_used", userId, {
      workspace_id: payload.workspaceId,
      feature_name: "manual_transaction_creation",
      transaction_count: 1,
    });
    if (resolvedCategoryId) {
      void capturePostHogServerEvent("transaction_categorized", userId, {
        workspace_id: payload.workspaceId,
        transaction_id: transaction.id,
        category_id: resolvedCategoryId,
        is_manual_edit: true,
      });
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

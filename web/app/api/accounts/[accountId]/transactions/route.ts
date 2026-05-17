import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { buildTransactionQueryWhere } from "@/lib/transaction-query";
import { getEffectiveTransactionCategoryName, getEffectiveTransactionMerchantName } from "@/lib/transaction-display";
import { normalizeInstitutionCurrency } from "@/lib/import-parser";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";
import { recoverWorkspaceImportEnrichment } from "@/lib/import-enrichment-recovery";

export const dynamic = "force-dynamic";

const resolveAccountTransactionsRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

type TransactionApiRow = {
  id: string;
  accountId: string;
  accountName: string;
  institution: string | null;
  accountNumber: string | null;
  categoryId: string | null;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  date: string;
  merchantRaw: string;
  merchantClean: string | null;
  categoryName: string | null;
  reviewStatus: string | null;
  categoryConfidence: number;
  description: string | null;
  isExcluded: boolean;
  importFileId: string | null;
  source: string;
  rawPayload: Prisma.JsonValue;
  createdAt: string;
};

const mapTransactionRow = (transaction: {
  id: string;
  accountId: string;
  date: Date;
  amount: Prisma.Decimal | bigint | number | string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  reviewStatus: string | null;
  categoryConfidence: number;
  rawPayload: Prisma.JsonValue;
  category: { id: string; name: string } | null;
  description: string | null;
  isExcluded: boolean;
  importFileId: string | null;
  createdAt: Date;
  institution?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
}): TransactionApiRow => {
  const normalizedCurrency =
    normalizeInstitutionCurrency(
      transaction.institution ?? null,
      transaction.currency,
      transaction.accountName ?? null
    ) ?? transaction.currency;
  const importedFromStatement = Boolean(transaction.importFileId) || isImportedTransactionPayload(transaction.rawPayload);
  const source = importedFromStatement ? "upload" : "manual";
  const categoryName = getEffectiveTransactionCategoryName({
    categoryName: transaction.category?.name ?? getRawPayloadCategoryName(transaction.rawPayload) ?? null,
    rawPayload: transaction.rawPayload,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description,
    institution: transaction.institution ?? null,
    source,
    type: transaction.type,
  });

  return {
    id: transaction.id,
    accountId: transaction.accountId,
    accountName: transaction.accountName ?? "",
    institution: transaction.institution ?? null,
    accountNumber: transaction.accountNumber ?? null,
    categoryId: transaction.category?.id ?? null,
    amount: transaction.amount.toString(),
    currency: normalizedCurrency,
    type: coerceTransactionTypeFromCategoryName(categoryName, transaction.type),
    date: transaction.date.toISOString(),
    merchantRaw: transaction.merchantRaw,
    merchantClean: getEffectiveTransactionMerchantName({
      merchantClean: transaction.merchantClean,
      merchantRaw: transaction.merchantRaw,
      institution: transaction.institution ?? null,
    }),
    categoryName,
    reviewStatus: transaction.reviewStatus,
    categoryConfidence: transaction.categoryConfidence,
    description: transaction.description,
    isExcluded: transaction.isExcluded,
    importFileId: transaction.importFileId,
    source,
    rawPayload: transaction.rawPayload,
    createdAt: transaction.createdAt.toISOString(),
  };
};

const getRawPayloadCategoryName = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const payload = rawPayload as Record<string, unknown>;
  const candidate = payload.categoryName ?? payload.category ?? payload.normalizedCategory;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
};

const isImportedTransactionPayload = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return false;
  }

  const payload = rawPayload as Record<string, unknown>;
  return Boolean(
    payload.importFileId ||
      payload.sourceImportFileId ||
      payload.importId ||
      payload.source === "upload" ||
      payload.source === "import" ||
      payload.source === "statement"
  );
};

const normalizeLegacyTransactionVisibility = async (workspaceId: string) => {
  await prisma.$executeRaw`
    UPDATE "Transaction"
    SET "isExcluded" = false
    WHERE "workspaceId" = ${workspaceId}
      AND "isExcluded" IS NULL
  `;
};

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveAccountTransactionsRouteUserId();
    const { accountId } = await params;
    const { searchParams } = new URL(request.url);

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, workspaceId: true, name: true, institution: true, type: true, accountNumber: true },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);
    await normalizeLegacyTransactionVisibility(account.workspaceId);
    await recoverWorkspaceImportEnrichment({
      workspaceId: account.workspaceId,
      workerId: `account-transactions-route-enrichment-${userId}`,
    }).catch(() => null);

    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.max(1, Number(searchParams.get("pageSize") ?? "25") || 25);
    const where = buildTransactionQueryWhere(account.workspaceId, { accountIds: [account.id] });
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
          currency: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          reviewStatus: true,
          categoryConfidence: true,
          rawPayload: true,
          description: true,
          isExcluded: true,
          createdAt: true,
          account: {
            select: {
              institution: true,
            },
          },
          category: {
            select: {
              id: true,
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
      transactions: rows.map((row) =>
        mapTransactionRow({
          ...row,
          institution: row.account?.institution ?? account.institution ?? null,
          accountName: account.name,
          accountNumber: account.accountNumber ?? null,
        })
      ),
      page,
      pageSize,
      totalCount,
      hasMore: skip + rows.length < totalCount,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

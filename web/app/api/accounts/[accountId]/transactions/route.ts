import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { buildTransactionQueryWhere } from "@/lib/transaction-query";
import { getEffectiveTransactionCategoryName, getEffectiveTransactionMerchantName } from "@/lib/transaction-display";
import { normalizeInstitutionCurrency } from "@/lib/import-parser";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";
import { normalizeImportedAccountKey } from "@/lib/workspace-cache";

export const dynamic = "force-dynamic";

const resolveAccountTransactionsRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const normalizeTransactionKey = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const getLastFourDigits = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

const expandImportedAccountFilters = async (
  workspaceId: string,
  requestedAccount: {
    id: string;
    name: string;
    institution: string | null;
    type: string;
    accountNumber: string | null;
  }
) => {
  const siblingAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
    },
    select: {
      id: true,
      name: true,
      institution: true,
      type: true,
      accountNumber: true,
    },
  });

  const requestedDescriptor = {
    id: requestedAccount.id,
    key: normalizeImportedAccountKey(
      requestedAccount.name,
      requestedAccount.institution,
      requestedAccount.accountNumber,
      requestedAccount.type
    ),
    institution: (requestedAccount.institution ?? "").trim().toLowerCase(),
    lastFour: getLastFourDigits(requestedAccount.accountNumber ?? requestedAccount.name),
    type: requestedAccount.type,
  };
  const expandedAccountIds = new Set([requestedAccount.id]);

  for (const candidate of siblingAccounts) {
    const candidateDescriptor = {
      id: candidate.id,
      key: normalizeImportedAccountKey(candidate.name, candidate.institution, candidate.accountNumber, candidate.type),
      institution: (candidate.institution ?? "").trim().toLowerCase(),
      lastFour: getLastFourDigits(candidate.accountNumber ?? candidate.name),
      type: candidate.type,
    };

    if (candidateDescriptor.id === requestedDescriptor.id) {
      expandedAccountIds.add(candidate.id);
      continue;
    }

    if (candidateDescriptor.key && candidateDescriptor.key === requestedDescriptor.key) {
      expandedAccountIds.add(candidate.id);
      continue;
    }

    if (
      requestedDescriptor.institution &&
      candidateDescriptor.institution &&
      requestedDescriptor.institution === candidateDescriptor.institution &&
      requestedDescriptor.lastFour &&
      candidateDescriptor.lastFour &&
      requestedDescriptor.lastFour === candidateDescriptor.lastFour &&
      requestedDescriptor.type === candidateDescriptor.type
    ) {
      expandedAccountIds.add(candidate.id);
    }
  }

  return Array.from(expandedAccountIds);
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
    type: coerceTransactionTypeFromCategoryName(categoryName, transaction.type, transaction.amount),
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
      payload.sourceStatementFingerprint ||
      payload.sourceImportFileId ||
      payload.importId ||
      payload.source === "upload" ||
      payload.source === "import" ||
      payload.source === "statement"
  );
};

const getRawPayloadText = (rawPayload: Prisma.JsonValue | null | undefined, key: string) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return "";
  }

  const value = (rawPayload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
};

const getRawPayloadSourceRowIndex = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return null;
  }

  const value = (rawPayload as Record<string, unknown>).sourceRowIndex;
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
};

const getImportedTransactionAccountIdentityKey = (transaction: TransactionApiRow) =>
  normalizeImportedAccountKey(transaction.accountName, transaction.institution, transaction.accountNumber, null) || transaction.accountId;

const getImportedTransactionStableKey = (transaction: TransactionApiRow) => {
  const sourceRowIndex = getRawPayloadSourceRowIndex(transaction.rawPayload);
  const statementFingerprint = getRawPayloadText(transaction.rawPayload, "sourceStatementFingerprint");
  const accountIdentityKey = getImportedTransactionAccountIdentityKey(transaction);
  if (statementFingerprint && sourceRowIndex !== null) {
    return `statement:${accountIdentityKey}:${statementFingerprint}:${sourceRowIndex}`;
  }

  const sourceImportFileId = transaction.importFileId ?? getRawPayloadText(transaction.rawPayload, "sourceImportFileId");
  if (sourceImportFileId && sourceRowIndex !== null) {
    return `import:${accountIdentityKey}:${sourceImportFileId}:${sourceRowIndex}`;
  }

  if (isImportedTransactionPayload(transaction.rawPayload) || transaction.importFileId) {
    const normalizedMerchant = normalizeTransactionKey(transaction.merchantClean ?? transaction.merchantRaw);
    const normalizedDescription = normalizeTransactionKey(transaction.description);
    return [
      "legacy-import",
      accountIdentityKey,
      transaction.date,
      Number(transaction.amount).toFixed(2),
      transaction.currency,
      normalizedMerchant,
      normalizedDescription,
    ].join(":");
  }

  return "";
};

const scoreImportedTransactionForDisplay = (transaction: TransactionApiRow) => {
  const concreteCategory = transaction.categoryName && transaction.categoryName.trim().toLowerCase() !== "other" ? 1000 : 0;
  const cleanName =
    transaction.merchantClean && transaction.merchantClean.trim() && transaction.merchantClean.trim() !== transaction.merchantRaw.trim()
      ? 100
      : 0;
  return concreteCategory + cleanName + Number(transaction.categoryConfidence ?? 0) + (transaction.reviewStatus === "confirmed" ? 25 : 0);
};

const dedupeImportedTransactionRows = (transactions: TransactionApiRow[]) => {
  const next: TransactionApiRow[] = [];
  const indexByStableKey = new Map<string, number>();

  for (const transaction of transactions) {
    const stableKey = getImportedTransactionStableKey(transaction);
    if (!stableKey) {
      next.push(transaction);
      continue;
    }

    const existingIndex = indexByStableKey.get(stableKey);
    if (existingIndex === undefined) {
      indexByStableKey.set(stableKey, next.length);
      next.push(transaction);
      continue;
    }

    if (scoreImportedTransactionForDisplay(transaction) > scoreImportedTransactionForDisplay(next[existingIndex])) {
      next[existingIndex] = transaction;
    }
  }

  return next;
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

    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.max(1, Number(searchParams.get("pageSize") ?? "25") || 25);
    const accountIds = await expandImportedAccountFilters(account.workspaceId, account);
    const where = buildTransactionQueryWhere(account.workspaceId, { accountIds });
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
              name: true,
              institution: true,
              accountNumber: true,
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

    const transactions = dedupeImportedTransactionRows(
      rows.map((row) =>
        mapTransactionRow({
          ...row,
          institution: row.account?.institution ?? account.institution ?? null,
          accountName: row.account?.name ?? account.name,
          accountNumber: row.account?.accountNumber ?? account.accountNumber ?? null,
        })
      )
    );
    const collapsedDuplicateCount = rows.length - transactions.length;

    return NextResponse.json({
      transactions,
      page,
      pageSize,
      totalCount: Math.max(transactions.length, totalCount - collapsedDuplicateCount),
      hasMore: skip + rows.length < totalCount,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

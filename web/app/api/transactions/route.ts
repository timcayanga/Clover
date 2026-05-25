import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordTrainingSignal } from "@/lib/data-engine";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { countWorkspaceTransactions } from "@/lib/plan-access";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { getEffectiveTransactionCategoryName, getEffectiveTransactionMerchantName } from "@/lib/transaction-display";
import { coerceTransactionTypeFromCategoryName } from "@/lib/transaction-directions";
import { normalizeInstitutionCurrency } from "@/lib/import-parser";
import { normalizeImportedAccountKey } from "@/lib/workspace-cache";
import {
  buildTransactionQueryWhere,
  buildTransactionQueryOrderBy,
  parseTransactionQueryFilters,
  type TransactionQueryFilters,
} from "@/lib/transaction-query";

export const dynamic = "force-dynamic";

const getSummaryTransactionType = (transaction: {
  type: "income" | "expense" | "transfer";
  isTransfer: boolean;
}) => {
  if (transaction.type === "transfer" || transaction.isTransfer) {
    return "transfer" as const;
  }

  return transaction.type;
};

const resolveTransactionsRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

type TransactionApiRow = {
  id: string;
  workspaceId: string;
  accountId: string;
  accountName: string;
  institution: string | null;
  accountNumber: string | null;
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
  rawPayload: Prisma.JsonValue;
  normalizedPayload: Prisma.JsonValue;
  importFileId?: string | null;
  source: "upload" | "manual";
  splitBill: { id: string; title: string } | null;
};

type TransactionSummaryRow = {
  id: string;
  importFileId?: string | null;
  date: Date;
  amount: Prisma.Decimal | bigint | number | string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  categoryId: string | null;
  rawPayload: Prisma.JsonValue;
  reviewStatus: string | null;
  parserConfidence: number;
  categoryConfidence: number;
  accountMatchConfidence: number;
  duplicateConfidence: number;
  transferConfidence: number;
  currency: string;
  description: string | null;
  category: { name: string } | null;
  account: { name: string; institution: string | null } | null;
  accountNumber?: string | null;
  createdAt: Date;
  isTransfer: boolean;
  isExcluded: boolean;
};

const isResolvedReviewStatus = (status: string | null) =>
  status === "confirmed" || status === "rejected" || status === "duplicate_skipped";

const normalizeTransactionKey = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const getLastFourDigits = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

const expandImportedAccountFilters = async (workspaceId: string, accountIds: string[] | undefined) => {
  const requestedAccountIds = (accountIds ?? []).filter(Boolean);
  if (requestedAccountIds.length === 0) {
    return requestedAccountIds;
  }

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

  const requestedAccounts = siblingAccounts.filter((candidate) => requestedAccountIds.includes(candidate.id));
  if (requestedAccounts.length === 0) {
    return requestedAccountIds;
  }

  const expandedAccountIds = new Set(requestedAccountIds);
  const requestedDescriptors = requestedAccounts.map((account) => ({
    id: account.id,
    key: normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type),
    institution: (account.institution ?? "").trim().toLowerCase(),
    lastFour: getLastFourDigits(account.accountNumber ?? account.name),
    type: account.type,
  }));

  for (const candidate of siblingAccounts) {
    const candidateDescriptor = {
      id: candidate.id,
      key: normalizeImportedAccountKey(candidate.name, candidate.institution, candidate.accountNumber, candidate.type),
      institution: (candidate.institution ?? "").trim().toLowerCase(),
      lastFour: getLastFourDigits(candidate.accountNumber ?? candidate.name),
      type: candidate.type,
    };

    if (
      requestedDescriptors.some((requested) => {
        if (candidateDescriptor.id === requested.id) {
          return true;
        }

        if (candidateDescriptor.key === requested.key) {
          return true;
        }

        return Boolean(
          requested.institution &&
            candidateDescriptor.institution &&
            requested.institution === candidateDescriptor.institution &&
            requested.lastFour &&
            candidateDescriptor.lastFour &&
            requested.lastFour === candidateDescriptor.lastFour &&
            requested.type === candidateDescriptor.type
        );
      })
    ) {
      expandedAccountIds.add(candidate.id);
    }
  }

  return Array.from(expandedAccountIds);
};

const normalizeCategoryFilterKey = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const resolveCategoryFilterNames = async (workspaceId: string, categoryFilters: string[] | undefined) => {
  const values = (categoryFilters ?? []).map((value) => value.trim()).filter(Boolean);
  if (values.length === 0) {
    return new Set<string>();
  }

  const allCategories = await prisma.category.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
  });
  const categoryNameById = new Map(allCategories.map((category) => [category.id, category.name] as const));
  const categoryNameKeys = new Set(allCategories.map((category) => normalizeCategoryFilterKey(category.name)));

  return new Set(
    values
      .map((value) => categoryNameById.get(value) ?? value)
      .map(normalizeCategoryFilterKey)
      .filter((value) => value && (categoryNameKeys.has(value) || values.some((rawValue) => normalizeCategoryFilterKey(rawValue) === value)))
  );
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
  return (
    concreteCategory +
    cleanName +
    Number(transaction.categoryConfidence ?? 0) +
    Number(transaction.parserConfidence ?? 0) +
    (transaction.reviewStatus === "confirmed" ? 25 : 0)
  );
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

const getTransactionWarningReason = (transaction: TransactionSummaryRow, duplicateCounts: Map<string, number>) => {
  if (isResolvedReviewStatus(transaction.reviewStatus)) {
    return null;
  }

  const importedFromStatement =
    Boolean(transaction.importFileId) ||
    isImportedTransactionPayload(transaction.rawPayload);

  if (importedFromStatement) {
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

  const categoryName = transaction.category?.name ?? getRawPayloadCategoryName(transaction.rawPayload) ?? null;
  if ((categoryName ?? "").trim().toLowerCase() === "other") {
    return null;
  }

  if (!transaction.categoryId && !(categoryName ?? "").trim()) {
    return null;
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
  account: { name: string; institution: string | null };
  categoryId: string | null;
  rawPayload: Prisma.JsonValue;
  normalizedPayload: Prisma.JsonValue;
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
  importFileId?: string | null;
  accountNumber?: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
  warningReason: string | null;
  splitBill: { id: string; title: string } | null;
}): TransactionApiRow => {
  const normalizedCurrency =
    normalizeInstitutionCurrency(
      transaction.account.institution,
      transaction.currency,
      transaction.account.name
    ) ?? transaction.currency;
  const importedFromStatement = Boolean(transaction.importFileId) || isImportedTransactionPayload(transaction.rawPayload);
  const source = importedFromStatement ? "upload" : "manual";
  const categoryName = getEffectiveTransactionCategoryName({
    categoryName: transaction.category?.name ?? getRawPayloadCategoryName(transaction.rawPayload) ?? null,
    rawPayload: transaction.rawPayload,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description,
    institution: transaction.account.institution,
    source,
    type: transaction.type,
  });

  return {
    id: transaction.id,
    workspaceId: transaction.workspaceId,
    accountId: transaction.accountId,
    accountName: transaction.account.name,
    institution: transaction.account.institution,
    accountNumber: transaction.accountNumber ?? null,
    categoryId: transaction.categoryId,
    reviewStatus: transaction.reviewStatus,
    parserConfidence: transaction.parserConfidence,
    categoryConfidence: transaction.categoryConfidence,
    accountMatchConfidence: transaction.accountMatchConfidence,
    duplicateConfidence: transaction.duplicateConfidence,
    transferConfidence: transaction.transferConfidence,
    date: transaction.date.toISOString(),
    amount: transaction.amount.toString(),
    currency: normalizedCurrency,
    type: coerceTransactionTypeFromCategoryName(categoryName, transaction.type),
    merchantRaw: transaction.merchantRaw,
    merchantClean: getEffectiveTransactionMerchantName({
      merchantClean: transaction.merchantClean,
      merchantRaw: transaction.merchantRaw,
      institution: transaction.account.institution,
    }),
    description: transaction.description,
    isTransfer: coerceTransactionTypeFromCategoryName(categoryName, transaction.type) === "transfer",
    isExcluded: transaction.isExcluded,
    createdAt: transaction.createdAt.toISOString(),
    warningReason: transaction.warningReason,
    rawPayload: transaction.rawPayload,
    normalizedPayload: transaction.normalizedPayload,
    importFileId: transaction.importFileId ?? null,
    source,
    splitBill: transaction.splitBill,
    categoryName,
  };
};

const transactionMatchesEffectiveCategoryFilters = (transaction: TransactionApiRow, categoryFilterNames: Set<string>) => {
  if (categoryFilterNames.size === 0) {
    return true;
  }

  const effectiveCategoryName = normalizeCategoryFilterKey(transaction.categoryName ?? "");
  return Boolean(effectiveCategoryName && categoryFilterNames.has(effectiveCategoryName));
};

const receiptLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).nullable().optional(),
  unitPrice: z.union([z.string(), z.number()]).nullable().optional(),
  amount: z.union([z.string(), z.number()]).nullable().optional(),
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
  receiptLineItems: z.array(receiptLineItemSchema).optional(),
  isTransfer: z.boolean().optional(),
  isExcluded: z.boolean().optional(),
});

const getWorkspaceCurrencyCodes = async (workspaceId: string) => {
  const rows = await prisma.transaction.findMany({
    where: {
      workspaceId,
      deletedAt: null,
    },
    select: {
      currency: true,
    },
    distinct: ["currency"],
    orderBy: {
      currency: "asc",
    },
  });

  const codes = Array.from(
    new Set(
      rows
        .map((row) => (typeof row.currency === "string" && row.currency.trim() ? row.currency.trim().toUpperCase() : ""))
        .filter(Boolean)
    )
  );

  return codes.length > 0 ? codes : ["PHP"];
};

const normalizeLegacyTransactionVisibility = async (workspaceId: string) => {
  await prisma.$executeRaw`
    UPDATE "Transaction"
    SET "isExcluded" = false
    WHERE "workspaceId" = ${workspaceId}
      AND "isExcluded" IS NULL
  `;
};

export async function GET(request: Request) {
  try {
    const userId = await resolveTransactionsRouteUserId();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    await normalizeLegacyTransactionVisibility(workspaceId);

    const parsedFilters: TransactionQueryFilters = parseTransactionQueryFilters(searchParams);
    const expandedAccountIds = await expandImportedAccountFilters(workspaceId, parsedFilters.accountIds);
    const filters: TransactionQueryFilters = {
      ...parsedFilters,
      accountIds: expandedAccountIds,
    };
    const categoryFilterNames = await resolveCategoryFilterNames(workspaceId, filters.categoryIds);
    const hasEffectiveCategoryFilters = categoryFilterNames.size > 0;
    const where = buildTransactionQueryWhere(
      workspaceId,
      hasEffectiveCategoryFilters ? { ...filters, categoryIds: [] } : filters
    );
    const visibleWhere = { ...where, isExcluded: false };
    const orderBy = buildTransactionQueryOrderBy(filters);
    const pageSizeParam = searchParams.get("pageSize");
    const includeAll = pageSizeParam === "all";
    const summaryMode = searchParams.get("summaryMode") === "light" ? "light" : "full";
    const requestedPage = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const requestedPageSize = includeAll ? null : Math.max(1, Number(pageSizeParam ?? "25") || 25);
    const currencyCodes = await getWorkspaceCurrencyCodes(workspaceId);

    const totalCount = await prisma.transaction.count({ where: visibleWhere });
    if (totalCount === 0) {
      return NextResponse.json({
        transactions: [],
        page: 1,
        pageSize: includeAll ? 0 : requestedPageSize ?? 25,
        totalCount: 0,
        currencyCodes,
        summary: {
          totalCount: 0,
          income: 0,
          spending: 0,
          transfers: 0,
          review: 0,
          currencyCodes,
          topCategory: null,
          topAccount: null,
          firstTransactionDate: null,
          lastTransactionDate: null,
          firstReviewTransaction: null,
          firstReviewTransactionIndex: null,
        },
      });
    }

    if (summaryMode === "light" && !hasEffectiveCategoryFilters) {
      const pageStart = (requestedPage - 1) * (requestedPageSize ?? 25);
      const [pageRows, duplicateRows] = await Promise.all([
        prisma.transaction.findMany({
          where: visibleWhere,
          select: {
            id: true,
            accountId: true,
            date: true,
            amount: true,
            type: true,
            merchantRaw: true,
            merchantClean: true,
            importFileId: true,
            categoryId: true,
            rawPayload: true,
            normalizedPayload: true,
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
                institution: true,
              },
            },
            splitBill: {
              select: {
                id: true,
                title: true,
              },
            },
            createdAt: true,
            isTransfer: true,
            isExcluded: true,
          },
          orderBy,
          skip: pageStart,
          take: includeAll ? totalCount : requestedPageSize ?? 25,
        }),
        prisma.transaction.findMany({
          where: {
            ...visibleWhere,
            OR: [
              { reviewStatus: { notIn: ["confirmed", "rejected", "duplicate_skipped"] } },
              { categoryId: null },
            ],
          },
          select: {
            date: true,
            amount: true,
            merchantRaw: true,
            merchantClean: true,
          },
          orderBy,
          take: 250,
        }),
      ]);

      const duplicateCounts = new Map<string, number>();
      for (const transaction of duplicateRows) {
        const signature = [
          transaction.date.toISOString().slice(0, 10),
          Number(transaction.amount).toFixed(2),
          normalizeTransactionKey(transaction.merchantClean ?? transaction.merchantRaw),
        ].join("|");

        duplicateCounts.set(signature, (duplicateCounts.get(signature) ?? 0) + 1);
      }

      const transactions = pageRows.map((transaction) =>
        mapTransactionRow({
          id: transaction.id,
          workspaceId,
          accountId: transaction.accountId,
          account: transaction.account,
          categoryId: transaction.categoryId,
          rawPayload: transaction.rawPayload,
          normalizedPayload: transaction.normalizedPayload,
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
          warningReason: getTransactionWarningReason(transaction, duplicateCounts),
          splitBill: transaction.splitBill,
        })
      );
      const lightSummary = {
        income: 0,
        spending: 0,
        transfers: 0,
      };
      for (const transaction of transactions) {
        if (transaction.isExcluded) {
          continue;
        }

        const amount = Math.abs(Number(transaction.amount));
        if (!Number.isFinite(amount)) {
          continue;
        }

        const effectiveType = getSummaryTransactionType(transaction);
        if (effectiveType === "income") {
          lightSummary.income += amount;
        } else if (effectiveType === "transfer") {
          lightSummary.transfers += amount;
        } else {
          lightSummary.spending += amount;
        }
      }

      return NextResponse.json({
        transactions,
        page: includeAll ? 1 : requestedPage,
        pageSize: includeAll ? totalCount : requestedPageSize ?? 25,
        totalCount,
        currencyCodes,
        summary: {
          totalCount,
          income: lightSummary.income,
          spending: lightSummary.spending,
          transfers: lightSummary.transfers,
          review: 0,
          currencyCodes,
          topCategory: null,
          topAccount: null,
          firstTransactionDate: null,
          lastTransactionDate: null,
          firstReviewTransaction: null,
          firstReviewTransactionIndex: null,
        },
      });
    }

    const summaryRows = await prisma.transaction.findMany({
      where: visibleWhere,
      select: {
        id: true,
        accountId: true,
        importFileId: true,
        date: true,
        amount: true,
        type: true,
        merchantRaw: true,
        merchantClean: true,
        categoryId: true,
        rawPayload: true,
        normalizedPayload: true,
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
            institution: true,
            accountNumber: true,
          },
        },
        splitBill: {
          select: {
            id: true,
            title: true,
          },
        },
        createdAt: true,
        isTransfer: true,
        isExcluded: true,
      },
      orderBy,
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

    const mappedSummaryRows = summaryRows.map((transaction) => {
      const warningReason = getTransactionWarningReason(transaction, duplicateCounts);
      return {
        transaction,
        warningReason,
        mappedTransaction: mapTransactionRow({
          id: transaction.id,
          workspaceId,
          accountId: transaction.accountId,
          account: transaction.account,
          accountNumber: transaction.account?.accountNumber ?? null,
          categoryId: transaction.categoryId,
          rawPayload: transaction.rawPayload,
          normalizedPayload: transaction.normalizedPayload,
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
          splitBill: transaction.splitBill,
        }),
      };
    });
    const transactions = dedupeImportedTransactionRows(
      mappedSummaryRows
        .map((entry) => entry.mappedTransaction)
        .filter((transaction) => transactionMatchesEffectiveCategoryFilters(transaction, categoryFilterNames))
    );
    const transactionById = new Map(mappedSummaryRows.map((entry) => [entry.mappedTransaction.id, entry] as const));

    const summaryState = {
      totalCount: transactions.length,
      income: 0,
      spending: 0,
      transfers: 0,
      review: 0,
      topCategories: new Map<string, number>(),
      topAccounts: new Map<string, number>(),
      firstTransactionDate: transactions[transactions.length - 1]?.date ?? null,
      lastTransactionDate: transactions[0]?.date ?? null,
      firstReviewTransaction: null as TransactionApiRow | null,
      firstReviewTransactionIndex: null as number | null,
    };

    transactions.forEach((mappedTransaction, index) => {
      const source = transactionById.get(mappedTransaction.id);
      const transaction = source?.transaction;
      const warningReason = source?.warningReason ?? mappedTransaction.warningReason;
      const amount = Math.abs(Number(mappedTransaction.amount));
      const accountName = mappedTransaction.accountName ?? transaction?.account?.name ?? "";

      if (!mappedTransaction.isExcluded) {
        const effectiveType = getSummaryTransactionType({
          type: mappedTransaction.type,
          isTransfer: mappedTransaction.isTransfer,
        });

        if (effectiveType === "income") {
          summaryState.income += amount;
        } else if (effectiveType === "transfer") {
          summaryState.transfers += amount;
        } else {
          summaryState.spending += amount;
        }

        const summaryCategoryName = mappedTransaction.categoryName ?? "Other";
        summaryState.topCategories.set(summaryCategoryName, (summaryState.topCategories.get(summaryCategoryName) ?? 0) + amount);
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
      currencyCodes,
      summary: {
        totalCount: summaryState.totalCount,
        income: summaryState.income,
        spending: summaryState.spending,
        transfers: summaryState.transfers,
        review: summaryState.review,
        currencyCodes,
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
    const userId = await resolveTransactionsRouteUserId();
    const payload = transactionSchema.parse(await request.json());

    await assertWorkspaceAccess(userId, payload.workspaceId);
    const user = await getOrCreateCurrentUser(userId);
    const effectiveLimits = getEffectiveUserLimits(user);
    const transactionCountPromise =
      effectiveLimits.transactionLimit !== null ? countWorkspaceTransactions(payload.workspaceId) : Promise.resolve(null);
    const otherCategoryPromise =
      payload.categoryId === undefined || payload.categoryId === null
        ? prisma.category.findFirst({
            where: {
              workspaceId: payload.workspaceId,
              name: "Other",
            },
          })
        : Promise.resolve(null);
    const selectedCategoryPromise =
      payload.categoryId === undefined || payload.categoryId === null
        ? Promise.resolve(null)
        : prisma.category.findFirst({
            where: { id: payload.categoryId, workspaceId: payload.workspaceId },
          });
    const [transactionCount, otherCategory, selectedCategory] = await Promise.all([
      transactionCountPromise,
      otherCategoryPromise,
      selectedCategoryPromise,
    ]);

    if (effectiveLimits.transactionLimit !== null && transactionCount !== null && transactionCount >= effectiveLimits.transactionLimit) {
      const isFreePlan = user.planTier === "free";
      return NextResponse.json(
        {
          error: isFreePlan
            ? `Free includes up to ${effectiveLimits.transactionLimit.toLocaleString()} transaction rows. Upgrade to Pro for more history.`
            : `You’ve reached the current ${effectiveLimits.transactionLimit.toLocaleString()}-row transaction limit on Pro. Manage billing if you need more room.`,
          planTier: user.planTier,
          limitType: "transaction_limit",
          limitValue: effectiveLimits.transactionLimit,
        },
        { status: 403 }
      );
    }

    const resolvedCategoryId = payload.categoryId ?? otherCategory?.id ?? null;
    const resolvedCategoryName = selectedCategory?.name ?? otherCategory?.name ?? null;
    const resolvedType = coerceTransactionTypeFromCategoryName(resolvedCategoryName, payload.type);
    const resolvedIsTransfer = resolvedType === "transfer";

    const transaction = await prisma.transaction.create({
      data: {
        workspaceId: payload.workspaceId,
        accountId: payload.accountId,
        categoryId: resolvedCategoryId,
        date: new Date(payload.date),
        amount: payload.amount.toString(),
        currency: payload.currency.toUpperCase(),
        type: resolvedType,
        merchantRaw: payload.merchantRaw,
        merchantClean: payload.merchantClean ?? null,
        description: payload.description ?? null,
        isTransfer: resolvedIsTransfer,
        isExcluded: payload.isExcluded ?? false,
        reviewStatus: "confirmed",
        parserConfidence: 100,
        categoryConfidence: resolvedCategoryId ? 100 : 0,
        accountMatchConfidence: 100,
        duplicateConfidence: 0,
        transferConfidence: resolvedIsTransfer ? 100 : 0,
        rawPayload: {
          source: "manual",
          merchantRaw: payload.merchantRaw,
          merchantClean: payload.merchantClean ?? null,
          description: payload.description ?? null,
          receiptLineItems:
            payload.receiptLineItems?.map((item) => ({
              description: item.description,
              quantity: item.quantity === undefined || item.quantity === null ? null : item.quantity,
              unitPrice: item.unitPrice === undefined || item.unitPrice === null ? null : item.unitPrice,
              amount: item.amount === undefined || item.amount === null ? null : item.amount,
            })) ?? [],
        },
        normalizedPayload: {
          merchantClean: payload.merchantClean ?? payload.merchantRaw,
          categoryId: resolvedCategoryId,
          type: resolvedType,
        },
        learnedRuleIdsApplied: [],
      },
      include: {
        account: {
          select: {
            name: true,
            institution: true,
            accountNumber: true,
          },
        },
        category: {
          select: {
            name: true,
          },
        },
      },
    });

    if (resolvedCategoryId) {
      const category = await prisma.category.findUnique({
        where: { id: resolvedCategoryId },
      });

      if (category) {
        void recordTrainingSignal({
          workspaceId: payload.workspaceId,
          transactionId: transaction.id,
          merchantText: payload.merchantClean ?? payload.merchantRaw,
          categoryId: category.id,
          categoryName: category.name,
          type: resolvedType,
          source: "manual_transaction_creation",
          confidence: 100,
          notes: payload.accountId ? "Manual transaction created in the app." : null,
          actorUserId: userId,
        }).catch(() => {
          // Background learning should never block a user-facing save.
        });
      }
    }

    void capturePostHogServerEvent("manual_transaction_created", userId, {
      workspace_id: payload.workspaceId,
      transaction_id: transaction.id,
      account_id: transaction.accountId,
      category_id: resolvedCategoryId,
      amount: Number(transaction.amount),
      amount_signed: Number(transaction.amount),
      currency: transaction.currency,
      transaction_type: transaction.type,
      source: "manual",
      is_transfer: transaction.isTransfer,
      is_excluded: transaction.isExcluded,
    });

    const createdAccount = await prisma.account.findUnique({
      where: { id: payload.accountId },
      select: { name: true },
    });
    const createdCategory = resolvedCategoryId
      ? await prisma.category.findUnique({
          where: { id: resolvedCategoryId },
          select: { name: true },
        })
      : null;

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
        accountName: createdAccount?.name ?? null,
        categoryName: createdCategory?.name ?? getRawPayloadCategoryName(transaction.rawPayload) ?? null,
      },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Invalid transaction payload" }, { status: 400 });
  }
}

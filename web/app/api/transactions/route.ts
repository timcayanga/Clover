import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { recordTrainingSignal } from "@/lib/data-engine";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { countWorkspaceOwnerTransactions } from "@/lib/plan-access";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { getEffectiveTransactionCategoryName, getEffectiveTransactionMerchantName, getLandbankTransactionDisplayOverride } from "@/lib/transaction-display";
import { coerceTransactionTypeFromCategoryName, resolveFinancialTransactionType } from "@/lib/transaction-directions";
import { normalizeInstitutionCurrency } from "@/lib/import-parser";
import { normalizeImportedAccountKey } from "@/lib/workspace-cache";
import { getTransactionReviewReasons } from "@/lib/transaction-review-reasons";
import { syncWorkspaceRecurringPatterns } from "@/lib/recurring-detection";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import {
  buildTransactionQueryWhere,
  buildTransactionQueryOrderBy,
  parseTransactionQueryFilters,
  type TransactionQueryFilters,
} from "@/lib/transaction-query";
import {
  createTransientDataUnavailableResponse,
  isTransientDataError,
  isUnauthorizedDataError,
} from "@/lib/transient-data";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { sanitizeTransactionTagNames } from "@/lib/transaction-tags";
import {
  getTransactionSummaryTypeOverrides,
  type TransactionSummaryCandidate,
} from "@/lib/transaction-summary";

export const dynamic = "force-dynamic";

const getSummaryTransactionType = (transaction: {
  type: "income" | "expense" | "transfer";
  isTransfer: boolean;
  categoryName?: string | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  institution?: string | null;
}) => {
  return resolveFinancialTransactionType(transaction);
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

const looksLikeImportedFileLabel = (value?: string | null) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Boolean(
    normalized &&
      (/\.pdf|\.csv|\.xlsx|\.xls|statement|unlocked|compressor|online|msoa|cert/.test(normalized) || /^\d[\d\s._-]+/.test(normalized))
  );
};

const canonicalInstitutionKey = (value?: string | null) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\bchina\s+bank\b/g, "chinabank")
    .replace(/\bmetro\s+bank\b/g, "metrobank");

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
      currency: true,
    },
  });

  const requestedAccounts = siblingAccounts.filter((candidate) => requestedAccountIds.includes(candidate.id));
  if (requestedAccounts.length === 0) {
    return requestedAccountIds;
  }

  const expandedAccountIds = new Set(requestedAccountIds);
  const requestedDescriptors = requestedAccounts.map((account) => ({
    id: account.id,
    key: normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency),
    institution: canonicalInstitutionKey(account.institution),
    lastFour: getLastFourDigits(account.accountNumber ?? account.name),
    type: account.type,
  }));

  for (const candidate of siblingAccounts) {
    const candidateDescriptor = {
      id: candidate.id,
      key: normalizeImportedAccountKey(
        candidate.name,
        candidate.institution,
        candidate.accountNumber,
        candidate.type,
        candidate.currency
      ),
      institution: canonicalInstitutionKey(candidate.institution),
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
          requested.lastFour &&
            candidateDescriptor.lastFour &&
            requested.lastFour === candidateDescriptor.lastFour &&
            requested.type === candidateDescriptor.type &&
            ((requested.institution &&
              candidateDescriptor.institution &&
              requested.institution === candidateDescriptor.institution) ||
              looksLikeImportedFileLabel(requested.institution) ||
              looksLikeImportedFileLabel(candidateDescriptor.institution))
        );
      })
    ) {
      expandedAccountIds.add(candidate.id);
    }
  }

  return Array.from(expandedAccountIds);
};

const expandImportedAccountIdentityFilters = async (
  workspaceId: string,
  identity: {
    accountName?: string | null;
    accountInstitution?: string | null;
    accountNumber?: string | null;
    accountType?: string | null;
    accountCurrency?: string | null;
  }
) => {
  if (
    !identity.accountName?.trim() &&
    !identity.accountInstitution?.trim() &&
    !identity.accountNumber?.trim() &&
    !identity.accountType?.trim()
  ) {
    return [];
  }

  const identityKey = normalizeImportedAccountKey(
    identity.accountName ?? null,
    identity.accountInstitution ?? null,
    identity.accountNumber ?? null,
    identity.accountType ?? null,
    identity.accountCurrency ?? null
  );
  if (!identityKey) {
    return [];
  }

  const matchingAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
    },
    select: {
      id: true,
      name: true,
      institution: true,
      type: true,
      accountNumber: true,
      currency: true,
    },
  });

  return matchingAccounts
    .filter(
      (account) =>
        normalizeImportedAccountKey(account.name, account.institution, account.accountNumber, account.type, account.currency) ===
        identityKey
    )
    .map((account) => account.id);
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

const normalizeDigits = (value?: string | null) => String(value ?? "").replace(/\D/g, "");

const normalizeParsedImportToken = (value?: string | null) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const getTransferCounterpartNumbers = (rawPayload: Prisma.JsonValue | null | undefined) => {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    return { from: null as string | null, to: null as string | null };
  }

  const payload = rawPayload as Record<string, unknown>;
  const from = typeof payload.transferFromAccountNumber === "string" && payload.transferFromAccountNumber.trim() ? payload.transferFromAccountNumber.trim() : null;
  const to = typeof payload.transferToAccountNumber === "string" && payload.transferToAccountNumber.trim() ? payload.transferToAccountNumber.trim() : null;
  return { from, to };
};

const isInternalWorkspaceTransfer = (
  transaction: { accountId: string; accountNumber?: string | null; rawPayload: Prisma.JsonValue },
  workspaceAccounts: Array<{ id: string; accountNumber: string | null }>
) => {
  const currentAccountNumber = normalizeDigits(transaction.accountNumber ?? null);
  if (!currentAccountNumber) {
    return false;
  }

  const { from, to } = getTransferCounterpartNumbers(transaction.rawPayload);
  const fromDigits = normalizeDigits(from);
  const toDigits = normalizeDigits(to);

  const counterpartNumber =
    fromDigits && currentAccountNumber === fromDigits
      ? toDigits
      : toDigits && currentAccountNumber === toDigits
        ? fromDigits
        : null;

  if (!counterpartNumber) {
    return false;
  }

  return workspaceAccounts.some(
    (account) => account.id !== transaction.accountId && normalizeDigits(account.accountNumber ?? null) === counterpartNumber
  );
};

const getImportedTransactionAccountIdentityKey = (transaction: TransactionApiRow) =>
  normalizeImportedAccountKey(
    transaction.accountName,
    transaction.institution,
    transaction.accountNumber,
    null,
    transaction.currency
  ) || transaction.accountId;

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
  const merchantText = [transaction.merchantClean, transaction.merchantRaw, transaction.description].filter(Boolean).join(" ").toLowerCase();
  const landbankDisplayBonus =
    transaction.categoryName?.trim().toLowerCase() === "cash & atm" &&
    /cash\s+out\s*-\s*order|atm\s+withdrawal|\bcash\s+out\b|\bwithdrawal\b|cash\s+deposit/.test(merchantText)
      ? 500
      : 0;
  return (
    concreteCategory +
    cleanName +
    landbankDisplayBonus +
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

  const signature = [
    transaction.date.toISOString().slice(0, 10),
    Number(transaction.amount).toFixed(2),
    normalizeTransactionKey(transaction.merchantClean ?? transaction.merchantRaw),
  ].join("|");

  const warningReasons = getTransactionReviewReasons({
    reviewStatus: transaction.reviewStatus,
    isExcluded: transaction.isExcluded,
    categoryId: transaction.categoryId,
    categoryName: transaction.category?.name ?? getRawPayloadCategoryName(transaction.rawPayload) ?? null,
    parserConfidence: transaction.parserConfidence,
    categoryConfidence: transaction.categoryConfidence,
    accountMatchConfidence: transaction.accountMatchConfidence,
    duplicateConfidence: (duplicateCounts.get(signature) ?? 0) > 1 ? 70 : transaction.duplicateConfidence,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    rawPayload: transaction.rawPayload,
  });

  return warningReasons[0] ?? null;
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
}, workspaceAccounts: Array<{ id: string; accountNumber: string | null }>): TransactionApiRow => {
  const normalizedCurrency =
    normalizeInstitutionCurrency(
      transaction.account.institution,
      transaction.currency,
      transaction.account.name
    ) ?? transaction.currency;
  const importedFromStatement = Boolean(transaction.importFileId) || isImportedTransactionPayload(transaction.rawPayload);
  const source = importedFromStatement ? "upload" : "manual";
  const landbankOverride = getLandbankTransactionDisplayOverride({
    institution: transaction.account.institution,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description,
    rawPayload: transaction.rawPayload,
  });
  const categoryName = getEffectiveTransactionCategoryName({
    categoryName: landbankOverride?.categoryName ?? transaction.category?.name ?? getRawPayloadCategoryName(transaction.rawPayload) ?? null,
    rawPayload: transaction.rawPayload,
    merchantRaw: transaction.merchantRaw,
    merchantClean: transaction.merchantClean,
    description: transaction.description,
    institution: transaction.account.institution,
    source,
    type: transaction.type,
  });
  const effectiveIsTransfer =
    (transaction.isTransfer && transaction.type === "transfer") ||
    isInternalWorkspaceTransfer(
      {
        accountId: transaction.accountId,
        accountNumber: transaction.accountNumber ?? null,
        rawPayload: transaction.rawPayload,
      },
      workspaceAccounts
    );
  const effectiveType = coerceTransactionTypeFromCategoryName(
    categoryName,
    landbankOverride?.type ?? transaction.type,
    transaction.amount,
    effectiveIsTransfer
  );

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
    type: effectiveType,
    merchantRaw: transaction.merchantRaw,
    merchantClean: getEffectiveTransactionMerchantName({
      merchantClean: transaction.merchantClean,
      merchantRaw: transaction.merchantRaw,
      institution: transaction.account.institution,
    }),
    description: transaction.description,
    isTransfer: effectiveType === "transfer",
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
  investmentAssetName: z.string().trim().min(1).optional(),
  description: z.string().optional().nullable(),
  receiptLineItems: z.array(receiptLineItemSchema).optional(),
  isTransfer: z.boolean().optional(),
  isExcluded: z.boolean().optional(),
  preserveType: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

const normalizeTransactionTag = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const getWorkspaceCurrencyCodes = async (workspaceId: string) => {
  // Prisma's distinct option deduplicates in the client for this query shape,
  // transferring every transaction currency from Supabase on every page load.
  // Keep the distinct operation inside Postgres so only a few codes leave it.
  const rows = await prisma.$queryRaw<Array<{ currency: string | null }>>`
    SELECT DISTINCT "currency"
    FROM "Transaction"
    WHERE "workspaceId" = ${workspaceId}
      AND "deletedAt" IS NULL
    ORDER BY "currency" ASC
  `;

  const codes = Array.from(
    new Set(
      rows
        .map((row) => (typeof row.currency === "string" && row.currency.trim() ? row.currency.trim().toUpperCase() : ""))
        .filter(Boolean)
    )
  );

  return codes.length > 0 ? codes : ["PHP"];
};

const RECENT_IMPORT_VISIBILITY_WINDOW_MS = 10 * 60 * 1000;
export async function GET(request: Request) {
  try {
    const userId = await resolveTransactionsRouteUserId();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    const parsedFilters: TransactionQueryFilters = parseTransactionQueryFilters(searchParams);
    const [workspaceAccountRows, expandedAccountIds, expandedIdentityAccountIds] = await Promise.all([
      prisma.account.findMany({
        where: { workspaceId },
        select: { id: true, accountNumber: true, institution: true, type: true },
      }),
      expandImportedAccountFilters(workspaceId, parsedFilters.accountIds),
      expandImportedAccountIdentityFilters(workspaceId, {
        accountName: searchParams.get("accountName"),
        accountInstitution: searchParams.get("accountInstitution"),
        accountNumber: searchParams.get("accountNumber"),
        accountType: searchParams.get("accountType"),
        accountCurrency: searchParams.get("accountCurrency"),
      }),
    ]);
    const workspaceAccounts = workspaceAccountRows.map((account) => ({
      id: account.id,
      accountNumber: account.accountNumber,
    }));

    const filters: TransactionQueryFilters = {
      ...parsedFilters,
      accountIds: Array.from(new Set([...expandedAccountIds, ...expandedIdentityAccountIds])),
    };
    const categoryFilterNames = await resolveCategoryFilterNames(workspaceId, filters.categoryIds);
    const hasEffectiveCategoryFilters = categoryFilterNames.size > 0;
    const where = buildTransactionQueryWhere(
      workspaceId,
      hasEffectiveCategoryFilters ? { ...filters, categoryIds: [] } : filters
    );
    const visibleWhere = {
      ...where,
      isExcluded: false,
      ...(searchParams.get("accountType") === "investment"
        ? { account: { is: { type: "investment" as const } } }
        : {}),
    };
    const orderBy = buildTransactionQueryOrderBy(filters);
    const pageSizeParam = searchParams.get("pageSize");
    const includeAll = pageSizeParam === "all";
    const summaryMode = searchParams.get("summaryMode") === "light" ? "light" : "full";
    const requestedPage = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const requestedPageSize = includeAll ? null : Math.max(1, Number(pageSizeParam ?? "25") || 25);
    const [currencyCodes, totalCount] = await Promise.all([
      getWorkspaceCurrencyCodes(workspaceId),
      prisma.transaction.count({ where: visibleWhere }),
    ]);
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
      const shouldBoostRecentImportRows =
        requestedPage === 1 &&
        !includeAll &&
        (filters.sortField ?? "date") === "date" &&
        (filters.sortDirection ?? "desc") === "desc" &&
        !filters.query?.trim() &&
        !filters.currencyFilter?.trim() &&
        (filters.accountIds ?? []).length === 0 &&
        (filters.typeFilters ?? []).length === 0 &&
        (filters.merchantFilters ?? []).length === 0 &&
        (filters.dateFilterMode ?? "ltd") === "ltd" &&
        !filters.customStart?.trim() &&
        !filters.customEnd?.trim() &&
        !filters.amountMin?.trim() &&
        !filters.amountMax?.trim();
      const recentImportCutoff = new Date(Date.now() - RECENT_IMPORT_VISIBILITY_WINDOW_MS);
      const bdoAccountIds = workspaceAccountRows
        .filter((account) => /\bbdo\b|\bbanco de oro\b/i.test(account.institution ?? ""))
        .map((account) => account.id);
      const [pageRows, recentImportRows, duplicateRows, summaryGroups, summaryCategories, bdoSummaryRows, summaryAdjustmentRows, summaryMatchingRows] = await Promise.all([
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
                accountNumber: true,
                type: true,
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
        shouldBoostRecentImportRows
          ? prisma.transaction.findMany({
              where: {
                ...visibleWhere,
                importFileId: { not: null },
                createdAt: { gte: recentImportCutoff },
              },
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
                    accountNumber: true,
                    type: true,
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
              orderBy: [{ createdAt: "desc" }, { date: "desc" }],
              take: Math.min(25, requestedPageSize ?? 25),
            })
          : Promise.resolve([]),
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
        prisma.transaction.groupBy({
          where: visibleWhere,
          by: ["type", "isTransfer", "categoryId", "accountId", "currency"],
          _sum: {
            amount: true,
          },
        }),
        prisma.category.findMany({
          where: { workspaceId },
          select: { id: true, name: true },
        }),
        bdoAccountIds.length > 0
          ? prisma.transaction.findMany({
              where: {
                AND: [visibleWhere, { accountId: { in: bdoAccountIds } }],
              },
              select: {
                amount: true,
                currency: true,
                type: true,
                isTransfer: true,
                merchantRaw: true,
                merchantClean: true,
                description: true,
                category: { select: { name: true } },
                account: { select: { institution: true } },
              },
            })
          : Promise.resolve([]),
        prisma.transaction.findMany({
          where: {
            AND: [
              visibleWhere,
              {
                OR: [
                  { merchantRaw: { contains: "payment", mode: "insensitive" } },
                  { merchantClean: { contains: "payment", mode: "insensitive" } },
                  { description: { contains: "payment", mode: "insensitive" } },
                  { merchantRaw: { contains: "repayment", mode: "insensitive" } },
                  { merchantClean: { contains: "repayment", mode: "insensitive" } },
                  { description: { contains: "repayment", mode: "insensitive" } },
                ],
              },
            ],
          },
          select: {
            id: true,
            accountId: true,
            date: true,
            amount: true,
            currency: true,
            type: true,
            isTransfer: true,
            merchantRaw: true,
            merchantClean: true,
            description: true,
            rawPayload: true,
            category: { select: { name: true } },
            account: { select: { type: true, institution: true } },
          },
        }),
        prisma.transaction.findMany({
          where: {
            workspaceId,
            isExcluded: false,
            deletedAt: null,
            OR: [
              { merchantRaw: { contains: "payment", mode: "insensitive" } },
              { merchantClean: { contains: "payment", mode: "insensitive" } },
              { description: { contains: "payment", mode: "insensitive" } },
              { merchantRaw: { contains: "repayment", mode: "insensitive" } },
              { merchantClean: { contains: "repayment", mode: "insensitive" } },
              { description: { contains: "repayment", mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            accountId: true,
            date: true,
            amount: true,
            currency: true,
            type: true,
            isTransfer: true,
            merchantRaw: true,
            merchantClean: true,
            description: true,
            rawPayload: true,
            category: { select: { name: true } },
            account: { select: { type: true, institution: true } },
          },
        }),
      ]);
      const recentImportRowIds = new Set(recentImportRows.map((transaction) => transaction.id));
      const boostedPageRows = [
        ...recentImportRows,
        ...pageRows.filter((transaction) => !recentImportRowIds.has(transaction.id)),
      ];

      const duplicateCounts = new Map<string, number>();
      for (const transaction of duplicateRows) {
        const signature = [
          transaction.date.toISOString().slice(0, 10),
          Number(transaction.amount).toFixed(2),
          normalizeTransactionKey(transaction.merchantClean ?? transaction.merchantRaw),
        ].join("|");

        duplicateCounts.set(signature, (duplicateCounts.get(signature) ?? 0) + 1);
      }

      const transactions = boostedPageRows.map((transaction) =>
        mapTransactionRow({
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
          warningReason: getTransactionWarningReason(transaction, duplicateCounts),
          splitBill: transaction.splitBill,
        }, workspaceAccounts)
      );
      const lightSummary = {
        income: 0,
        spending: 0,
        transfers: 0,
      };
      const currencyTotals: Record<string, { income: number; spending: number; transfers: number }> = {};
      const addCurrencyTotal = (currencyValue: string, type: "income" | "expense" | "transfer", amount: number) => {
        const currency = normalizeInstitutionCurrency(currencyValue || "PHP") ?? "PHP";
        currencyTotals[currency] ??= { income: 0, spending: 0, transfers: 0 };
        if (type === "income") currencyTotals[currency].income += amount;
        else if (type === "transfer") currencyTotals[currency].transfers += amount;
        else currencyTotals[currency].spending += amount;
      };
      const categoryNameById = new Map(summaryCategories.map((category) => [category.id, category.name] as const));
      const bdoAccountIdSet = new Set(bdoAccountIds);
      for (const group of summaryGroups) {
        if (bdoAccountIdSet.has(group.accountId)) continue;
        const amount = Math.abs(Number(group._sum.amount ?? 0));
        if (!Number.isFinite(amount)) {
          continue;
        }

        const effectiveType = getSummaryTransactionType({
          type: group.type,
          isTransfer: group.isTransfer,
          categoryName: group.categoryId ? categoryNameById.get(group.categoryId) : null,
        });
        if (effectiveType === "income") {
          lightSummary.income += amount;
        } else if (effectiveType === "transfer") {
          lightSummary.transfers += amount;
        } else {
          lightSummary.spending += amount;
        }
        addCurrencyTotal(group.currency, effectiveType, amount);
      }
      for (const transaction of bdoSummaryRows) {
        const amount = Math.abs(Number(transaction.amount));
        if (!Number.isFinite(amount)) continue;
        const effectiveType = getSummaryTransactionType({
          type: transaction.type,
          isTransfer: transaction.isTransfer,
          categoryName: transaction.category?.name,
          merchantRaw: transaction.merchantRaw,
          merchantClean: transaction.merchantClean,
          description: transaction.description,
          institution: transaction.account?.institution,
        });
        if (effectiveType === "income") lightSummary.income += amount;
        else if (effectiveType === "transfer") lightSummary.transfers += amount;
        else lightSummary.spending += amount;
        addCurrencyTotal(transaction.currency, effectiveType, amount);
      }
      const lightSummaryOverrides = getTransactionSummaryTypeOverrides(
        summaryMatchingRows.map((transaction) => ({
          ...transaction,
          accountType: transaction.account?.type ?? null,
          categoryName: transaction.category?.name ?? null,
        }))
      );
      for (const transaction of summaryAdjustmentRows) {
        const overrideType = lightSummaryOverrides.get(transaction.id);
        if (!overrideType) continue;

        const originalType = getSummaryTransactionType({
          type: transaction.type,
          isTransfer: transaction.isTransfer,
          categoryName: transaction.category?.name,
          merchantRaw: transaction.merchantRaw,
          merchantClean: transaction.merchantClean,
          description: transaction.description,
          institution: transaction.account?.institution,
        });
        if (originalType === overrideType) continue;

        const amount = Math.abs(Number(transaction.amount));
        if (!Number.isFinite(amount)) continue;
        if (originalType === "income") lightSummary.income -= amount;
        else if (originalType === "transfer") lightSummary.transfers -= amount;
        else lightSummary.spending -= amount;

        if (overrideType === "income") lightSummary.income += amount;
        else if (overrideType === "transfer") lightSummary.transfers += amount;
        else lightSummary.spending += amount;
        addCurrencyTotal(transaction.currency, originalType, -amount);
        addCurrencyTotal(transaction.currency, overrideType, amount);
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
          currencyTotals,
          topCategory: null,
          topAccount: null,
          firstTransactionDate: null,
          lastTransactionDate: null,
          firstReviewTransaction: null,
          firstReviewTransactionIndex: null,
        },
      });
    }

    const shouldBoostRecentImportRows =
      requestedPage === 1 &&
      !includeAll &&
      (filters.sortField ?? "date") === "date" &&
      (filters.sortDirection ?? "desc") === "desc" &&
      !filters.query?.trim() &&
      !filters.currencyFilter?.trim() &&
      (filters.accountIds ?? []).length === 0 &&
      (filters.typeFilters ?? []).length === 0 &&
      (filters.merchantFilters ?? []).length === 0 &&
      (filters.dateFilterMode ?? "ltd") === "ltd" &&
      !filters.customStart?.trim() &&
      !filters.customEnd?.trim() &&
      !filters.amountMin?.trim() &&
      !filters.amountMax?.trim() &&
      !hasEffectiveCategoryFilters;
    const recentImportCutoff = new Date(Date.now() - RECENT_IMPORT_VISIBILITY_WINDOW_MS);
    const [summaryRows, recentImportRows, summaryMatchingRows] = await Promise.all([
      prisma.transaction.findMany({
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
              type: true,
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
      }),
      shouldBoostRecentImportRows
        ? prisma.transaction.findMany({
            where: {
              ...visibleWhere,
              importFileId: { not: null },
              createdAt: { gte: recentImportCutoff },
            },
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
                  type: true,
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
            orderBy: [{ createdAt: "desc" }, { date: "desc" }],
            take: Math.min(25, requestedPageSize ?? 25),
          })
        : Promise.resolve([]),
      prisma.transaction.findMany({
        where: {
          workspaceId,
          isExcluded: false,
          deletedAt: null,
          OR: [
            { merchantRaw: { contains: "payment", mode: "insensitive" } },
            { merchantClean: { contains: "payment", mode: "insensitive" } },
            { description: { contains: "payment", mode: "insensitive" } },
            { merchantRaw: { contains: "repayment", mode: "insensitive" } },
            { merchantClean: { contains: "repayment", mode: "insensitive" } },
            { description: { contains: "repayment", mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          accountId: true,
          date: true,
          amount: true,
          currency: true,
          type: true,
          isTransfer: true,
          merchantRaw: true,
          merchantClean: true,
          description: true,
          rawPayload: true,
          category: { select: { name: true } },
          account: { select: { type: true, institution: true } },
        },
      }),
    ]);
    const recentImportRowIds = new Set(recentImportRows.map((transaction) => transaction.id));
    const boostedSummaryRows = shouldBoostRecentImportRows
      ? [
          ...recentImportRows,
          ...summaryRows.filter((transaction) => !recentImportRowIds.has(transaction.id)),
        ]
      : summaryRows;

    const duplicateCounts = new Map<string, number>();
    for (const transaction of boostedSummaryRows) {
      const signature = [
        transaction.date.toISOString().slice(0, 10),
        Number(transaction.amount).toFixed(2),
        normalizeTransactionKey(transaction.merchantClean ?? transaction.merchantRaw),
      ].join("|");

      duplicateCounts.set(signature, (duplicateCounts.get(signature) ?? 0) + 1);
    }

    const mappedSummaryRows = boostedSummaryRows.map((transaction) => {
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
        }, workspaceAccounts),
      };
    });
    const transactions = dedupeImportedTransactionRows(
      mappedSummaryRows
        .map((entry) => entry.mappedTransaction)
        .filter((transaction) => transactionMatchesEffectiveCategoryFilters(transaction, categoryFilterNames))
    );
    const transactionById = new Map(mappedSummaryRows.map((entry) => [entry.mappedTransaction.id, entry] as const));
    const visibleSummaryCandidates = transactions.map((mappedTransaction) => {
        const transaction = transactionById.get(mappedTransaction.id)?.transaction;
        return {
          id: mappedTransaction.id,
          accountId: mappedTransaction.accountId,
          accountType: transaction?.account?.type ?? null,
          date: transaction?.date ?? mappedTransaction.date,
          amount: transaction?.amount ?? mappedTransaction.amount,
          currency: transaction?.currency ?? mappedTransaction.currency,
          type: transaction?.type ?? mappedTransaction.type,
          isTransfer: transaction?.isTransfer ?? mappedTransaction.isTransfer,
          categoryName: transaction?.category?.name ?? mappedTransaction.categoryName,
          merchantRaw: transaction?.merchantRaw ?? mappedTransaction.merchantRaw,
          merchantClean: transaction?.merchantClean ?? mappedTransaction.merchantClean,
          description: transaction?.description ?? mappedTransaction.description,
          rawPayload: transaction?.rawPayload ?? mappedTransaction.rawPayload,
        };
      });
    const summaryCandidateById = new Map<string, TransactionSummaryCandidate>(
      summaryMatchingRows.map((transaction) => [
        transaction.id,
        {
          ...transaction,
          accountType: transaction.account?.type ?? null,
          categoryName: transaction.category?.name ?? null,
        },
      ] as const)
    );
    for (const transaction of visibleSummaryCandidates) {
      summaryCandidateById.set(transaction.id, transaction);
    }
    const summaryTypeOverrides = getTransactionSummaryTypeOverrides(
      Array.from(summaryCandidateById.values())
    );

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
      currencyTotals: {} as Record<string, { income: number; spending: number; transfers: number }>,
    };

    transactions.forEach((mappedTransaction, index) => {
      const source = transactionById.get(mappedTransaction.id);
      const transaction = source?.transaction;
      const warningReason = source?.warningReason ?? mappedTransaction.warningReason;
      const amount = Math.abs(Number(mappedTransaction.amount));
      const accountName = mappedTransaction.accountName ?? transaction?.account?.name ?? "";

      if (!mappedTransaction.isExcluded) {
        const effectiveType =
          summaryTypeOverrides.get(mappedTransaction.id) ??
          getSummaryTransactionType({
            type: transaction?.type ?? mappedTransaction.type,
            isTransfer: transaction?.isTransfer ?? mappedTransaction.isTransfer,
            categoryName: transaction?.category?.name ?? mappedTransaction.categoryName,
            merchantRaw: transaction?.merchantRaw ?? mappedTransaction.merchantRaw,
            merchantClean: transaction?.merchantClean ?? mappedTransaction.merchantClean,
            description: transaction?.description ?? mappedTransaction.description,
            institution: transaction?.account?.institution ?? mappedTransaction.institution,
          });

        if (effectiveType === "income") {
          summaryState.income += amount;
        } else if (effectiveType === "transfer") {
          summaryState.transfers += amount;
        } else {
          summaryState.spending += amount;
        }
        const currency = normalizeInstitutionCurrency(mappedTransaction.currency || "PHP") ?? "PHP";
        summaryState.currencyTotals[currency] ??= { income: 0, spending: 0, transfers: 0 };
        if (effectiveType === "income") summaryState.currencyTotals[currency].income += amount;
        else if (effectiveType === "transfer") summaryState.currencyTotals[currency].transfers += amount;
        else summaryState.currencyTotals[currency].spending += amount;

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
        currencyTotals: summaryState.currencyTotals,
        topCategory,
        topAccount,
        firstTransactionDate: summaryState.firstTransactionDate,
        lastTransactionDate: summaryState.lastTransactionDate,
        firstReviewTransaction: summaryState.firstReviewTransaction,
        firstReviewTransactionIndex: summaryState.firstReviewTransactionIndex,
      },
    });
  } catch (error) {
    if (isTransientDataError(error)) {
      console.warn("[transactions] database temporarily unavailable", summarizeErrorForLog(error));
      return createTransientDataUnavailableResponse("Clover is reconnecting to your transactions. Please retry shortly.");
    }

    if (isUnauthorizedDataError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[transactions] unable to load transactions", summarizeErrorForLog(error));
    return NextResponse.json({ error: "Unable to load transactions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const userId = await resolveTransactionsRouteUserId();
    const payload = transactionSchema.parse(await request.json());

    await assertWorkspaceAccess(userId, payload.workspaceId);
    const user = await getOrCreateCurrentUser(userId);
    const effectiveLimits = getEffectiveUserLimits(user);
    const transactionCountPromise =
      effectiveLimits.transactionLimit !== null ? countWorkspaceOwnerTransactions(payload.workspaceId) : Promise.resolve(null);
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
    const resolvedType = payload.preserveType
      ? payload.type
      : coerceTransactionTypeFromCategoryName(resolvedCategoryName, payload.type);
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
          assetName: payload.investmentAssetName ?? null,
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
          assetName: payload.investmentAssetName ?? null,
          categoryId: resolvedCategoryId,
          type: resolvedType,
        },
        learnedRuleIdsApplied: [],
        transactionTags: payload.tags?.length
          ? {
              create: sanitizeTransactionTagNames(payload.tags).map((name) => ({
                tag: {
                  connectOrCreate: {
                    where: {
                      workspaceId_normalizedName: {
                        workspaceId: payload.workspaceId,
                        normalizedName: normalizeTransactionTag(name),
                      },
                    },
                    create: {
                      workspaceId: payload.workspaceId,
                      name,
                      normalizedName: normalizeTransactionTag(name),
                    },
                  },
                },
              })),
            }
          : undefined,
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

    void syncWorkspaceRecurringPatterns(payload.workspaceId).catch(() => {
      // Recurring detection should never block a manual transaction save.
    });

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

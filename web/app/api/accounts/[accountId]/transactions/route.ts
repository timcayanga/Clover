import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { buildTransactionQueryWhere } from "@/lib/transaction-query";
import {
  getEffectiveTransactionCategoryName,
  getEffectiveTransactionMerchantName,
  getLandbankTransactionDisplayOverride,
} from "@/lib/transaction-display";
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

const normalizeDigits = (value?: string | null) => String(value ?? "").replace(/\D/g, "");

const normalizeParsedImportToken = (value?: string | null) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

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
    institution: canonicalInstitutionKey(requestedAccount.institution),
    lastFour: getLastFourDigits(requestedAccount.accountNumber ?? requestedAccount.name),
    type: requestedAccount.type,
  };
  const expandedAccountIds = new Set([requestedAccount.id]);

  for (const candidate of siblingAccounts) {
    const candidateDescriptor = {
      id: candidate.id,
      key: normalizeImportedAccountKey(candidate.name, candidate.institution, candidate.accountNumber, candidate.type),
      institution: canonicalInstitutionKey(candidate.institution),
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
      continue;
    }

    if (
      requestedDescriptor.lastFour &&
      candidateDescriptor.lastFour &&
      requestedDescriptor.lastFour === candidateDescriptor.lastFour &&
      requestedDescriptor.type === candidateDescriptor.type &&
      (looksLikeImportedFileLabel(requestedDescriptor.institution) || looksLikeImportedFileLabel(candidateDescriptor.institution))
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
  const landbankOverride = getLandbankTransactionDisplayOverride({
    institution: transaction.institution ?? null,
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
    type: coerceTransactionTypeFromCategoryName(
      categoryName,
      landbankOverride?.type ?? transaction.type,
      transaction.amount
    ),
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
  const merchantText = [transaction.merchantClean, transaction.merchantRaw, transaction.description].filter(Boolean).join(" ").toLowerCase();
  const landbankDisplayBonus =
    transaction.categoryName?.trim().toLowerCase() === "cash & atm" &&
    /cash\s+out\s*-\s*order|atm\s+withdrawal|\bcash\s+out\b|\bwithdrawal\b|cash\s+deposit/.test(merchantText)
      ? 500
      : 0;
  return concreteCategory + cleanName + landbankDisplayBonus + Number(transaction.categoryConfidence ?? 0) + (transaction.reviewStatus === "confirmed" ? 25 : 0);
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

const findOrphanParsedImportIdsForAccount = async (account: {
  id: string;
  workspaceId: string;
  name: string;
  institution: string | null;
  accountNumber: string | null;
}) => {
  const accountDigits = normalizeDigits(account.accountNumber ?? account.name);
  const accountLastFour = accountDigits.length >= 4 ? accountDigits.slice(-4) : "";
  const institutionToken = normalizeParsedImportToken(account.institution ?? account.name)
    .replace(/\b(account|bank|checking|savings)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const nameToken = normalizeParsedImportToken(account.name).replace(/\d+/g, " ").replace(/\s+/g, " ").trim();

  if (!accountLastFour && !institutionToken && !nameToken) {
    return [];
  }

  const rows = await prisma.$queryRaw<Array<{ importFileId: string; rowCount: bigint }>>`
    SELECT pt."importFileId" AS "importFileId", COUNT(*)::bigint AS "rowCount"
    FROM "ParsedTransaction" pt
    INNER JOIN "ImportFile" i ON i."id" = pt."importFileId"
    WHERE pt."workspaceId" = ${account.workspaceId}
      AND pt."importFileId" IS NOT NULL
      AND (i."accountId" IS NULL OR i."accountId" = ${account.id})
      AND (
        i."status" = 'done'
        OR i."confirmedAt" IS NOT NULL
        OR COALESCE(i."parsedRowsCount", 0) > 0
      )
      AND (
        (${accountDigits} <> '' AND regexp_replace(COALESCE(pt."accountNumber", ''), '\\D', '', 'g') = ${accountDigits})
        OR (${accountLastFour} <> '' AND right(regexp_replace(COALESCE(pt."accountNumber", ''), '\\D', '', 'g'), 4) = ${accountLastFour})
        OR (${institutionToken} <> '' AND lower(COALESCE(pt."institution", '')) LIKE ${`%${institutionToken}%`})
        OR (${nameToken} <> '' AND lower(COALESCE(pt."accountName", '')) LIKE ${`%${nameToken}%`})
      )
    GROUP BY pt."importFileId"
    HAVING COUNT(*) >= 2
    ORDER BY MIN(pt."createdAt") ASC NULLS LAST, pt."importFileId" ASC
    LIMIT 6
  `.catch(() => []);

  const candidateImportIds = rows.map((row) => row.importFileId).filter(Boolean);
  if (candidateImportIds.length === 0) {
    return [];
  }

  const existingRows = await prisma.transaction.groupBy({
    by: ["importFileId"],
    where: {
      workspaceId: account.workspaceId,
      deletedAt: null,
      importFileId: { in: candidateImportIds },
    },
    _count: { _all: true },
  });
  const importIdsWithVisibleRows = new Set(existingRows.filter((row) => row.importFileId).map((row) => row.importFileId as string));
  return candidateImportIds.filter((importFileId) => !importIdsWithVisibleRows.has(importFileId));
};

const IMPORT_RECOVERY_TIMEOUT_MS = 1200;

const hasActiveWorkspaceImport = async (workspaceId: string) => {
  const activeImportCount = await prisma.importFile.count({
    where: {
      workspaceId,
      status: "processing",
    },
  });

  return activeImportCount > 0;
};

const withImportRecoveryTimeout = async (task: Promise<boolean>) =>
  Promise.race([
    task,
    new Promise<false>((resolve) => {
      setTimeout(() => resolve(false), IMPORT_RECOVERY_TIMEOUT_MS);
    }),
  ]);

const materializeOrphanParsedImportsForAccount = async (account: {
  id: string;
  workspaceId: string;
  name: string;
  institution: string | null;
  type: string;
  accountNumber: string | null;
  source: string;
}) => {
  if (account.source !== "upload") {
    return false;
  }

  const existingRows = await prisma.transaction.count({
    where: {
      workspaceId: account.workspaceId,
      accountId: account.id,
      deletedAt: null,
    },
  });
  if (existingRows > 0) {
    return false;
  }

  const orphanImportIds = await findOrphanParsedImportIdsForAccount(account);
  if (orphanImportIds.length === 0) {
    return false;
  }

  const { confirmImportFile } = await import("@/workers/import-processor");
  for (const importFileId of orphanImportIds) {
    await confirmImportFile(importFileId, account.id);
  }

  return true;
};

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveAccountTransactionsRouteUserId();
    const { accountId } = await params;
    const { searchParams } = new URL(request.url);

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, workspaceId: true, name: true, institution: true, type: true, accountNumber: true, source: true },
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);
    await normalizeLegacyTransactionVisibility(account.workspaceId);
    const shouldRunImportRecovery = !(await hasActiveWorkspaceImport(account.workspaceId));
    if (shouldRunImportRecovery) {
      await withImportRecoveryTimeout(materializeOrphanParsedImportsForAccount(account)).catch((error) => {
        console.warn("[account-transactions] unable to materialize orphan parsed import rows", {
          accountId: account.id,
          workspaceId: account.workspaceId,
          error,
        });
      });
    }

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

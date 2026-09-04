import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { hasCompatibleTable, loadAccountRules, normalizeAccountRuleKey, upsertAccountRule } from "@/lib/data-engine";
import { INVESTMENT_SUBTYPES, isFixedIncomeInvestmentSubtype, type InvestmentSubtype } from "@/lib/investments";
import { countWorkspaceOwnerPlanLimitedAccounts } from "@/lib/plan-access";
import { ensureWorkspaceCashAccount, seedWorkspaceDefaults } from "@/lib/starter-data";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { isMissingAccountNumberColumnError, omitAccountNumberField } from "@/lib/account-column-compat";
import { isSupportedAccountType } from "@/lib/account-types";
import { normalizeInstitutionCurrency } from "@/lib/import-parser";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { BANK_PRIORITY, normalizeBankName } from "@/lib/data-qa-banks";
import {
  buildUploadedAccountDedupeKey,
  buildUploadedAccountLastFourDedupeKey,
  inferCanonicalImportedAccountProduct,
  isOrdinaryPayPalAccountIdentity,
  isWiseWalletWithoutVisibleAccountNumber,
  matchesLegacyPayPalWalletDuplicate,
  normalizeImportedCurrencyCode,
} from "@/lib/imported-account-identity";
import { repairWorkspaceDataVisibility } from "@/lib/reconciliation";
import {
  createTransientDataUnavailableResponse,
  isTransientDataError,
  isUnauthorizedDataError,
} from "@/lib/transient-data";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { getLiveCryptoPhpPrices } from "@/lib/crypto-market-prices";
import {
  compareAccountCheckpointFreshness,
  isAccountBalanceCheckpointEvidence,
  resolveEffectiveAccountBalance,
} from "@/lib/account-balance-projection";
import { isCryptoAssetCurrencyCode } from "@/lib/financial-identity-detection";
import { removeEmptyNonDefaultCashAccounts } from "@/lib/empty-cash-account-cleanup";
import {
  getCanonicalPdaxHoldingIdentity,
  isPdaxWalletHoldingLabel,
  readPdaxPortfolioAccount,
  readPublishedPdaxPortfolioAccount,
  type PdaxPortfolioAccount,
} from "@/lib/pdax-portfolio-accounts";

export const dynamic = "force-dynamic";

const resolveAccountsRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

let accountColumnCache: Set<string> | null = null;

const getCompatibleAccountColumns = async () => {
  if (accountColumnCache) {
    return accountColumnCache;
  }

  try {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Account'
    `;

    accountColumnCache = new Set(columns.map((column) => column.column_name));
  } catch {
    accountColumnCache = new Set();
  }

  return accountColumnCache;
};

const getCompatibleAccountSelect = (columns: Set<string>) => ({
  id: true,
  workspaceId: true,
  name: true,
  institution: true,
  ...(columns.has("logoUrl") ? { logoUrl: true } : {}),
  ...(columns.has("importIdentityName") ? { importIdentityName: true } : {}),
  ...(columns.has("importIdentityInstitution") ? { importIdentityInstitution: true } : {}),
  ...(columns.has("importIdentityAccountNumber") ? { importIdentityAccountNumber: true } : {}),
  ...(columns.has("nameCustomized") ? { nameCustomized: true } : {}),
  ...(columns.has("institutionCustomized") ? { institutionCustomized: true } : {}),
  ...(columns.has("logoCustomized") ? { logoCustomized: true } : {}),
  ...(columns.has("accountNumber") ? { accountNumber: true } : {}),
  ...(columns.has("favorite") ? { favorite: true } : {}),
  investmentSubtype: true,
  investmentSymbol: true,
  investmentQuantity: true,
  investmentCostBasis: true,
  investmentPrincipal: true,
  investmentStartDate: true,
  investmentMaturityDate: true,
  investmentInterestRate: true,
  investmentMaturityValue: true,
  type: true,
  currency: true,
  source: true,
  balance: true,
  updatedAt: true,
  createdAt: true,
});

const normalizeAccountCurrency = (account: {
  institution?: string | null;
  currency?: string | null;
  name?: string | null;
}) =>
  normalizeInstitutionCurrency(account.institution ?? null, account.currency ?? null, account.name ?? null) ??
  account.currency ??
  "PHP";

const serializeAccount = <T extends {
  accountNumber?: string | null;
  currency?: string | null;
  institution?: string | null;
  name?: string | null;
  favorite?: boolean;
  transactionCount?: number | null;
  balance: { toString: () => string } | null;
  investmentQuantity: { toString: () => string } | null;
  investmentCostBasis: { toString: () => string } | null;
  investmentPrincipal: { toString: () => string } | null;
  investmentInterestRate: { toString: () => string } | null;
  investmentMaturityValue: { toString: () => string } | null;
  createdAt: Date;
  updatedAt: Date;
  investmentStartDate: Date | null;
  investmentMaturityDate: Date | null;
}>(account: T) => ({
  ...account,
  accountNumber: account.accountNumber ?? null,
  favorite: account.favorite ?? false,
  transactionCount: Number(account.transactionCount ?? 0),
  currency: normalizeAccountCurrency(account),
  balance: account.balance?.toString() ?? null,
  investmentQuantity: account.investmentQuantity?.toString() ?? null,
  investmentCostBasis: account.investmentCostBasis?.toString() ?? null,
  investmentPrincipal: account.investmentPrincipal?.toString() ?? null,
  investmentInterestRate: account.investmentInterestRate?.toString() ?? null,
  investmentMaturityValue: account.investmentMaturityValue?.toString() ?? null,
  investmentStartDate: account.investmentStartDate?.toISOString() ?? null,
  investmentMaturityDate: account.investmentMaturityDate?.toISOString() ?? null,
  createdAt: account.createdAt.toISOString(),
  updatedAt: account.updatedAt.toISOString(),
});

const loadInvestmentSnapshotsForWorkspace = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("InvestmentSnapshot")) || !(await hasCompatibleTable("InvestmentHolding"))) {
    return [];
  }

  const snapshots = await prisma.investmentSnapshot.findMany({
    where: {
      workspaceId,
      holdings: { some: {} },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      snapshotDate: true,
      portfolioName: true,
      currency: true,
      totalValue: true,
      costBasis: true,
      gainLossValue: true,
      gainLossPercent: true,
      confidence: true,
      updatedAt: true,
      account: {
        select: {
          id: true,
          name: true,
          institution: true,
          type: true,
        },
      },
      documentImport: {
        select: {
          id: true,
          documentFamily: true,
          documentSubtype: true,
          institution: true,
          accountName: true,
          accountNumber: true,
          currency: true,
          pageCount: true,
          confidence: true,
          createdAt: true,
        },
      },
      holdings: {
        orderBy: [{ rowIndex: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          rowIndex: true,
          assetName: true,
          assetSymbol: true,
          assetType: true,
          quantity: true,
          unitPrice: true,
          costBasis: true,
          marketValue: true,
          currentValue: true,
          gainLossValue: true,
          gainLossPercent: true,
          currency: true,
          status: true,
          confidence: true,
          updatedAt: true,
        },
      },
    },
  }).catch(() => []);

  return snapshots.map((snapshot) => ({
    ...snapshot,
    snapshotDate: snapshot.snapshotDate?.toISOString() ?? null,
    totalValue: snapshot.totalValue?.toString() ?? null,
    costBasis: snapshot.costBasis?.toString() ?? null,
    gainLossValue: snapshot.gainLossValue?.toString() ?? null,
    gainLossPercent: snapshot.gainLossPercent?.toString() ?? null,
    updatedAt: snapshot.updatedAt.toISOString(),
    documentImport: snapshot.documentImport
      ? {
          ...snapshot.documentImport,
          createdAt: snapshot.documentImport.createdAt.toISOString(),
        }
      : null,
    holdings: snapshot.holdings.map((holding) => ({
      ...holding,
      quantity: holding.quantity?.toString() ?? null,
      unitPrice: holding.unitPrice?.toString() ?? null,
      costBasis: holding.costBasis?.toString() ?? null,
      marketValue: holding.marketValue?.toString() ?? null,
      currentValue: holding.currentValue?.toString() ?? null,
      gainLossValue: holding.gainLossValue?.toString() ?? null,
      gainLossPercent: holding.gainLossPercent?.toString() ?? null,
      updatedAt: holding.updatedAt.toISOString(),
    })),
  }));
};

const loadEarliestInvestmentPurchaseDatesForWorkspace = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("InvestmentPurchase"))) {
    return new Map<string, Date>();
  }

  const purchases = await prisma.investmentPurchase.findMany({
    where: { account: { workspaceId } },
    orderBy: { purchasedAt: "asc" },
    select: { accountId: true, purchasedAt: true },
  }).catch(() => []);
  const earliestByAccountId = new Map<string, Date>();
  for (const purchase of purchases) {
    if (!earliestByAccountId.has(purchase.accountId)) {
      earliestByAccountId.set(purchase.accountId, purchase.purchasedAt);
    }
  }
  return earliestByAccountId;
};

const normalizeAccountIdentityKey = (accountName?: string | null, institution?: string | null, accountNumber?: string | null) => {
  const digits = String(accountNumber ?? "").replace(/\D/g, "");
  const accountNumberKey = digits.length >= 4 ? digits.slice(-4) : "";
  const nameKey = accountNumberKey || String(accountName ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  return `${String(institution ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()} ${nameKey}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const buildCurrencyScopedAccountIdentityKey = (account: {
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  type?: string | null;
  currency?: string | null;
}) => {
  const baseKey = normalizeAccountIdentityKey(account.name, account.institution, account.accountNumber);
  if (!baseKey) {
    return "";
  }

  const currencyScope = isWiseWalletWithoutVisibleAccountNumber(account) ? normalizeImportedCurrencyCode(account.currency) : null;
  return `${baseKey} ${currencyScope ?? ""}`.trim();
};

const parseNullableDecimal = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toString() : null;
};

const parseNullableDate = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseNullableText = (value: unknown) => {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
};

const getInvestmentSummaryField = (subtype: string | null) =>
  isFixedIncomeInvestmentSubtype(subtype) ? "investmentPrincipal" : "investmentCostBasis";

const normalizeInvestmentSubtype = (value: unknown): InvestmentSubtype | null => {
  const subtype = typeof value === "string" ? value.trim() : "";
  return INVESTMENT_SUBTYPES.includes(subtype as InvestmentSubtype) ? (subtype as InvestmentSubtype) : null;
};

const normalizeImportInstitution = (value?: string | null) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeUploadBankName = (value?: string | null) => {
  const normalized = normalizeBankName(value ?? null);
  if (normalized === "Unknown") {
    return null;
  }

  const normalizedKey = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const looksBankLike =
    BANK_PRIORITY.some((bankName) => bankName.toLowerCase().replace(/[^a-z0-9]+/g, "") === normalizedKey) ||
    /\b(bank|banking|bpi|bdo|rcbc|psbank|cimb|gcash|maya|gotyme|landbank|chinabank|eastwest|unionbank|security|aub|pnb|wise)\b/i.test(
      normalized
    );

  return looksBankLike ? normalized : null;
};

const normalizeImportAccountNumber = (value?: string | null) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits : null;
};

const normalizeImportIdentityText = (value?: string | null) =>
  normalizeImportInstitution(value)
    .toLowerCase()
    .replace(/\s+\d{4}$/, "")
    .trim();

const canonicalImportInstitutionKey = (value?: string | null) =>
  normalizeImportIdentityText(value)
    .replace(/\bunion\s*bank(?:\s+of\s+the\s+philippines)?\b/g, "unionbank")
    .replace(/\bchina\s+bank\b/g, "chinabank")
    .replace(/\bmetro\s+bank\b/g, "metrobank")
    .replace(/\bphilippine\s+national\s+bank\b/g, "pnb");

const importedAccountInstitutionKey = (account: {
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
}) => {
  const institution = canonicalImportInstitutionKey(account.institution);
  if (institution) {
    return institution;
  }

  const name = canonicalImportInstitutionKey(account.name);
  return name || null;
};

const importedAccountInstitutionCurrencyKey = (account: {
  name?: string | null;
  institution?: string | null;
  accountNumber?: string | null;
  currency?: string | null;
}) => {
  const institution = importedAccountInstitutionKey(account);
  const currency = String(account.currency ?? "").trim().toUpperCase();
  return institution && currency ? `${institution}|${currency}` : null;
};

const resolveUploadedAccountInstitution = (
  currentInstitution?: string | null,
  checkpointBankHint?: string | null,
  checkpointInstitution?: string | null
) =>
  normalizeUploadBankName(currentInstitution) ??
  normalizeUploadBankName(checkpointBankHint) ??
  normalizeUploadBankName(checkpointInstitution) ??
  null;

const buildUploadedAccountCrossTypeIdentityKey = (account: {
  institution?: string | null;
  accountNumber?: string | null;
  currency?: string | null;
}) => {
  const normalizedAccountNumber = normalizeImportAccountNumber(account.accountNumber);
  if (!normalizedAccountNumber || normalizedAccountNumber.length < 8) {
    return null;
  }

  return [
    canonicalImportInstitutionKey(account.institution),
    normalizedAccountNumber,
    normalizeImportedCurrencyCode(account.currency) ?? "",
  ].join(":");
};

const importAccountNumbersMayMatch = (left?: string | null, right?: string | null, requireExactMatch = false) => {
  const leftDigits = normalizeImportAccountNumber(left);
  const rightDigits = normalizeImportAccountNumber(right);
  if (!leftDigits || !rightDigits) {
    return false;
  }

  if (leftDigits === rightDigits) {
    return true;
  }

  if (requireExactMatch) {
    return false;
  }

  const leftIsSuffixOnly = leftDigits.length === 4;
  const rightIsSuffixOnly = rightDigits.length === 4;
  if (leftIsSuffixOnly !== rightIsSuffixOnly) {
    return false;
  }

  return leftIsSuffixOnly && rightIsSuffixOnly && leftDigits === rightDigits;
};

const findPublishedSummaryForAccount = (
  account: {
    id: string;
    name?: string | null;
    institution?: string | null;
    accountNumber?: string | null;
    type?: string | null;
    currency?: string | null;
  },
  summaries: Array<Record<string, unknown>>
) => {
  const accountKey = buildCurrencyScopedAccountIdentityKey({
    name: account.name ?? null,
    institution: account.institution ?? null,
    accountNumber: account.accountNumber ?? null,
    type: account.type ?? null,
    currency: account.currency ?? null,
  });
  const accountNumber = normalizeImportAccountNumber(account.accountNumber ?? null);

  return (
    summaries.find((summary) => String(summary.accountId ?? "").trim() === account.id) ??
    summaries.find((summary) => {
      const summaryKey = buildCurrencyScopedAccountIdentityKey({
        name: typeof summary.accountName === "string" ? summary.accountName : null,
        institution: typeof summary.institution === "string" ? summary.institution : null,
        accountNumber: typeof summary.accountNumber === "string" ? summary.accountNumber : null,
        type: typeof summary.accountType === "string" ? summary.accountType : null,
        currency: typeof summary.currency === "string" ? summary.currency : null,
      });
      const summaryNumber = typeof summary.accountNumber === "string" ? normalizeImportAccountNumber(summary.accountNumber) : null;
      return (
        (accountKey !== "" && summaryKey === accountKey) ||
        importAccountNumbersMayMatch(accountNumber, summaryNumber)
      );
    }) ??
    null
  );
};

const readImportedJsonNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
};

const readImportedJsonText = (payload: unknown, key: string) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const readImportedAccountType = (payload: unknown) => {
  const accountType = readImportedJsonText(payload, "accountType") ?? readImportedJsonText(payload, "type");
  if (!accountType) {
    return null;
  }

  return isSupportedAccountType(accountType) ? accountType : null;
};

const readImportedSourceRowIndex = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  return readImportedJsonNumber((payload as Record<string, unknown>).sourceRowIndex);
};

const isCimbParsedAccountRepairRow = (row: {
  institution: string | null;
  accountName: string | null;
  rawPayload: Prisma.JsonValue | null;
}) => {
  const institution =
    normalizeImportInstitution(row.institution).toLowerCase() ||
    normalizeImportInstitution(readImportedJsonText(row.rawPayload, "institution")).toLowerCase() ||
    normalizeImportInstitution(readImportedJsonText(row.rawPayload, "bank")).toLowerCase();
  const accountName = normalizeImportInstitution(row.accountName).toLowerCase();

  return institution === "cimb" || accountName.startsWith("cimb ");
};

const readImportedRunningBalance = (payload: unknown) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  return readImportedJsonNumber(record.balance ?? record.runningBalance ?? record.endingBalance);
};

const isGenericUploadedAccountForInstitution = (account: {
  name: string;
  institution?: string | null;
  accountNumber?: string | null;
  source: string;
}) => {
  if (account.source !== "upload" || normalizeImportAccountNumber(account.accountNumber ?? null)) {
    return false;
  }

  const institution = canonicalImportInstitutionKey(account.institution) || canonicalImportInstitutionKey(account.name);
  const name = normalizeImportInstitution(account.name).toLowerCase();
  const institutionWithSuffix = institution ? new RegExp(`^${institution.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s+\\d{4})?$`, "i") : null;
  return Boolean(
    institution &&
      (name === institution ||
        name === `${institution} account` ||
        !name ||
        (institutionWithSuffix ? institutionWithSuffix.test(name) : false))
  );
};

const looksLikeReceiptImageFilenameAccount = (account: {
  name: string;
  institution?: string | null | undefined;
  accountNumber?: string | null;
  source: string;
}) => {
  if (account.source !== "upload") {
    return false;
  }

  const combined = `${account.name ?? ""} ${account.institution ?? ""} ${account.accountNumber ?? ""}`.trim();
  return (
    /\.(?:jpe?g|png|webp|heic|heif|gif|bmp|avif)(?:\s|$)/i.test(combined) ||
    /^img[_-]?\d+(?:\.(?:jpe?g|png|webp))?(?:\s|$)/i.test(combined) ||
    /^\d{4}-\d{2}-\d{2}\s+\d{2}\.\d{2}\.\d{2}(?:\.(?:jpe?g|png|webp))?(?:\s|$)/i.test(combined)
  );
};

const looksLikeGenericImageFilenameAccount = (account: {
  name: string;
  institution?: string | null | undefined;
  accountNumber?: string | null;
  source: string;
}) => {
  if (account.source !== "upload") {
    return false;
  }

  return /^(?:img|screenshot|screen\s*shot|photo|image)[_\s-]?\d{3,8}(?:\s*\(\d+\))?(?:\.(?:jpe?g|png|webp|heic|heif|gif|bmp|avif))?(?:\s+\d{4})?$/i.test(
    normalizeImportInstitution(account.name)
  );
};

const repairParsedImportedAccounts = async (workspaceId: string, compatibleColumns: Set<string>) => {
  if (!compatibleColumns.has("accountNumber") || !(await hasCompatibleTable("ParsedTransaction"))) {
    return;
  }

  const parsedRows = await prisma.parsedTransaction.findMany({
    where: {
      workspaceId,
      accountNumber: { not: null },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 10_000,
    select: {
      importFileId: true,
      accountNumber: true,
      accountName: true,
      institution: true,
      currency: true,
      rawPayload: true,
    },
  }).catch(() => []);
  if (parsedRows.length === 0) {
    return;
  }
  const repairRows = parsedRows.filter((row) => !isCimbParsedAccountRepairRow(row));
  if (repairRows.length === 0) {
    return;
  }
  const importEvidence = await prisma.importFile.findMany({
    where: { workspaceId, id: { in: Array.from(new Set(repairRows.map((row) => row.importFileId))) } },
    select: { id: true, accountId: true, fileName: true },
  }).catch(() => []);
  const importEvidenceById = new Map(importEvidence.map((file) => [file.id, file] as const));

  const existingAccounts = await prisma.account.findMany({
    where: { workspaceId },
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      type: true,
      currency: true,
      source: true,
      balance: true,
      createdAt: true,
    },
  });
  const accountByIdentity = new Map(
    existingAccounts
      .map((account) => [buildUploadedAccountDedupeKey(account), account] as const)
      .filter((entry): entry is [string, (typeof existingAccounts)[number]] => Boolean(entry[0]))
  );
  const accountByLastFourIdentity = new Map(
    existingAccounts
      .map((account) => {
        const key = buildUploadedAccountLastFourDedupeKey(account);
        return key ? [key, account] as const : null;
      })
      .filter((entry): entry is [string, (typeof existingAccounts)[number]] => Boolean(entry))
  );
  type RepairGroupRow = (typeof parsedRows)[number];
  type RepairGroup = {
    accountNumber: string;
    accountName: string | null;
    institution: string | null;
    accountType: string | null;
    currency: string | null;
    balance: string | null;
    linkedAccountIds: Set<string>;
    rows: RepairGroupRow[];
  };
  const groups = new Map<string, RepairGroup>();

  for (const row of repairRows) {
    const accountNumber =
      normalizeImportAccountNumber(row.accountNumber) ??
      normalizeImportAccountNumber(readImportedJsonText(row.rawPayload, "accountNumber"));
    if (!accountNumber) {
      continue;
    }

    const importFile = importEvidenceById.get(row.importFileId);
    const parsedInstitution = normalizeImportInstitution(row.institution ?? readImportedJsonText(row.rawPayload, "institution"));
    const product = inferCanonicalImportedAccountProduct({
      fileName: importFile?.fileName,
      name: row.accountName?.trim() || readImportedJsonText(row.rawPayload, "accountName"),
      institution: parsedInstitution,
      type: readImportedAccountType(row.rawPayload),
    });
    const institution = product?.institution ?? parsedInstitution;
    const accountType = product?.type ?? readImportedAccountType(row.rawPayload) ?? "bank";
    const parsedAccountName =
      product?.name ?? (row.accountName?.trim() || readImportedJsonText(row.rawPayload, "accountName"));
    const key = buildUploadedAccountDedupeKey({
      name: parsedAccountName,
      institution: institution || null,
      accountNumber,
      type: accountType,
      currency: row.currency?.trim().toUpperCase() || null,
    });
    if (!key) {
      continue;
    }
    const group: RepairGroup =
      groups.get(key) ??
        {
          accountNumber,
          accountName: parsedAccountName,
          institution: institution || null,
          accountType,
          currency: row.currency?.trim().toUpperCase() || null,
          balance: null,
          linkedAccountIds: new Set<string>(),
          rows: [],
        };
    const runningBalance = readImportedRunningBalance(row.rawPayload);
    if (group.balance === null && runningBalance !== null) {
      group.balance = runningBalance.toFixed(2);
    }
    if (importFile?.accountId) {
      group.linkedAccountIds.add(importFile.accountId);
    }
    group.rows.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const accountType =
      (group.accountType && isSupportedAccountType(group.accountType) ? group.accountType : null) ?? "bank";
    const groupIdentityKey = buildUploadedAccountDedupeKey({
      name: group.accountName,
      institution: group.institution,
      accountNumber: group.accountNumber,
      type: accountType,
      currency: group.currency,
    });
    const groupLastFourIdentityKey = buildUploadedAccountLastFourDedupeKey({
      name: group.accountName,
      institution: group.institution,
      accountNumber: group.accountNumber,
      type: accountType,
      currency: group.currency,
    });
    const linkedAccount = Array.from(group.linkedAccountIds)
      .map((accountId) => existingAccounts.find((candidate) => candidate.id === accountId) ?? null)
      .find((candidate) => candidate?.source === "upload") ?? null;
    let account =
      linkedAccount ??
      (groupIdentityKey ? accountByIdentity.get(groupIdentityKey) ?? null : null) ??
      (groupLastFourIdentityKey ? accountByLastFourIdentity.get(groupLastFourIdentityKey) ?? null : null) ??
      null;
    const resolvedInstitution = resolveUploadedAccountInstitution(account?.institution ?? null, null, group.institution);
    const accountName = formatUploadAccountDisplayName(
      group.accountName ?? group.institution ?? "Imported account",
      resolvedInstitution ?? group.institution,
      group.accountNumber,
      accountType
    );
    const currency = normalizeInstitutionCurrency(resolvedInstitution ?? group.institution, group.currency, accountName) ?? group.currency ?? "PHP";
    if (!account) {
      account = await prisma.account.create({
        data: {
          workspaceId,
          name: accountName,
          institution: resolvedInstitution ?? group.institution,
          accountNumber: group.accountNumber,
          type: accountType,
          currency,
          source: "upload",
          ...(group.balance !== null && !linkedAccount ? { balance: group.balance } : {}),
        },
        select: {
          id: true,
          name: true,
          institution: true,
          accountNumber: true,
          type: true,
          currency: true,
          source: true,
          balance: true,
          createdAt: true,
        },
      });
      if (groupIdentityKey) {
        accountByIdentity.set(groupIdentityKey, account);
      }
      if (groupLastFourIdentityKey) {
        accountByLastFourIdentity.set(groupLastFourIdentityKey, account);
      }
    } else if (
      account.accountNumber &&
      normalizeImportAccountNumber(account.accountNumber) === normalizeImportAccountNumber(group.accountNumber)
    ) {
      await prisma.account.update({
        where: { id: account.id },
        data: {
          name: accountName,
          institution: resolvedInstitution ?? group.institution,
          type: accountType,
          currency,
          source: "upload",
          ...(group.balance !== null && !linkedAccount ? { balance: group.balance } : {}),
        },
      }).catch(() => null);
    }

    const importRows = group.rows
      .map((row) => ({
        importFileId: row.importFileId,
        sourceRowIndex: readImportedSourceRowIndex(row.rawPayload),
      }))
      .filter((row): row is { importFileId: string; sourceRowIndex: number } => Boolean(row.importFileId && row.sourceRowIndex !== null));
    const sourceRowsByImport = new Map<string, Set<string>>();
    for (const row of importRows) {
      const sourceRows = sourceRowsByImport.get(row.importFileId) ?? new Set<string>();
      sourceRows.add(String(row.sourceRowIndex));
      sourceRowsByImport.set(row.importFileId, sourceRows);
    }
    for (const [importFileId, sourceRows] of sourceRowsByImport) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "Transaction"
        SET "accountId" = ${account.id}, "updatedAt" = NOW()
        WHERE "workspaceId" = ${workspaceId}
          AND "importFileId" = ${importFileId}
          AND "deletedAt" IS NULL
          AND "accountId" IS DISTINCT FROM ${account.id}
          AND ("rawPayload" #>> '{sourceRowIndex}') IN (${Prisma.join(Array.from(sourceRows))})
      `).catch(() => null);
    }
  }

  const numberedInstitutionCurrencies = new Set(
    Array.from(groups.values())
      .map((group) => importedAccountInstitutionCurrencyKey({
        institution: group.institution,
        accountNumber: group.accountNumber,
        currency: group.currency,
      }))
      .filter(Boolean)
  );
  const genericPlaceholderIds = existingAccounts
    .filter((account) => {
      const institutionCurrencyKey = importedAccountInstitutionCurrencyKey(account);
      return Boolean(institutionCurrencyKey && numberedInstitutionCurrencies.has(institutionCurrencyKey));
    })
    .filter(isGenericUploadedAccountForInstitution)
    .map((account) => account.id);
  if (genericPlaceholderIds.length === 0) {
    return;
  }

  const occupiedGenericAccounts = await prisma.account.findMany({
    where: {
      id: { in: genericPlaceholderIds },
      transactions: {
        some: {
          deletedAt: null,
        },
      },
    },
    select: { id: true },
  }).catch(() => []);
  const occupiedIds = new Set(occupiedGenericAccounts.map((account) => account.id));
  const deletableIds = genericPlaceholderIds.filter((id) => !occupiedIds.has(id));
  if (deletableIds.length > 0) {
    await prisma.account.deleteMany({
      where: {
        id: { in: deletableIds },
        source: "upload",
        accountNumber: null,
      },
    }).catch(() => null);
  }
};

const cleanupEmptyGenericUploadedAccountPlaceholders = async (workspaceId: string, compatibleColumns: Set<string>) => {
  if (!compatibleColumns.has("accountNumber")) {
    return;
  }

  const numberedUploadAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      accountNumber: { not: null },
    },
    select: {
      name: true,
      institution: true,
      accountNumber: true,
      currency: true,
    },
  }).catch(() => []);
  const institutionCurrenciesWithNumberedAccounts = new Set(
    new Set(
      numberedUploadAccounts
        .map((account) => importedAccountInstitutionCurrencyKey(account))
        .filter(Boolean)
    )
  );
  if (institutionCurrenciesWithNumberedAccounts.size === 0) {
    return;
  }

  const emptyPlaceholderAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      accountNumber: null,
      transactions: { none: {} },
    },
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      currency: true,
      source: true,
    },
  }).catch(() => []);
  const deletableIds = emptyPlaceholderAccounts
    .filter(isGenericUploadedAccountForInstitution)
    .filter((account) => {
      const institutionCurrencyKey = importedAccountInstitutionCurrencyKey(account);
      return Boolean(
        institutionCurrencyKey && institutionCurrenciesWithNumberedAccounts.has(institutionCurrencyKey)
      );
    })
    .map((account) => account.id);

  if (deletableIds.length > 0) {
    await prisma.account.deleteMany({
      where: {
        workspaceId,
        id: { in: deletableIds },
        source: "upload",
        accountNumber: null,
      },
    }).catch(() => null);
  }
};

const cleanupFilenameUploadedAccountPlaceholders = async (workspaceId: string) => {
  const candidateAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      accountNumber: null,
      transactions: { none: { deletedAt: null } },
    },
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      source: true,
      balance: true,
    },
  }).catch(() => []);

  if (candidateAccounts.length === 0) {
    return;
  }

  const checkpointAccountIds = new Set<string>();
  if (await hasCompatibleTable("AccountStatementCheckpoint")) {
    const checkpointRows = await prisma.accountStatementCheckpoint.findMany({
      where: {
        workspaceId,
        accountId: {
          in: candidateAccounts.map((account) => account.id),
        },
      },
      select: { accountId: true },
    }).catch(() => []);

    for (const row of checkpointRows) {
      if (typeof row.accountId === "string" && row.accountId.trim()) {
        checkpointAccountIds.add(row.accountId);
      }
    }
  }

  const deletableIds = candidateAccounts
    .filter((account) => looksLikeReceiptImageFilenameAccount(account) || looksLikeGenericImageFilenameAccount(account))
    .filter((account) => !checkpointAccountIds.has(account.id))
    .filter((account) => {
      const balanceText = account.balance?.toString().trim() ?? "";
      const numericBalance = balanceText ? Number(balanceText.replace(/[^0-9.-]/g, "")) : 0;
      return !balanceText || !Number.isFinite(numericBalance) || numericBalance === 0;
    })
    .map((account) => account.id);

  if (deletableIds.length === 0) {
    return;
  }

  await prisma.account.deleteMany({
    where: {
      workspaceId,
      id: { in: deletableIds },
      source: "upload",
    },
  }).catch(() => null);
};

const cleanupPdaxPortfolioBucketHoldings = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("InvestmentHolding")) || !(await hasCompatibleTable("InvestmentSnapshot"))) {
    return 0;
  }

  // Older backup-parser runs could convert PDAX overview buckets into
  // holdings. These are derived import artifacts, not user-confirmed assets.
  // Gold is a concrete PDAX real-world asset when the source exposes a Gold
  // balance. It used to be grouped with overview-only buckets here, which
  // removed the holding from institution details while its account continued
  // to contribute to the Accounts card total.
  const bucketNames = new Set(["php", "php wallet", "crypto", "crypto balance", "bonds"]);
  const bucketNameCandidates = ["PHP", "PHP wallet", "Crypto", "Crypto balance", "Bonds", ...Array.from(bucketNames)];
  const candidates = await prisma.investmentHolding.findMany({
    where: {
      workspaceId,
      assetName: { in: bucketNameCandidates },
    },
    select: {
      id: true,
      assetName: true,
      assetSymbol: true,
      quantity: true,
      rawPayload: true,
      investmentSnapshot: {
        select: {
          portfolioName: true,
        },
      },
    },
  }).catch(() => []);

  const staleIds = candidates
    .filter((holding) => /\bPDAX\b/i.test(holding.investmentSnapshot.portfolioName ?? ""))
    .filter((holding) => {
      const payload =
        holding.rawPayload && typeof holding.rawPayload === "object" && !Array.isArray(holding.rawPayload)
          ? (holding.rawPayload as Record<string, unknown>)
          : null;
      return payload?.source === "openai" && bucketNames.has(holding.assetName.trim().toLowerCase());
    })
    .map((holding) => holding.id);

  if (staleIds.length > 0) {
    await prisma.investmentHolding.deleteMany({
      where: { workspaceId, id: { in: staleIds } },
    }).catch(() => null);
  }

  return staleIds.length;
};

const repairGeneratedPdaxSnapshotHoldings = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("InvestmentHolding")) || !(await hasCompatibleTable("InvestmentSnapshot"))) {
    return 0;
  }

  const candidates = await prisma.investmentHolding.findMany({
    where: {
      workspaceId,
      OR: [
        { account: { institution: { equals: "PDAX", mode: "insensitive" } } },
        { documentImport: { institution: { equals: "PDAX", mode: "insensitive" } } },
        { investmentSnapshot: { account: { institution: { equals: "PDAX", mode: "insensitive" } } } },
        { investmentSnapshot: { documentImport: { institution: { equals: "PDAX", mode: "insensitive" } } } },
      ],
    },
    select: {
      id: true,
      investmentSnapshotId: true,
      assetName: true,
      assetSymbol: true,
      assetType: true,
      quantity: true,
      marketValue: true,
      currentValue: true,
      currency: true,
      status: true,
      confidence: true,
    },
  }).catch(() => []);

  const generated = candidates.filter((holding) => holding.status !== "confirmed");
  const walletHoldingIds = generated
    .filter((holding) =>
      isPdaxWalletHoldingLabel({
        ...holding,
        quantity: holding.quantity?.toString() ?? null,
        marketValue: holding.marketValue?.toString() ?? null,
        currentValue: holding.currentValue?.toString() ?? null,
      })
    )
    .map((holding) => holding.id);
  let repaired = 0;
  if (walletHoldingIds.length > 0) {
    const removed = await prisma.investmentHolding.deleteMany({
      where: {
        workspaceId,
        id: { in: walletHoldingIds },
        OR: [{ status: null }, { status: { not: "confirmed" } }],
      },
    }).catch(() => ({ count: 0 }));
    repaired += removed.count;
  }

  const aliasGroups = new Map<string, typeof generated>();
  for (const holding of generated) {
    if (walletHoldingIds.includes(holding.id)) {
      continue;
    }
    const identity = getCanonicalPdaxHoldingIdentity({
      ...holding,
      quantity: holding.quantity?.toString() ?? null,
      marketValue: holding.marketValue?.toString() ?? null,
      currentValue: holding.currentValue?.toString() ?? null,
    });
    if (identity.key !== "XRP") {
      continue;
    }
    const groupKey = `${holding.investmentSnapshotId}:${identity.key}`;
    const group = aliasGroups.get(groupKey) ?? [];
    group.push(holding);
    aliasGroups.set(groupKey, group);
  }

  for (const group of aliasGroups.values()) {
    const canonical = [...group].sort((left, right) => {
      const leftCanonical = Number(left.assetSymbol?.toUpperCase() === "XRP") + Number(left.assetName.toUpperCase() === "XRP");
      const rightCanonical = Number(right.assetSymbol?.toUpperCase() === "XRP") + Number(right.assetName.toUpperCase() === "XRP");
      return rightCanonical - leftCanonical || right.confidence - left.confidence;
    })[0];
    if (!canonical) {
      continue;
    }

    const strongestValue = [...group].sort((left, right) => {
      const leftValue = Number(left.currentValue ?? left.marketValue ?? 0);
      const rightValue = Number(right.currentValue ?? right.marketValue ?? 0);
      return rightValue - leftValue || right.confidence - left.confidence;
    })[0] ?? canonical;
    await prisma.investmentHolding.update({
      where: { id: canonical.id },
      data: {
        assetName: "XRP",
        assetSymbol: "XRP",
        assetType: "crypto",
        quantity: strongestValue.quantity,
        marketValue: strongestValue.marketValue,
        currentValue: strongestValue.currentValue,
        currency: strongestValue.currency,
      },
    }).catch(() => null);
    repaired += 1;

    const duplicateIds = group.filter((holding) => holding.id !== canonical.id).map((holding) => holding.id);
    if (duplicateIds.length > 0) {
      const removed = await prisma.investmentHolding.deleteMany({
        where: {
          workspaceId,
          id: { in: duplicateIds },
          OR: [{ status: null }, { status: { not: "confirmed" } }],
        },
      }).catch(() => ({ count: 0 }));
      repaired += removed.count;
    }
  }

  return repaired;
};

const repairGeneratedPdaxXrpAccountAliases = async (workspaceId: string) => {
  const candidates = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      institution: { equals: "PDAX", mode: "insensitive" },
      type: "investment",
      OR: [
        { investmentSymbol: { equals: "XRP", mode: "insensitive" } },
        { name: { in: ["XRP", "Ripple"], mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      investmentSymbol: true,
      investmentQuantity: true,
      balance: true,
      currency: true,
      createdAt: true,
      updatedAt: true,
    },
  }).catch(() => []);
  if (candidates.length <= 1) {
    return 0;
  }

  const numericSignature = (value: { toString(): string } | null | undefined) => {
    const parsed = Number(value?.toString() ?? "");
    return Number.isFinite(parsed) ? parsed.toString() : "";
  };
  const signatures = new Set(
    candidates.map((account) =>
      [
        numericSignature(account.investmentQuantity),
        numericSignature(account.balance),
        account.currency,
      ].join(":")
    )
  );
  if (signatures.size > 1) {
    return 0;
  }

  const canonical = [...candidates].sort((left, right) => {
    const leftCanonical = Number(left.investmentSymbol?.toUpperCase() === "XRP") + Number(left.name.toUpperCase() === "XRP");
    const rightCanonical = Number(right.investmentSymbol?.toUpperCase() === "XRP") + Number(right.name.toUpperCase() === "XRP");
    const rightTime = Math.max(right.updatedAt.getTime(), right.createdAt.getTime());
    const leftTime = Math.max(left.updatedAt.getTime(), left.createdAt.getTime());
    return rightCanonical - leftCanonical || rightTime - leftTime;
  })[0];
  if (!canonical) {
    return 0;
  }

  const duplicateIds = candidates.filter((account) => account.id !== canonical.id).map((account) => account.id);
  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: canonical.id },
      data: { name: "XRP", investmentSymbol: "XRP", investmentSubtype: "crypto" },
    });
    await tx.transaction.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.importFile.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.documentImport.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.accountStatementCheckpoint.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.financialCommitment.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.receiptDocument.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.investmentSnapshot.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.investmentHolding.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.investmentPurchase.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.investmentDividend.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.recurringPattern.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.accountRule.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.budget.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.circleInvestmentShare.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.account.deleteMany({ where: { id: { in: duplicateIds }, source: "upload", type: "investment" } });
  });

  return duplicateIds.length + 1;
};

const repairGeneratedPdaxPortfolioAssetLabels = async (workspaceId: string) => {
  // These are exact labels emitted by earlier deterministic PDAX screenshot
  // parsers. Repair only upload-created matches so a user-edited account is
  // never renamed or reclassified.
  const repairs = [
    { from: "PDAX BTC", to: "BTC", subtype: "crypto" },
    { from: "PDAX XRP", to: "XRP", subtype: "crypto" },
    { from: "PDAX Gold RWA", to: "Gold", subtype: "real_world_asset" },
    { from: "Wallet", to: "PDAX Wallet", subtype: null },
  ] as const;

  let repaired = 0;
  for (const repair of repairs) {
    const result = await prisma.account.updateMany({
      where: {
        workspaceId,
        source: "upload",
        institution: "PDAX",
        name: repair.from,
        ...(repair.subtype === null ? { type: "wallet" } : { type: "investment" }),
      },
      data: {
        name: repair.to,
        ...(repair.subtype === null ? {} : { investmentSubtype: repair.subtype }),
      },
    }).catch(() => ({ count: 0 }));
    repaired += result.count;
  }

  return repaired;
};

const repairDuplicatePdaxWalletAccounts = async (workspaceId: string) => {
  const candidates = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      institution: { equals: "PDAX", mode: "insensitive" },
      name: { in: ["Wallet", "PDAX Wallet"], mode: "insensitive" },
      investmentSymbol: null,
      investmentQuantity: null,
    },
    select: {
      id: true,
      type: true,
      balance: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          transactions: true,
          importFiles: true,
          documentImports: true,
          statementCheckpoints: true,
        },
      },
    },
  }).catch(() => []);
  if (candidates.length === 0) {
    return 0;
  }

  const canonical = [...candidates].sort((left, right) => {
    const leftWallet = Number(left.type === "wallet");
    const rightWallet = Number(right.type === "wallet");
    const leftEvidence = left._count.importFiles + left._count.documentImports + left._count.statementCheckpoints;
    const rightEvidence = right._count.importFiles + right._count.documentImports + right._count.statementCheckpoints;
    return rightWallet - leftWallet || rightEvidence - leftEvidence || left.createdAt.getTime() - right.createdAt.getTime();
  })[0];
  if (!canonical) {
    return 0;
  }

  const duplicateIds = candidates.filter((account) => account.id !== canonical.id).map((account) => account.id);
  const walletBalances = candidates
    .filter((account) => account.type === "wallet" && account.balance !== null)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  const walletBalance = walletBalances[0]?.balance?.toString() ?? canonical.balance?.toString() ?? null;

  await mergeUploadedAccountRecords({
    workspaceId,
    canonicalId: canonical.id,
    duplicateIds,
    canonicalData: {
      name: "PDAX Wallet",
      institution: "PDAX",
      type: "wallet",
      currency: "PHP",
      balance: walletBalance,
      investmentSubtype: null,
      investmentSymbol: null,
      investmentQuantity: null,
      investmentCostBasis: null,
      investmentPrincipal: null,
      investmentStartDate: null,
      investmentMaturityDate: null,
      investmentInterestRate: null,
      investmentMaturityValue: null,
    },
  });

  return duplicateIds.length + Number(canonical.type !== "wallet");
};

const repairCryptoDenominatedCashAccounts = async (workspaceId: string) => {
  const cashAccounts = await prisma.account.findMany({
    where: { workspaceId, type: "cash" },
    select: { id: true, name: true, institution: true, currency: true },
  }).catch(() => []);
  const malformed = cashAccounts.filter((account) => isCryptoAssetCurrencyCode(account.currency));
  let repaired = 0;

  for (const account of malformed) {
    const symbol = account.currency.trim().toUpperCase();
    const target = await prisma.account.findFirst({
      where: {
        workspaceId,
        type: "investment",
        OR: [
          { investmentSymbol: { equals: symbol, mode: "insensitive" } },
          { name: { equals: symbol, mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, institution: true, currency: true },
    }).catch(() => null);

    if (!target) {
      const sourceDocument = await prisma.documentImport.findFirst({
        where: { workspaceId, accountId: account.id, institution: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { institution: true },
      }).catch(() => null);
      const resolvedInstitution = account.institution === "Cash"
        ? sourceDocument?.institution ?? null
        : account.institution;
      const isPhilippinePlatform = /\b(?:PDAX|GCrypto|GCash)\b/i.test(`${resolvedInstitution ?? ""} ${account.name}`);
      const updated = await prisma.account.update({
        where: { id: account.id },
        data: {
          name: symbol,
          institution: resolvedInstitution,
          type: "investment",
          currency: isPhilippinePlatform ? "PHP" : "USD",
          investmentSubtype: "crypto",
          investmentSymbol: symbol,
        },
        select: { id: true },
      }).catch(() => null);
      repaired += Number(Boolean(updated));
      continue;
    }

    const merged = await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.importFile.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.documentImport.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.accountStatementCheckpoint.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.financialCommitment.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.receiptDocument.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.investmentSnapshot.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.investmentHolding.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.investmentPurchase.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.investmentDividend.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.recurringPattern.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.accountRule.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.budget.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.circleInvestmentShare.updateMany({ where: { accountId: account.id }, data: { accountId: target.id } });
      await tx.account.delete({ where: { id: account.id } });
      return true;
    }).catch((error) => {
      console.warn("[accounts] unable to merge crypto-denominated Cash account", {
        workspaceId,
        accountId: account.id,
        targetAccountId: target.id,
        error: summarizeErrorForLog(error),
      });
      return false;
    });
    repaired += Number(merged);
  }

  return repaired;
};

const repairPdaxPortfolioAccountsFromParsedRows = async (workspaceId: string) => {
  // Snapshot imports retain one deterministic raw row per visible PDAX group.
  // Earlier multi-account finalization leaked the portfolio type and final
  // balance across those groups; repair only upload-created exact matches.
  const parsedRows = await prisma.parsedTransaction.findMany({
    where: { workspaceId, institution: "PDAX" },
    select: { accountName: true, rawPayload: true },
  }).catch(() => []);
  const expectedAccounts = new Map<string, PdaxPortfolioAccount>();
  for (const row of parsedRows) {
    const payload =
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? (row.rawPayload as Record<string, unknown>)
        : null;
    if (!payload) {
      continue;
    }
    const expected = readPdaxPortfolioAccount(payload, { requireScreenshotSource: true });
    if (expected) {
      expectedAccounts.set(expected.name, expected);
    }
  }

  // Parsed rows are retained for normal imports. If an old cleanup already
  // removed a snapshot marker, the settled checkpoint still contains the
  // exact account summaries that were published at confirmation. Use that
  // durable evidence to restore the non-transactional Wallet as well.
  if (await hasCompatibleTable("AccountStatementCheckpoint")) {
    const checkpoints = await prisma.accountStatementCheckpoint.findMany({
      where: { workspaceId },
      select: { sourceMetadata: true },
    }).catch(() => []);
    for (const checkpoint of checkpoints) {
      const metadata =
        checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
          ? (checkpoint.sourceMetadata as Record<string, unknown>)
          : null;
      const summaries = Array.isArray(metadata?.publishedAccountSummaries) ? metadata.publishedAccountSummaries : [];
      for (const summary of summaries) {
        if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
          continue;
        }
        const expected = readPublishedPdaxPortfolioAccount(summary as Record<string, unknown>);
        if (expected && !expectedAccounts.has(expected.name)) {
          expectedAccounts.set(expected.name, expected);
        }
      }
    }
  }

  // ParsedTransaction rows can be replaced by an older retry or cleanup. The
  // extraction cache is the preserved, immutable parse result for that upload,
  // so it is the last safe source for restoring a missing snapshot account.
  // In particular, this restores PDAX's non-transactional PHP Wallet without
  // inventing a balance from the investment positions.
  const cachedParses = await prisma.importFileExtractionCache.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: "desc" },
    // Imports are intentionally retained as learning material. A portfolio
    // screenshot may predate many transaction statements, so a small recent
    // window can miss the only durable Wallet evidence.
    take: 500,
    select: { parsedRows: true },
  }).catch(() => []);
  for (const cachedParse of cachedParses) {
    const parsedRows = Array.isArray(cachedParse.parsedRows)
      ? cachedParse.parsedRows
      : cachedParse.parsedRows && typeof cachedParse.parsedRows === "object" && !Array.isArray(cachedParse.parsedRows)
        ? (cachedParse.parsedRows as Record<string, unknown>).rows
        : null;
    if (!Array.isArray(parsedRows)) {
      continue;
    }
    for (const row of parsedRows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        continue;
      }
      const parsedRow = row as Record<string, unknown>;
      const rawPayload =
        parsedRow.rawPayload && typeof parsedRow.rawPayload === "object" && !Array.isArray(parsedRow.rawPayload)
          ? (parsedRow.rawPayload as Record<string, unknown>)
          : parsedRow;
      const expected = readPdaxPortfolioAccount(
        {
          ...rawPayload,
          accountName: rawPayload.accountName ?? parsedRow.accountName,
          accountType: rawPayload.accountType ?? parsedRow.accountType,
          statementEndingBalance: rawPayload.statementEndingBalance ?? rawPayload.balance ?? parsedRow.balance,
        },
        { requireScreenshotSource: true }
      );
      if (expected && !expectedAccounts.has(expected.name)) {
        expectedAccounts.set(expected.name, expected);
      }
    }
  }

  let repaired = 0;
  for (const [name, expected] of expectedAccounts) {
    const existingAccount = await prisma.account.findFirst({
      where: {
        workspaceId,
        institution: "PDAX",
        ...(name === "Wallet"
          ? { type: "wallet", name: { in: ["Wallet", "PDAX Wallet"], mode: "insensitive" } }
          : { name }),
      },
      select: { id: true, source: true },
    }).catch(() => null);
    if (!existingAccount) {
      try {
        await prisma.account.create({
          data: {
            workspaceId,
            source: "upload",
            institution: "PDAX",
            name,
            type: expected.type,
            currency: "PHP",
            balance: expected.balance.toString(),
            ...(expected.type === "investment"
              ? {
                  investmentSubtype: expected.subtype,
                  investmentSymbol: expected.symbol,
                  investmentQuantity: expected.quantity === null ? null : expected.quantity.toString(),
                }
              : {}),
          },
        });
        repaired += 1;
      } catch (error) {
        console.warn("[accounts] unable to materialize PDAX portfolio account from preserved evidence", {
          workspaceId,
          name,
          type: expected.type,
          error: summarizeErrorForLog(error),
        });
      }
      continue;
    }
    if (existingAccount.source !== "upload") {
      continue;
    }
    const result = await prisma.account.updateMany({
      where: { id: existingAccount.id, workspaceId, source: "upload" },
      data: {
        type: expected.type,
        balance: expected.balance.toString(),
        ...(expected.type === "wallet"
          ? {
              investmentSubtype: null,
              investmentSymbol: null,
              investmentQuantity: null,
              investmentCostBasis: null,
              investmentPrincipal: null,
              investmentStartDate: null,
              investmentMaturityDate: null,
              investmentInterestRate: null,
              investmentMaturityValue: null,
            }
          : expected.subtype
            ? {
                investmentSubtype: expected.subtype,
                investmentSymbol: expected.symbol,
                investmentQuantity: expected.quantity === null ? null : expected.quantity.toString(),
              }
            : {}),
      },
    }).catch(() => ({ count: 0 }));
    repaired += result.count;
  }
  return repaired;
};

const refreshPdaxCryptoMarketValues = async (workspaceId: string) => {
  const positions = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      institution: "PDAX",
      type: "investment",
      investmentSymbol: { in: ["BTC", "XRP"] },
      investmentQuantity: { not: null },
    },
    select: { id: true, investmentSymbol: true, investmentQuantity: true },
  }).catch(() => []);
  if (positions.length === 0) {
    return 0;
  }

  const quotes = await getLiveCryptoPhpPrices(
    positions.map((position) => String(position.investmentSymbol ?? ""))
  );
  const updates: Prisma.PrismaPromise<unknown>[] = [];
  let refreshed = 0;
  for (const position of positions) {
    const symbol = String(position.investmentSymbol ?? "").trim().toUpperCase();
    const quantity = Number(position.investmentQuantity?.toString() ?? "");
    const unitPrice = quotes[symbol];
    if (!symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      continue;
    }

    const currentValue = Number((quantity * unitPrice).toFixed(2));
    // Publish every position from one quote set together. Updating BTC and XRP
    // in separate transactions lets Accounts render a transient mixed-price
    // portfolio that cannot match the institution page.
    updates.push(
      prisma.account.update({ where: { id: position.id }, data: { balance: currentValue.toString() } }),
      prisma.investmentHolding.updateMany({
        where: { workspaceId, accountId: position.id, assetSymbol: symbol },
        data: {
          unitPrice: unitPrice.toString(),
          currentValue: currentValue.toString(),
        },
      })
    );
    refreshed += 1;
  }

  if (updates.length === 0) {
    return 0;
  }

  try {
    await prisma.$transaction(updates);
  } catch (error) {
    console.warn("[accounts] unable to atomically refresh PDAX crypto market values", { workspaceId, error });
    return 0;
  }
  return refreshed;
};

const repairMalformedPdaxActionControlAccount = async (workspaceId: string) => {
  // A short-lived generic screenshot fallback could promote PDAX's four
  // portfolio action buttons into an investment account. The exact combined
  // label is impossible as a user-supplied financial account name, and these
  // rows are upload-created, so it is safe to repair without touching any
  // confirmed account.
  const actionControlLabel = /^(?:cash\s+in|cash\s+out|deposit|send)(?:\s+(?:cash\s+in|cash\s+out|deposit|send)){1,3}$/i;
  const candidates = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      accountNumber: null,
      type: "investment",
    },
    select: { id: true, name: true, institution: true },
  }).catch(() => []);
  const accountIds = candidates
    .filter((account) => actionControlLabel.test(account.name.trim()) || actionControlLabel.test((account.institution ?? "").trim()))
    .map((account) => account.id);

  if (accountIds.length === 0) {
    return 0;
  }

  // The generic snapshot holding is as invalid as the account label. Remove
  // it before converting the retained visible PHP balance into the PDAX wallet.
  await prisma.investmentHolding.deleteMany({
    where: { workspaceId, accountId: { in: accountIds } },
  }).catch(() => null);
  await prisma.investmentSnapshot.deleteMany({
    where: { workspaceId, accountId: { in: accountIds } },
  }).catch(() => null);
  const repaired = await prisma.account.updateMany({
    where: { workspaceId, id: { in: accountIds }, source: "upload" },
    data: {
      name: "Wallet",
      institution: "PDAX",
      type: "wallet",
      investmentSubtype: null,
      investmentSymbol: null,
      investmentQuantity: null,
      investmentCostBasis: null,
      investmentPrincipal: null,
      investmentStartDate: null,
      investmentMaturityDate: null,
      investmentInterestRate: null,
      investmentMaturityValue: null,
    },
  }).catch(() => ({ count: 0 }));

  return repaired.count;
};

const cleanupMalformedPdaxPortfolioOverviewAccount = async (workspaceId: string) => {
  // The fast screenshot fallback once promoted the literal overview heading
  // "Balances" into an investment account. It has no financial meaning. Only
  // remove upload-created, transactionless matches so user-confirmed accounts
  // and any financial history are never touched.
  const candidates = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      type: "investment",
      accountNumber: null,
      name: { equals: "Balances", mode: "insensitive" },
      transactions: { none: {} },
    },
    select: { id: true },
  }).catch(() => []);
  const accountIds = candidates.map((account) => account.id);
  if (accountIds.length === 0) {
    return 0;
  }

  await prisma.investmentHolding.deleteMany({ where: { workspaceId, accountId: { in: accountIds } } }).catch(() => null);
  await prisma.investmentSnapshot.deleteMany({ where: { workspaceId, accountId: { in: accountIds } } }).catch(() => null);
  const result = await prisma.account.deleteMany({
    where: { workspaceId, id: { in: accountIds }, source: "upload", type: "investment" },
  }).catch(() => ({ count: 0 }));
  return result.count;
};

const collapseDuplicateUploadedAccountsByIdentity = async (workspaceId: string, compatibleColumns: Set<string>) => {
  if (!compatibleColumns.has("accountNumber")) {
    return;
  }

  const uploadedAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      accountNumber: { not: null },
    },
    select: getCompatibleAccountSelect(compatibleColumns),
  }).catch(() => []);

  const groups = new Map<string, typeof uploadedAccounts>();
  for (const account of uploadedAccounts) {
    const key = buildUploadedAccountDedupeKey({
      name: account.name,
      institution: account.institution,
      accountNumber: account.accountNumber,
      type: account.type,
      currency: account.currency,
      source: account.source,
    });
    if (!key) {
      continue;
    }

    const current = groups.get(key) ?? [];
    current.push(account);
    groups.set(key, current);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) {
      continue;
    }

    const sortedGroup = [...group].sort((left, right) => {
      const rightTime = Math.max(right.updatedAt.getTime(), right.createdAt.getTime());
      const leftTime = Math.max(left.updatedAt.getTime(), left.createdAt.getTime());
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return right.id.localeCompare(left.id);
    });
    const canonical = sortedGroup[0];
    const canonicalBalance =
      sortedGroup.find((account) => account.balance !== null && account.balance !== undefined)?.balance?.toString() ?? null;
    const duplicateIds = sortedGroup.map((account) => account.id).filter((id) => id !== canonical.id);
    if (duplicateIds.length === 0) {
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (canonicalBalance !== null && canonical.balance?.toString() !== canonicalBalance) {
          await tx.account.update({
            where: { id: canonical.id },
            data: { balance: canonicalBalance },
          });
        }

        await tx.transaction.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.importFile.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.documentImport.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.accountStatementCheckpoint.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.financialCommitment.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.receiptDocument.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.investmentSnapshot.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.investmentHolding.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.recurringPattern.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.accountRule.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.account.deleteMany({ where: { id: { in: duplicateIds }, source: "upload" } });
      });
    } catch (error) {
      console.warn("[accounts] unable to collapse duplicate uploaded accounts", {
        workspaceId,
        accountNumber: canonical.accountNumber,
        institution: canonical.institution,
        canonicalAccountId: canonical.id,
        duplicateAccountIds: duplicateIds,
        error,
      });
    }
  }
};

const repairLegacyUploadedCardAccountSplits = async (workspaceId: string, compatibleColumns: Set<string>) => {
  if (!compatibleColumns.has("accountNumber")) {
    return;
  }

  const uploadedAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      accountNumber: { not: null },
    },
    select: getCompatibleAccountSelect(compatibleColumns),
  }).catch(() => []);
  if (uploadedAccounts.length <= 1) {
    return;
  }

  const groups = new Map<string, typeof uploadedAccounts>();
  for (const account of uploadedAccounts) {
    const key = buildUploadedAccountCrossTypeIdentityKey(account);
    if (!key) {
      continue;
    }

    const current = groups.get(key) ?? [];
    current.push(account);
    groups.set(key, current);
  }

  const cardLikeTypes = new Set(["credit_card", "line_of_credit", "prepaid"]);

  for (const group of groups.values()) {
    if (group.length <= 1) {
      continue;
    }

    const cardAccounts = group.filter((account) => cardLikeTypes.has(String(account.type ?? "").toLowerCase()));
    const bankAccounts = group.filter((account) => String(account.type ?? "").toLowerCase() === "bank");
    if (cardAccounts.length === 0 || bankAccounts.length === 0) {
      continue;
    }

    const sortedCardAccounts = [...cardAccounts].sort((left, right) => {
      const rightTime = Math.max(right.updatedAt.getTime(), right.createdAt.getTime());
      const leftTime = Math.max(left.updatedAt.getTime(), left.createdAt.getTime());
      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return right.id.localeCompare(left.id);
    });
    const canonical = sortedCardAccounts[0];
    const duplicateIds = bankAccounts.map((account) => account.id).filter((id) => id !== canonical.id);
    if (duplicateIds.length === 0) {
      continue;
    }

    const canonicalBalance =
      [...group]
        .sort((left, right) => {
          const rightTime = Math.max(right.updatedAt.getTime(), right.createdAt.getTime());
          const leftTime = Math.max(left.updatedAt.getTime(), left.createdAt.getTime());
          return rightTime - leftTime;
        })
        .find((account) => account.balance !== null && account.balance !== undefined)?.balance?.toString() ?? null;

    try {
      await prisma.$transaction(async (tx) => {
        if (canonicalBalance !== null && canonical.balance?.toString() !== canonicalBalance) {
          await tx.account.update({
            where: { id: canonical.id },
            data: {
              balance: canonicalBalance,
              type: canonical.type,
            },
          });
        }

        await tx.transaction.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.importFile.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.documentImport.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.accountStatementCheckpoint.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.financialCommitment.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.receiptDocument.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.investmentSnapshot.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.investmentHolding.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.recurringPattern.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.accountRule.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.account.deleteMany({ where: { id: { in: duplicateIds }, source: "upload", type: "bank" } });
      });
    } catch (error) {
      console.warn("[accounts] unable to repair legacy uploaded card account split", {
        workspaceId,
        canonicalAccountId: canonical.id,
        duplicateAccountIds: duplicateIds,
        accountNumber: canonical.accountNumber,
        institution: canonical.institution,
        error,
      });
    }
  }
};

const extractMayaSavingsAccountNumberFromText = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d{4}\s+\d{4}\s+\d{4})\s*$/)?.[1]?.replace(/\D/g, "") ?? null)
    .find((value): value is string => Boolean(value)) ?? null;

const repairLegacyUploadedMayaWiseAccountSplits = async (
  workspaceId: string,
  compatibleColumns: Set<string>
) => {
  if (!compatibleColumns.has("accountNumber")) {
    return 0;
  }

  const uploadedAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      OR: [
        { institution: { contains: "Maya", mode: "insensitive" } },
        { institution: { contains: "Wise", mode: "insensitive" } },
        { name: { contains: "Maya", mode: "insensitive" } },
        { name: { contains: "Wise", mode: "insensitive" } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      type: true,
      currency: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      importFiles: {
        select: { fileName: true, sourceFingerprint: true },
      },
      _count: {
        select: { importFiles: true, statementCheckpoints: true },
      },
    },
  }).catch(() => []);
  if (uploadedAccounts.length === 0) {
    return 0;
  }

  const mayaSavingsFingerprints = uploadedAccounts
    .flatMap((account) =>
      account.importFiles
        .filter((file) => /maya\s*savings/i.test(file.fileName))
        .map((file) => file.sourceFingerprint)
    )
    .filter((value): value is string => Boolean(value));
  const mayaSavingsCaches = mayaSavingsFingerprints.length > 0
    ? await prisma.importFileExtractionCache.findMany({
        where: { workspaceId, fileFingerprint: { in: mayaSavingsFingerprints } },
        select: { fileFingerprint: true, extractedText: true },
      }).catch(() => [])
    : [];
  const extractedAccountNumberByFingerprint = new Map(
    mayaSavingsCaches
      .map((cache) => [cache.fileFingerprint, extractMayaSavingsAccountNumberFromText(cache.extractedText)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  );

  let repairedCount = 0;
  for (const canonical of uploadedAccounts.filter((account) => account._count.importFiles > 0)) {
    const productEvidence = canonical.importFiles
      .map((file) => inferCanonicalImportedAccountProduct({ ...canonical, fileName: file.fileName }))
      .find(Boolean) ?? inferCanonicalImportedAccountProduct(canonical);
    if (!productEvidence) {
      continue;
    }

    const originalDigits = normalizeImportAccountNumber(canonical.accountNumber);
    const correctedMayaSavingsNumber =
      productEvidence.name === "Maya Savings"
        ? canonical.importFiles
            .map((file) => file.sourceFingerprint ? extractedAccountNumberByFingerprint.get(file.sourceFingerprint) ?? null : null)
            .find((value): value is string => Boolean(value)) ?? null
        : null;
    const canonicalDigits = correctedMayaSavingsNumber ?? originalDigits;
    const duplicateIds = uploadedAccounts
      .filter((candidate) => candidate.id !== canonical.id)
      .filter((candidate) => candidate._count.importFiles === 0 && candidate._count.statementCheckpoints === 0)
      .filter((candidate) => {
        const candidateIdentity = `${candidate.institution ?? ""} ${candidate.name ?? ""}`;
        const isSameProduct = productEvidence.institution === "Wise"
          ? /\bwise\b/i.test(candidateIdentity)
          : /\bmaya\b/i.test(candidateIdentity);
        const candidateDigits = normalizeImportAccountNumber(candidate.accountNumber);
        const sameCurrency = normalizeImportedCurrencyCode(candidate.currency) === normalizeImportedCurrencyCode(canonical.currency);
        return Boolean(isSameProduct && sameCurrency && originalDigits && candidateDigits === originalDigits);
      })
      .map((candidate) => candidate.id);

    const canonicalName = correctedMayaSavingsNumber
      ? `${productEvidence.name} ${correctedMayaSavingsNumber.slice(-4)}`
      : formatUploadAccountDisplayName(
          productEvidence.name,
          productEvidence.institution,
          canonicalDigits,
          productEvidence.type
        );
    const needsIdentityUpdate =
      canonical.type !== productEvidence.type ||
      canonical.institution !== productEvidence.institution ||
      canonical.name !== canonicalName ||
      (correctedMayaSavingsNumber !== null && originalDigits !== correctedMayaSavingsNumber);
    if (!needsIdentityUpdate && duplicateIds.length === 0) {
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: canonical.id },
          data: {
            type: productEvidence.type,
            institution: productEvidence.institution,
            name: canonicalName,
            ...(correctedMayaSavingsNumber ? { accountNumber: correctedMayaSavingsNumber } : {}),
          },
        });
        if (duplicateIds.length === 0) {
          return;
        }

        await tx.transaction.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.importFile.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.documentImport.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.accountStatementCheckpoint.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.financialCommitment.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.receiptDocument.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.investmentSnapshot.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.investmentHolding.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.investmentPurchase.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.investmentDividend.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.recurringPattern.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.accountRule.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
        await tx.account.deleteMany({ where: { id: { in: duplicateIds }, source: "upload" } });
      });
      repairedCount += 1 + duplicateIds.length;
    } catch (error) {
      console.warn("[accounts] unable to repair legacy Maya/Wise account split", {
        workspaceId,
        canonicalAccountId: canonical.id,
        duplicateAccountIds: duplicateIds,
        error,
      });
    }
  }

  return repairedCount;
};

const mergeUploadedAccountRecords = async (params: {
  workspaceId: string;
  canonicalId: string;
  duplicateIds: string[];
  canonicalData: Prisma.AccountUpdateInput;
}) => {
  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: params.canonicalId }, data: params.canonicalData });
    if (params.duplicateIds.length === 0) {
      return;
    }

    const duplicateFilter = { accountId: { in: params.duplicateIds } };
    const canonicalAccount = { accountId: params.canonicalId };
    await tx.transaction.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.importFile.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.documentImport.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.accountStatementCheckpoint.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.financialCommitment.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.receiptDocument.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.investmentSnapshot.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.investmentHolding.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.investmentPurchase.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.investmentDividend.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.recurringPattern.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.accountRule.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.budget.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.circleInvestmentShare.updateMany({ where: duplicateFilter, data: canonicalAccount });
    await tx.account.deleteMany({
      where: { id: { in: params.duplicateIds }, workspaceId: params.workspaceId, source: "upload" },
    });
  });
};

const repairLegacyMisclassifiedGotradeAccounts = async (workspaceId: string) => {
  const candidates = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      currency: "USD",
      OR: [
        { institution: { equals: "GSave", mode: "insensitive" } },
        { name: { equals: "GSave", mode: "insensitive" } },
        { name: { equals: "Dividends", mode: "insensitive" } },
        { name: { equals: "GoTrade Activity", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      transactions: {
        where: { deletedAt: null },
        select: { merchantClean: true, description: true },
      },
      investmentHoldings: { select: { assetType: true } },
      investmentSnapshots: {
        orderBy: [{ snapshotDate: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          totalValue: true,
          documentImport: {
            select: {
              institution: true,
              accountName: true,
              accountNumber: true,
            },
          },
          holdings: {
            select: {
              assetName: true,
              assetType: true,
            },
          },
        },
      },
      importFiles: {
        select: {
          id: true,
          parsedRows: {
            select: { accountNumber: true, accountName: true, rawPayload: true },
          },
        },
      },
    },
  }).catch(() => []);

  let repairedCount = 0;
  for (const account of candidates) {
    const activityCount = account.transactions.filter((transaction) =>
      /^(?:buy|sell)\s+[a-z][a-z0-9.]{0,9}\b|(?:dividend|withholding tax)\b/i.test(
        transaction.merchantClean ?? transaction.description ?? ""
      )
    ).length;
    const hasStockHoldings = account.investmentHoldings.some(
      (holding) => holding.assetType?.trim().toLowerCase() === "stock"
    );
    const isPreviouslyCorrectedGotradeAccount = account.investmentSnapshots.some((snapshot) =>
      snapshot.holdings.some((holding) => holding.assetType?.trim().toLowerCase() === "stock")
    );
    if (!hasStockHoldings && activityCount < 2 && !isPreviouslyCorrectedGotradeAccount) {
      continue;
    }

    const realGsaveAccounts = await prisma.account.findMany({
      where: {
        workspaceId,
        id: { not: account.id },
        currency: "PHP",
        OR: [
          { institution: { equals: "GSave", mode: "insensitive" } },
          { name: { contains: "GSave", mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, accountNumber: true, type: true },
    });
    const gsaveTargetBySnapshotId = new Map<string, string | null>();
    for (const snapshot of account.investmentSnapshots) {
      const snapshotEvidence = [
        snapshot.documentImport?.institution,
        snapshot.documentImport?.accountName,
        ...snapshot.holdings.flatMap((holding) => [holding.assetName, holding.assetType]),
      ]
        .filter(Boolean)
        .join(" ");
      if (!/\b(?:GSave|UNOready|UNOboost|UNO\s+Digital\s+Bank|time\s+deposit)\b/i.test(snapshotEvidence)) {
        continue;
      }

      const snapshotAccountNumber = normalizeImportAccountNumber(snapshot.documentImport?.accountNumber);
      const target =
        realGsaveAccounts.find(
          (candidate) =>
            snapshotAccountNumber && normalizeImportAccountNumber(candidate.accountNumber) === snapshotAccountNumber
        ) ??
        realGsaveAccounts.find((candidate) => {
          const candidateEvidence = `${candidate.name} ${candidate.type}`;
          return /UNOboost|time deposit/i.test(snapshotEvidence)
            ? /UNOboost/i.test(candidateEvidence) || candidate.type === "investment"
            : !/UNOboost/i.test(candidateEvidence);
        }) ??
        null;
      gsaveTargetBySnapshotId.set(snapshot.id, target?.id ?? null);
    }
    for (const file of account.importFiles) {
      const gsaveRow = file.parsedRows.find((row) => {
        const provider = readImportedJsonText(row.rawPayload, "providerInstitution");
        return /UNO(?:\s+Digital\s+Bank)?/i.test(provider ?? "") || /^GSave\s+#/i.test(row.accountName ?? "");
      });
      if (!gsaveRow) {
        continue;
      }
      const rowAccountNumber = normalizeImportAccountNumber(gsaveRow.accountNumber);
      const target = realGsaveAccounts.find(
        (candidate) => normalizeImportAccountNumber(candidate.accountNumber) === rowAccountNumber
      );
      await prisma.importFile.update({
        where: { id: file.id },
        data: { accountId: target?.id ?? null },
      });
    }

    const gotradeSnapshots = account.investmentSnapshots.filter(
      (snapshot) => !gsaveTargetBySnapshotId.has(snapshot.id)
    );
    const latestPortfolioValue = gotradeSnapshots.find(
      (snapshot) => snapshot.totalValue !== null
    )?.totalValue;
    await prisma.$transaction(async (tx) => {
      for (const [snapshotId, targetAccountId] of gsaveTargetBySnapshotId) {
        await tx.investmentSnapshot.update({
          where: { id: snapshotId },
          data: { accountId: targetAccountId, currency: "PHP" },
        });
        await tx.investmentHolding.updateMany({
          where: { workspaceId, investmentSnapshotId: snapshotId },
          data: { accountId: targetAccountId, currency: "PHP" },
        });
      }

      await tx.account.update({
        where: { id: account.id },
        data: {
          name: "GoTrade",
          institution: "GoTrade",
          type: "investment",
          currency: "USD",
          balance: latestPortfolioValue?.toString() ?? "0",
        },
      });
      await tx.investmentSnapshot.updateMany({
        where: {
          workspaceId,
          accountId: account.id,
          ...(gotradeSnapshots.length > 0 ? { id: { in: gotradeSnapshots.map((snapshot) => snapshot.id) } } : {}),
        },
        data: { currency: "USD" },
      });
      await tx.investmentHolding.updateMany({
        where: {
          workspaceId,
          investmentSnapshot: { accountId: account.id },
          assetType: { equals: "stock", mode: "insensitive" },
        },
        data: { accountId: account.id, currency: "USD" },
      });
    });
    repairedCount += 1;
  }

  return repairedCount;
};

const repairLegacyUploadedGsaveUnoIdentities = async (workspaceId: string) => {
  const uploadedAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      OR: [
        { institution: { contains: "GSave", mode: "insensitive" } },
        { institution: { contains: "UNO", mode: "insensitive" } },
        { name: { contains: "GSave", mode: "insensitive" } },
        { name: { contains: "UNOready", mode: "insensitive" } },
        { name: { contains: "UNOboost", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      type: true,
      currency: true,
      balance: true,
      source: true,
      createdAt: true,
      updatedAt: true,
      importFiles: { select: { fileName: true } },
      _count: { select: { transactions: true, importFiles: true, statementCheckpoints: true } },
    },
  }).catch(() => []);

  const gsaveAccountIds = uploadedAccounts
    .filter((account) => /\bGSave\b/i.test(`${account.institution ?? ""} ${account.name}`))
    .map((account) => account.id);
  let repairedCount = 0;
  if (gsaveAccountIds.length > 0) {
    const normalized = await prisma.account.updateMany({
      where: { workspaceId, id: { in: gsaveAccountIds }, currency: { not: "PHP" } },
      data: { currency: "PHP" },
    }).catch(() => ({ count: 0 }));
    repairedCount += normalized.count;
    await Promise.all([
      prisma.investmentSnapshot.updateMany({
        where: { workspaceId, accountId: { in: gsaveAccountIds }, currency: { not: "PHP" } },
        data: { currency: "PHP" },
      }),
      prisma.investmentHolding.updateMany({
        where: {
          workspaceId,
          currency: { not: "PHP" },
          OR: [
            { accountId: { in: gsaveAccountIds } },
            { investmentSnapshot: { accountId: { in: gsaveAccountIds } } },
          ],
        },
        data: { currency: "PHP" },
      }),
    ]).catch(() => null);
  }
  const canonicalIdentityByAccountId = new Map<
    string,
    { name: string; type: "bank" | "investment"; accountNumber: string | null }
  >();
  for (const account of uploadedAccounts) {
    const productEvidence = account.importFiles
      .map((file) => inferCanonicalImportedAccountProduct({ ...account, fileName: file.fileName }))
      .find(Boolean) ?? inferCanonicalImportedAccountProduct(account);
    if (!productEvidence || productEvidence.institution !== "GSave") {
      continue;
    }

    const accountDigits = normalizeImportAccountNumber(account.accountNumber);
    const canonicalName = formatUploadAccountDisplayName(
      productEvidence.name,
      productEvidence.institution,
      accountDigits,
      productEvidence.type
    );
    canonicalIdentityByAccountId.set(account.id, {
      name: canonicalName,
      type: productEvidence.type as "bank" | "investment",
      accountNumber: accountDigits,
    });
    await Promise.all([
      prisma.investmentSnapshot.updateMany({
        where: { workspaceId, accountId: account.id, currency: { not: "PHP" } },
        data: { currency: "PHP" },
      }),
      prisma.investmentHolding.updateMany({
        where: {
          workspaceId,
          currency: { not: "PHP" },
          OR: [
            { accountId: account.id },
            { investmentSnapshot: { accountId: account.id } },
          ],
        },
        data: { currency: "PHP" },
      }),
    ]);
    if (
      account.type === productEvidence.type &&
      account.institution === productEvidence.institution &&
      account.name === canonicalName &&
      normalizeImportedCurrencyCode(account.currency) === "PHP"
    ) {
      continue;
    }

    await prisma.account.update({
      where: { id: account.id },
      data: {
        type: productEvidence.type,
        institution: productEvidence.institution,
        name: canonicalName,
        currency: "PHP",
      },
    });
    repairedCount += 1;
  }

  const groups = new Map<string, typeof uploadedAccounts>();
  for (const account of uploadedAccounts) {
    const identity = canonicalIdentityByAccountId.get(account.id);
    if (!identity) {
      continue;
    }
    const key = [identity.name.toLowerCase(), identity.type, identity.accountNumber ?? "no-number"].join("|");
    groups.set(key, [...(groups.get(key) ?? []), account]);
  }

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }
    const sorted = [...group].sort((left, right) => {
      const rightEvidence = right._count.transactions + right._count.importFiles + right._count.statementCheckpoints;
      const leftEvidence = left._count.transactions + left._count.importFiles + left._count.statementCheckpoints;
      return rightEvidence - leftEvidence || right.updatedAt.getTime() - left.updatedAt.getTime();
    });
    const canonical = sorted[0];
    const duplicateIds = sorted.slice(1).map((account) => account.id);
    const freshestBalance = [...sorted]
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .find((account) => account.balance !== null)?.balance?.toString() ?? null;

    await mergeUploadedAccountRecords({
      workspaceId,
      canonicalId: canonical.id,
      duplicateIds,
      canonicalData: {
        name: canonicalIdentityByAccountId.get(canonical.id)?.name ?? canonical.name,
        institution: "GSave",
        type: canonicalIdentityByAccountId.get(canonical.id)?.type ?? canonical.type,
        currency: "PHP",
        ...(freshestBalance !== null ? { balance: freshestBalance } : {}),
      },
    });
    repairedCount += duplicateIds.length;
  }

  return repairedCount;
};

const repairIncompleteGsaveTimeDeposits = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("ParsedTransaction"))) {
    return 0;
  }

  const [accounts, parsedRows] = await Promise.all([
    prisma.account.findMany({
      where: {
        workspaceId,
        source: "upload",
        type: "investment",
        OR: [
          { institution: { equals: "GSave", mode: "insensitive" } },
          { name: { contains: "UNOboost", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        institution: true,
        accountNumber: true,
        balance: true,
        investmentSubtype: true,
        investmentPrincipal: true,
        investmentInterestRate: true,
        investmentMaturityValue: true,
        investmentMaturityDate: true,
      },
    }),
    prisma.parsedTransaction.findMany({
      where: {
        workspaceId,
        OR: [
          { institution: { equals: "GSave", mode: "insensitive" } },
          { accountName: { contains: "UNOboost", mode: "insensitive" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        accountName: true,
        accountNumber: true,
        rawPayload: true,
      },
    }),
  ]);

  const evidence = parsedRows.flatMap((row) => {
    const payload =
      row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
        ? (row.rawPayload as Record<string, unknown>)
        : null;
    if (
      !payload ||
      payload.kind !== "account_snapshot_marker" ||
      !/unoboost|time deposit/i.test(
        [row.accountName, payload.accountName, payload.providerProduct, payload.accountLabel]
          .filter(Boolean)
          .join(" ")
      )
    ) {
      return [];
    }

    const principal = readImportedJsonNumber(
      payload.depositAmount ?? payload.statementEndingBalance ?? payload.balance
    );
    if (principal === null || principal <= 0) {
      return [];
    }

    const interestRateText = typeof payload.interestRate === "string" ? payload.interestRate : null;
    const interestRate = interestRateText
      ? readImportedJsonNumber(interestRateText.replace(/[^0-9.]/g, ""))
      : null;
    const maturityDateText = typeof payload.maturityDate === "string" ? payload.maturityDate : null;
    const maturityDate = maturityDateText ? new Date(maturityDateText) : null;

    return [{
      accountName: row.accountName ?? readImportedJsonText(payload, "accountName"),
      accountNumber:
        normalizeImportAccountNumber(row.accountNumber) ??
        normalizeImportAccountNumber(readImportedJsonText(payload, "accountNumber")),
      principal,
      interestRate,
      maturityValue: readImportedJsonNumber(payload.maturityAmount),
      maturityDate: maturityDate && !Number.isNaN(maturityDate.getTime()) ? maturityDate : null,
    }];
  });

  let repairedCount = 0;
  for (const account of accounts) {
    // Complete time deposits may legitimately be set to zero later by the
    // user. Only repair records that never received their import metadata.
    if (account.investmentSubtype === "time_deposit" && account.investmentPrincipal !== null) {
      continue;
    }

    const accountNumber = normalizeImportAccountNumber(account.accountNumber);
    const accountName = normalizeImportInstitution(account.name).toLowerCase();
    const match = evidence.find((candidate) => {
      if (importAccountNumbersMayMatch(accountNumber, candidate.accountNumber)) {
        return true;
      }
      const candidateName = normalizeImportInstitution(candidate.accountName).toLowerCase();
      return Boolean(candidateName && candidateName === accountName);
    });
    if (!match) {
      continue;
    }

    const currentBalance = readImportedJsonNumber(account.balance?.toString() ?? null);
    await prisma.account.update({
      where: { id: account.id },
      data: {
        institution: "GSave",
        investmentSubtype: "time_deposit",
        ...(accountNumber && match.accountNumber && accountNumber.length < match.accountNumber.length
          ? { accountNumber: match.accountNumber }
          : {}),
        ...(currentBalance === null || currentBalance === 0 ? { balance: match.principal.toString() } : {}),
        ...(account.investmentPrincipal === null ? { investmentPrincipal: match.principal.toString() } : {}),
        ...(account.investmentInterestRate === null && match.interestRate !== null
          ? { investmentInterestRate: match.interestRate.toString() }
          : {}),
        ...(account.investmentMaturityValue === null && match.maturityValue !== null
          ? { investmentMaturityValue: match.maturityValue.toString() }
          : {}),
        ...(account.investmentMaturityDate === null && match.maturityDate
          ? { investmentMaturityDate: match.maturityDate }
          : {}),
      },
    });
    repairedCount += 1;
  }

  return repairedCount;
};

const repairExplicitlyMislinkedGsaveSnapshots = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("InvestmentSnapshot")) || !(await hasCompatibleTable("InvestmentHolding"))) {
    return 0;
  }

  const snapshots = await prisma.investmentSnapshot.findMany({
    where: {
      workspaceId,
      account: { institution: { equals: "GSave", mode: "insensitive" } },
      documentImport: {
        institution: { not: null },
      },
      holdings: { some: {} },
    },
    select: {
      id: true,
      documentImport: { select: { institution: true } },
    },
  }).catch(() => []);

  let repairedCount = 0;
  for (const snapshot of snapshots) {
    const sourceInstitution = normalizeImportInstitution(snapshot.documentImport?.institution);
    if (!sourceInstitution || sourceInstitution.toLowerCase() === "gsave") {
      continue;
    }
    const target = await prisma.account.findFirst({
      where: {
        workspaceId,
        type: "investment",
        institution: { equals: sourceInstitution, mode: "insensitive" },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (!target) {
      continue;
    }

    await prisma.$transaction([
      prisma.investmentSnapshot.update({
        where: { id: snapshot.id },
        data: { accountId: target.id },
      }),
      prisma.investmentHolding.updateMany({
        where: { workspaceId, investmentSnapshotId: snapshot.id },
        data: { accountId: target.id },
      }),
    ]);
    repairedCount += 1;
  }

  return repairedCount;
};

const repairLegacyWiseWalletDuplicates = async (workspaceId: string) => {
  const accounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      OR: [
        { institution: { equals: "Wise", mode: "insensitive" } },
        { name: { equals: "Wise", mode: "insensitive" } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      institution: true,
      accountNumber: true,
      type: true,
      currency: true,
      balance: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { transactions: true, importFiles: true, statementCheckpoints: true } },
    },
  }).catch(() => []);

  const groups = new Map<string, typeof accounts>();
  for (const account of accounts) {
    // Wise exposes different local account details for the same currency wallet.
    // Clover models that as one wallet per currency, not one card per trailing identifier.
    const key = normalizeImportedCurrencyCode(account.currency) ?? "PHP";
    groups.set(key, [...(groups.get(key) ?? []), account]);
  }

  let repairedCount = 0;
  for (const group of groups.values()) {
    const sorted = [...group].sort((left, right) => {
      const rightEvidence = right._count.transactions + right._count.importFiles + right._count.statementCheckpoints;
      const leftEvidence = left._count.transactions + left._count.importFiles + left._count.statementCheckpoints;
      return rightEvidence - leftEvidence || right.updatedAt.getTime() - left.updatedAt.getTime();
    });
    const canonical = sorted[0];
    if (!canonical) {
      continue;
    }
    const duplicateIds = sorted.slice(1).map((account) => account.id);
    const freshestBalance = [...sorted]
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .find((account) => account.balance !== null)?.balance?.toString() ?? null;

    await mergeUploadedAccountRecords({
      workspaceId,
      canonicalId: canonical.id,
      duplicateIds,
      canonicalData: {
        name: "Wise",
        institution: "Wise",
        type: "wallet",
        currency: normalizeImportedCurrencyCode(canonical.currency) ?? "PHP",
        ...(freshestBalance !== null ? { balance: freshestBalance } : {}),
      },
    });
    repairedCount += duplicateIds.length;
  }

  return repairedCount;
};

const repairLegacyGotradeActivityImports = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("ParsedTransaction"))) {
    return 0;
  }

  const imports = await prisma.importFile.findMany({
    where: {
      workspaceId,
      status: "done",
      parsedRows: {
        some: {
          OR: [
            { institution: { equals: "GoTrade", mode: "insensitive" } },
            { rawPayload: { path: ["providerInstitution"], equals: "GoTrade" } },
          ],
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      confirmedTransactionsCount: true,
      _count: { select: { transactions: true } },
      parsedRows: {
        select: { rawPayload: true },
      },
    },
  }).catch(() => []);

  const incompleteImports = imports.filter((entry) => {
    const visibleRows = entry.parsedRows.filter((row) => {
      const payload =
        row.rawPayload && typeof row.rawPayload === "object" && !Array.isArray(row.rawPayload)
          ? (row.rawPayload as Record<string, unknown>)
          : null;
      return payload?.kind === "gotrade_trade_transaction" || payload?.kind === "gotrade_dividend_transaction";
    }).length;
    return visibleRows > 0 && entry._count.transactions < visibleRows && entry.confirmedTransactionsCount < visibleRows;
  });
  if (incompleteImports.length === 0) {
    return 0;
  }

  const { confirmImportFile } = await import("@/workers/import-processor");
  let repairedCount = 0;
  for (const entry of incompleteImports) {
    try {
      await confirmImportFile(entry.id, null);
      repairedCount += 1;
    } catch (error) {
      console.warn("[accounts] unable to recover preserved GoTrade activity", {
        workspaceId,
        importFileId: entry.id,
        error: summarizeErrorForLog(error),
      });
    }
  }

  return repairedCount;
};

const repairLegacyUploadedPayPalAccountSplits = async (workspaceId: string, compatibleColumns: Set<string>) => {
  if (!compatibleColumns.has("accountNumber")) {
    return 0;
  }

  const uploadedAccounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      type: { in: ["wallet", "credit_card"] },
    },
    select: getCompatibleAccountSelect(compatibleColumns),
  }).catch(() => []);
  const wallets = uploadedAccounts.filter((account) => account.type === "wallet");
  const mergedCardIds = new Set<string>();
  let repairedCount = 0;

  for (const wallet of wallets) {
    const legacyCards = uploadedAccounts.filter(
      (account) => account.type === "credit_card" && matchesLegacyPayPalWalletDuplicate(wallet, account)
    );
    if (legacyCards.length === 0) {
      continue;
    }

    const freshestBalance = [wallet, ...legacyCards]
      .sort((left, right) => {
        const rightTime = Math.max(right.updatedAt.getTime(), right.createdAt.getTime());
        const leftTime = Math.max(left.updatedAt.getTime(), left.createdAt.getTime());
        return rightTime - leftTime;
      })
      .find((account) => account.balance !== null && account.balance !== undefined)?.balance?.toString() ?? null;
    const duplicateIds = legacyCards.map((account) => account.id);

    try {
      await prisma.$transaction(async (tx) => {
        if (freshestBalance !== null && wallet.balance?.toString() !== freshestBalance) {
          await tx.account.update({
            where: { id: wallet.id },
            data: { balance: freshestBalance, type: "wallet" },
          });
        }

        await tx.transaction.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.importFile.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.documentImport.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.accountStatementCheckpoint.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.financialCommitment.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.receiptDocument.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.investmentSnapshot.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.investmentHolding.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.investmentPurchase.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.investmentDividend.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.recurringPattern.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.accountRule.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: wallet.id } });
        await tx.account.deleteMany({ where: { id: { in: duplicateIds }, source: "upload", type: "credit_card" } });
      });
      duplicateIds.forEach((id) => mergedCardIds.add(id));
      repairedCount += duplicateIds.length;
    } catch (error) {
      console.warn("[accounts] unable to repair legacy PayPal wallet split", {
        workspaceId,
        walletAccountId: wallet.id,
        duplicateAccountIds: duplicateIds,
        error,
      });
    }
  }

  // Earlier imports could leave an ordinary PayPal account as the only
  // credit-card record. There is no wallet duplicate to trigger the merge
  // above, so normalize that surviving uploaded account in place. Explicitly
  // branded PayPal Credit accounts remain untouched.
  const staleStandaloneCards = uploadedAccounts.filter(
    (account) =>
      account.type === "credit_card" &&
      !mergedCardIds.has(account.id) &&
      isOrdinaryPayPalAccountIdentity(account)
  );
  if (staleStandaloneCards.length > 0) {
    const result = await prisma.account.updateMany({
      where: {
        id: { in: staleStandaloneCards.map((account) => account.id) },
        workspaceId,
        source: "upload",
        type: "credit_card",
      },
      data: { type: "wallet" },
    });
    repairedCount += result.count;
  }

  return repairedCount;
};

const repairMisclassifiedUploadedRcbcCreditCards = async (workspaceId: string) => {
  const candidates = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      type: "bank",
      OR: [
        { institution: { contains: "RCBC", mode: "insensitive" } },
        { name: { contains: "RCBC", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      institution: true,
      type: true,
      importFiles: { select: { fileName: true } },
    },
  }).catch(() => []);

  const cardIds = candidates
    .filter((account) =>
      account.importFiles.some(
        (file) => inferCanonicalImportedAccountProduct({ ...account, fileName: file.fileName })?.type === "credit_card"
      )
    )
    .map((account) => account.id);
  if (cardIds.length === 0) {
    return 0;
  }

  const result = await prisma.account.updateMany({
    where: {
      id: { in: cardIds },
      workspaceId,
      source: "upload",
      type: "bank",
    },
    data: { type: "credit_card" },
  });
  return result.count;
};

const repairLegacyUploadedGcryptoAccountSplits = async (workspaceId: string) => {
  const candidates = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      type: "investment",
      OR: [
        { institution: { contains: "GCrypto", mode: "insensitive" } },
        { name: { contains: "GCrypto", mode: "insensitive" } },
      ],
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      institution: true,
      balance: true,
      createdAt: true,
      _count: { select: { investmentSnapshots: true } },
    },
  }).catch(() => []);
  if (candidates.length === 0) {
    return 0;
  }

  const canonical = candidates[0];
  const duplicateIds = candidates.slice(1).map((account) => account.id);
  const activityOnly = candidates.every((account) => account._count.investmentSnapshots === 0);
  const needsCanonicalUpdate =
    canonical.name !== "GCrypto" ||
    canonical.institution !== "GCrypto" ||
    (activityOnly && canonical.balance !== null);
  if (!needsCanonicalUpdate && duplicateIds.length === 0) {
    return 0;
  }

  await prisma.$transaction(async (tx) => {
    await tx.account.update({
      where: { id: canonical.id },
      data: {
        name: "GCrypto",
        institution: "GCrypto",
        type: "investment",
        ...(activityOnly ? { balance: null } : {}),
      },
    });
    if (duplicateIds.length === 0) {
      return;
    }

    await tx.transaction.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.importFile.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.documentImport.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.accountStatementCheckpoint.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.financialCommitment.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.receiptDocument.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.investmentSnapshot.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.investmentHolding.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.investmentPurchase.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.investmentDividend.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.recurringPattern.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.accountRule.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.budget.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.circleInvestmentShare.updateMany({ where: { accountId: { in: duplicateIds } }, data: { accountId: canonical.id } });
    await tx.account.deleteMany({ where: { id: { in: duplicateIds }, source: "upload", type: "investment" } });
  });

  return duplicateIds.length + 1;
};

const materializeGcryptoActivityAssets = async (workspaceId: string) => {
  if (!(await hasCompatibleTable("InvestmentHolding")) || !(await hasCompatibleTable("InvestmentSnapshot"))) {
    return 0;
  }

  const accounts = await prisma.account.findMany({
    where: {
      workspaceId,
      source: "upload",
      type: "investment",
      OR: [
        { institution: { equals: "GCrypto", mode: "insensitive" } },
        { name: { equals: "GCrypto", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      balance: true,
      transactions: {
        where: { deletedAt: null },
        select: { date: true, merchantRaw: true, merchantClean: true, description: true },
      },
      investmentSnapshots: {
        orderBy: [{ snapshotDate: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true },
      },
      investmentHoldings: {
        select: { assetName: true, assetSymbol: true },
      },
    },
  }).catch(() => []);

  const assetCatalog = [
    { name: "Bitcoin", symbol: "BTC", pattern: /\b(?:bitcoin|btc)\b/i },
    { name: "Stellar", symbol: "XLM", pattern: /\b(?:stellar|xlm)\b/i },
    { name: "XRP", symbol: "XRP", pattern: /\b(?:ripple|xrp)\b/i },
    { name: "Solana", symbol: "SOL", pattern: /\b(?:solana|sol)\b/i },
    { name: "The Graph", symbol: "GRT", pattern: /\b(?:the graph|grt)\b/i },
  ] as const;
  let repaired = 0;

  for (const account of accounts) {
    const activityText = account.transactions
      .flatMap((transaction) => [transaction.merchantClean, transaction.merchantRaw, transaction.description])
      .filter(Boolean)
      .join(" ");
    const detectedAssets = assetCatalog.filter((asset) => asset.pattern.test(activityText));
    if (detectedAssets.length === 0) {
      continue;
    }

    const existingSymbols = new Set(
      account.investmentHoldings.flatMap((holding) => [holding.assetSymbol, holding.assetName]).filter(Boolean).map((value) => value!.toUpperCase())
    );
    const missingAssets = detectedAssets.filter(
      (asset) => !existingSymbols.has(asset.symbol) && !existingSymbols.has(asset.name.toUpperCase())
    );
    if (missingAssets.length === 0) {
      continue;
    }

    let snapshotId = account.investmentSnapshots[0]?.id ?? null;
    if (!snapshotId) {
      const latestActivityDate = account.transactions.reduce<Date | null>(
        (latest, transaction) => (!latest || transaction.date > latest ? transaction.date : latest),
        null
      );
      const snapshot = await prisma.investmentSnapshot.create({
        data: {
          workspaceId,
          accountId: account.id,
          portfolioName: "GCrypto",
          snapshotDate: latestActivityDate,
          currency: "PHP",
          totalValue: account.balance,
          confidence: 100,
          rawPayload: { source: "derived_gcrypto_activity_assets" },
        },
        select: { id: true },
      });
      snapshotId = snapshot.id;
    }

    await prisma.investmentHolding.createMany({
      data: missingAssets.map((asset) => ({
        workspaceId,
        investmentSnapshotId: snapshotId as string,
        accountId: account.id,
        assetName: asset.name,
        assetSymbol: asset.symbol,
        assetType: "crypto",
        quantity: "0",
        marketValue: "0",
        currentValue: "0",
        currency: "PHP",
        status: "suggested",
        confidence: 100,
        rawPayload: { source: "derived_gcrypto_activity_assets", zeroValuePosition: true },
      })),
    });
    repaired += missingAssets.length;
  }

  return repaired;
};

export async function GET(request: Request) {
  try {
    const userId = await resolveAccountsRouteUserId();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    const shouldCleanupEmptyCashAccounts = ["1", "true"].includes(
      (searchParams.get("cleanupEmptyCashAccounts") ?? "").trim().toLowerCase()
    );
    let removedEmptyCashAccountIds: string[] = [];
    if (shouldCleanupEmptyCashAccounts) {
      removedEmptyCashAccountIds = await prisma.$transaction((tx) =>
        removeEmptyNonDefaultCashAccounts(tx, {
          workspaceId,
          actorUserId: userId,
        })
      );
    }
    const shouldRunAccountMaintenance = ["1", "true"].includes(
      (searchParams.get("maintenance") ?? "").trim().toLowerCase()
    );
    let repairedLegacyGotradeAccounts = 0;
    let repairedLegacyWiseWallets = 0;
    if (shouldRunAccountMaintenance) {
      await repairWorkspaceDataVisibility(workspaceId).catch((error) => {
        console.warn("[accounts] unable to repair workspace data visibility", {
          workspaceId,
          error,
        });
      });
    }
    const compatibleColumns = await getCompatibleAccountColumns();
    if (shouldRunAccountMaintenance) {
    // Run the narrow PayPal type-migration repair before returning visible
    // accounts so stale client caches cannot keep the obsolete card copy alive.
    await repairLegacyUploadedPayPalAccountSplits(workspaceId, compatibleColumns).catch((error) => {
      console.warn("[accounts] unable to repair legacy PayPal wallet split", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairMisclassifiedUploadedRcbcCreditCards(workspaceId).catch((error) => {
      console.warn("[accounts] unable to repair misclassified RCBC credit card", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairLegacyUploadedGcryptoAccountSplits(workspaceId).catch((error) => {
      console.warn("[accounts] unable to repair legacy GCrypto account splits", {
        workspaceId,
        error,
      });
      return 0;
    });
    await materializeGcryptoActivityAssets(workspaceId).catch((error) => {
      console.warn("[accounts] unable to materialize GCrypto activity assets", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairGeneratedPdaxXrpAccountAliases(workspaceId).catch((error) => {
      console.warn("[accounts] unable to repair generated PDAX XRP account aliases", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairGeneratedPdaxSnapshotHoldings(workspaceId).catch((error) => {
      console.warn("[accounts] unable to repair generated PDAX snapshot holdings", {
        workspaceId,
        error,
      });
      return 0;
    });
    await cleanupPdaxPortfolioBucketHoldings(workspaceId).catch((error) => {
      console.warn("[accounts] unable to clean generated PDAX bucket holdings", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairGeneratedPdaxPortfolioAssetLabels(workspaceId).catch((error) => {
      console.warn("[accounts] unable to normalize PDAX portfolio labels", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairDuplicatePdaxWalletAccounts(workspaceId).catch((error) => {
      console.warn("[accounts] unable to collapse duplicate PDAX wallets", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairLegacyUploadedMayaWiseAccountSplits(workspaceId, compatibleColumns).catch((error) => {
      console.warn("[accounts] unable to repair legacy Maya/Wise account splits", {
        workspaceId,
        error,
      });
      return 0;
    });
    repairedLegacyWiseWallets = await repairLegacyWiseWalletDuplicates(workspaceId).catch((error) => {
      console.warn("[accounts] unable to repair duplicate Wise wallets", {
        workspaceId,
        error,
      });
      return 0;
    });
    repairedLegacyGotradeAccounts = await repairLegacyMisclassifiedGotradeAccounts(workspaceId).catch((error) => {
      console.warn("[accounts] unable to repair legacy GoTrade accounts", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairLegacyUploadedGsaveUnoIdentities(workspaceId).catch((error) => {
      console.warn("[accounts] unable to repair legacy GSave / UNO account identities", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairIncompleteGsaveTimeDeposits(workspaceId).catch((error) => {
      console.warn("[accounts] unable to restore incomplete GSave time deposits", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairExplicitlyMislinkedGsaveSnapshots(workspaceId).catch((error) => {
      console.warn("[accounts] unable to repair mislinked GSave investment snapshots", {
        workspaceId,
        error,
      });
      return 0;
    });
    await repairLegacyGotradeActivityImports(workspaceId).catch((error) => {
      console.warn("[accounts] unable to recover GoTrade activity imports", {
        workspaceId,
        error,
      });
      return 0;
    });
    }
    const shouldRepairImportedAccounts = ["1", "true"].includes(
      (searchParams.get("repairImportedAccounts") ?? "").trim().toLowerCase()
    );
    if (shouldRepairImportedAccounts) {
      await repairParsedImportedAccounts(workspaceId, compatibleColumns).catch((error) => {
        console.warn("[accounts] unable to repair parsed imported account materialization", {
          workspaceId,
          error,
        });
      });
    }
    const shouldCleanupImportedAccounts = ["1", "true"].includes(
      (searchParams.get("cleanupImportedAccounts") ?? "").trim().toLowerCase()
    );
    let removedStalePdaxBucketHoldings = 0;
    let repairedPdaxPortfolioAssetLabels = 0;
    let repairedMalformedPdaxActionControlAccounts = 0;
    let repairedPdaxPortfolioAccounts = 0;
    let repairedDuplicatePdaxWalletAccounts = 0;
    let refreshedPdaxCryptoMarketValues = 0;
    let removedMalformedPdaxPortfolioOverviewAccounts = 0;
    if (shouldCleanupImportedAccounts) {
      await cleanupFilenameUploadedAccountPlaceholders(workspaceId).catch((error) => {
        console.warn("[accounts] unable to clean up filename imported account placeholders", {
          workspaceId,
          error,
        });
      });
      removedStalePdaxBucketHoldings = await cleanupPdaxPortfolioBucketHoldings(workspaceId).catch((error) => {
        console.warn("[accounts] unable to clean up stale PDAX portfolio bucket holdings", {
          workspaceId,
          error,
        });
        return 0;
      });
      repairedPdaxPortfolioAssetLabels = await repairGeneratedPdaxPortfolioAssetLabels(workspaceId).catch((error) => {
        console.warn("[accounts] unable to repair generated PDAX portfolio asset labels", {
          workspaceId,
          error,
        });
        return 0;
      });
      repairedPdaxPortfolioAccounts = await repairPdaxPortfolioAccountsFromParsedRows(workspaceId).catch((error) => {
        console.warn("[accounts] unable to repair PDAX portfolio accounts from parsed evidence", {
          workspaceId,
          error,
        });
        return 0;
      });
      repairedDuplicatePdaxWalletAccounts = await repairDuplicatePdaxWalletAccounts(workspaceId).catch((error) => {
        console.warn("[accounts] unable to repair duplicate PDAX wallets", {
          workspaceId,
          error,
        });
        return 0;
      });
      await repairCryptoDenominatedCashAccounts(workspaceId).catch((error) => {
        console.warn("[accounts] unable to repair crypto-denominated Cash accounts", {
          workspaceId,
          error,
        });
        return 0;
      });
      refreshedPdaxCryptoMarketValues = await refreshPdaxCryptoMarketValues(workspaceId).catch((error) => {
        console.warn("[accounts] unable to refresh PDAX crypto market values", { workspaceId, error });
        return 0;
      });
      repairedMalformedPdaxActionControlAccounts = await repairMalformedPdaxActionControlAccount(workspaceId).catch((error) => {
        console.warn("[accounts] unable to repair malformed PDAX action-control account", {
          workspaceId,
          error,
        });
        return 0;
      });
      removedMalformedPdaxPortfolioOverviewAccounts = await cleanupMalformedPdaxPortfolioOverviewAccount(workspaceId).catch((error) => {
        console.warn("[accounts] unable to remove malformed PDAX portfolio overview account", {
          workspaceId,
          error,
        });
        return 0;
      });
      await cleanupEmptyGenericUploadedAccountPlaceholders(workspaceId, compatibleColumns).catch((error) => {
        console.warn("[accounts] unable to clean up empty generic imported account placeholders", {
          workspaceId,
          error,
        });
      });
      await collapseDuplicateUploadedAccountsByIdentity(workspaceId, compatibleColumns).catch((error) => {
        console.warn("[accounts] unable to collapse duplicate uploaded accounts", {
          workspaceId,
          error,
        });
      });
      await repairLegacyUploadedCardAccountSplits(workspaceId, compatibleColumns).catch((error) => {
        console.warn("[accounts] unable to repair legacy uploaded card account splits", {
          workspaceId,
          error,
        });
      });
    }

    const [accounts, accountRules, statementCheckpoints, investmentSnapshots, earliestInvestmentPurchaseDates] = await Promise.all([
      prisma.account.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        select: getCompatibleAccountSelect(compatibleColumns),
      }),
      loadAccountRules(workspaceId),
      (async () => {
      if (!(await hasCompatibleTable("AccountStatementCheckpoint"))) {
        return [];
      }

      const checkpoints = await prisma.accountStatementCheckpoint.findMany({
        where: { workspaceId },
        orderBy: [
          { statementEndDate: "desc" },
          { createdAt: "desc" },
        ],
      });

      const latestByAccountId = new Map<string, (typeof checkpoints)[number]>();
      const latestByAccountKey = new Map<string, (typeof checkpoints)[number]>();
      for (const checkpoint of checkpoints) {
        if (!isAccountBalanceCheckpointEvidence(checkpoint)) {
          continue;
        }
        const sourceMetadata =
          checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
            ? (checkpoint.sourceMetadata as Record<string, unknown>)
            : null;
        const checkpointNumber =
          typeof sourceMetadata?.accountNumber === "string" && sourceMetadata.accountNumber.trim()
            ? sourceMetadata.accountNumber.trim()
            : null;
        const checkpointKey = buildCurrencyScopedAccountIdentityKey({
          name: typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : null,
          institution: typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : null,
          accountNumber: checkpointNumber,
          type: typeof sourceMetadata?.accountType === "string" ? sourceMetadata.accountType : null,
          currency:
            typeof sourceMetadata?.currency === "string"
              ? sourceMetadata.currency
              : typeof sourceMetadata?.accountCurrency === "string"
                ? sourceMetadata.accountCurrency
                : null,
        });
        if (checkpointKey) {
          const currentByKey = latestByAccountKey.get(checkpointKey);
          if (!currentByKey || compareAccountCheckpointFreshness(checkpoint, currentByKey) >= 0) {
            latestByAccountKey.set(checkpointKey, checkpoint);
          }
        }

        if (checkpoint.accountId) {
          const current = latestByAccountId.get(checkpoint.accountId);
          if (!current || compareAccountCheckpointFreshness(checkpoint, current) >= 0) {
            latestByAccountId.set(checkpoint.accountId, checkpoint);
          }
        }
      }

      const checkpointValues = Array.from(
        new Map([
          ...Array.from(latestByAccountId.entries()),
          ...Array.from(latestByAccountKey.entries()).map(([key, checkpoint]) => [`key:${key}`, checkpoint] as const),
        ]).values()
      );

      return checkpointValues.map((checkpoint) => ({
        ...checkpoint,
        openingBalance: checkpoint.openingBalance?.toString() ?? null,
        endingBalance: checkpoint.endingBalance?.toString() ?? null,
        statementStartDate: checkpoint.statementStartDate?.toISOString() ?? null,
        statementEndDate: checkpoint.statementEndDate?.toISOString() ?? null,
        createdAt: checkpoint.createdAt.toISOString(),
        updatedAt: checkpoint.updatedAt.toISOString(),
        sourceMetadata: checkpoint.sourceMetadata ?? null,
      }));
      })(),
      loadInvestmentSnapshotsForWorkspace(workspaceId),
      loadEarliestInvestmentPurchaseDatesForWorkspace(workspaceId),
    ]);
    const accountIds = accounts.map((account) => account.id);
    const transactionCounts = accountIds.length
      ? await prisma.transaction.groupBy({
          by: ["accountId", "currency"],
          where: {
            workspaceId,
            accountId: { in: accountIds },
            deletedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const transactionCountByAccountId = new Map(
      accounts.map((account) => [
        account.id,
        transactionCounts
          .filter((row) => row.accountId === account.id)
          .filter(
            (row) => account.type !== "cash" || normalizeImportedCurrencyCode(row.currency) === normalizeImportedCurrencyCode(account.currency)
          )
          .reduce((sum, row) => sum + row._count._all, 0),
      ])
    );
    const checkpointAccountIds = new Set(
      statementCheckpoints
        .map((checkpoint) => checkpoint.accountId)
        .filter((accountId): accountId is string => typeof accountId === "string" && accountId.trim().length > 0)
    );
    const publishedInventoryAccountIds = new Set(
      statementCheckpoints.flatMap((checkpoint) => {
        const sourceMetadata =
          checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
            ? (checkpoint.sourceMetadata as Record<string, unknown>)
            : null;
        const publishedAccountSummaries = Array.isArray(sourceMetadata?.publishedAccountSummaries)
          ? sourceMetadata.publishedAccountSummaries
          : [];

        return publishedAccountSummaries.flatMap((summary) => {
          if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
            return [];
          }

          const accountId = (summary as Record<string, unknown>).accountId;
          return typeof accountId === "string" && accountId.trim() ? [accountId.trim()] : [];
        });
      })
    );
    const checkpointAccountNumbers = new Set(
      statementCheckpoints
        .map((checkpoint) => {
          const sourceMetadata =
            checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
              ? (checkpoint.sourceMetadata as Record<string, unknown>)
              : null;
          return typeof sourceMetadata?.accountNumber === "string" ? normalizeImportAccountNumber(sourceMetadata.accountNumber) : null;
        })
        .filter((value): value is string => Boolean(value))
    );
    const isOrphanUploadedAccountPlaceholder = (account: {
      id: string;
      name: string;
      source: string;
      institution?: string | null;
      accountNumber?: string | null;
      balance?: { toString: () => string } | string | number | null;
      type?: string | null;
    }) => {
      if (account.source !== "upload") {
        return false;
      }

      const transactionCount = transactionCountByAccountId.get(account.id) ?? 0;
      if (transactionCount > 0 || checkpointAccountIds.has(account.id) || publishedInventoryAccountIds.has(account.id)) {
        return false;
      }

      const accountNumber = normalizeImportAccountNumber(account.accountNumber ?? null);
      if (!accountNumber) {
        return isGenericUploadedAccountForInstitution(account) || !account.institution;
      }

      if (account.institution) {
        return false;
      }

      if (accountNumber && checkpointAccountNumbers.has(accountNumber)) {
        return false;
      }

      const balance = account.balance?.toString().trim() ?? "";
      const numericBalance = balance ? Number(balance.replace(/[^0-9.-]/g, "")) : 0;
      return !balance || !Number.isFinite(numericBalance) || numericBalance === 0;
    };
    const isTransientUploadedAccountPlaceholder = (account: {
      id: string;
      source: string;
      type?: string | null;
      accountNumber?: string | null;
    }) => {
      if (account.source !== "upload" || normalizeImportAccountNumber(account.accountNumber ?? null)) {
        return false;
      }

      const transactionCount = transactionCountByAccountId.get(account.id) ?? 0;
      if (transactionCount > 0 || checkpointAccountIds.has(account.id) || publishedInventoryAccountIds.has(account.id)) {
        return false;
      }

      return account.type === "bank" || account.type === "credit_card" || account.type === "line_of_credit";
    };

    const numberedInstitutionCurrencyKeys = new Set(
      accounts
        .filter((account) => normalizeImportAccountNumber(account.accountNumber ?? null))
        .map((account) => importedAccountInstitutionCurrencyKey(account))
        .filter(Boolean)
    );
    const visibleAccounts = accounts.filter(
      (account) => {
        const institutionCurrencyKey = importedAccountInstitutionCurrencyKey(account);
        return (
          !looksLikeReceiptImageFilenameAccount(account) &&
          !isOrphanUploadedAccountPlaceholder(account) &&
          !isTransientUploadedAccountPlaceholder(account) &&
          !(
            institutionCurrencyKey &&
            numberedInstitutionCurrencyKeys.has(institutionCurrencyKey) &&
            isGenericUploadedAccountForInstitution(account)
          )
        );
      }
    );
    const latestCheckpointForAccount = (account: {
      id: string;
      name: string;
      institution: string | null;
      accountNumber?: string | null;
      type: string;
      currency?: string | null;
    }) => {
      let latestCheckpoint: (typeof statementCheckpoints)[number] | null = null;
      const accountKey = buildCurrencyScopedAccountIdentityKey({
        name: account.name,
        institution: account.institution,
        accountNumber: account.accountNumber ?? null,
        type: account.type,
        currency: account.currency ?? null,
      });
      const accountNumber = normalizeImportAccountNumber(account.accountNumber ?? null);

      for (const checkpoint of statementCheckpoints) {
        const sourceMetadata =
          checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
            ? (checkpoint.sourceMetadata as Record<string, unknown>)
            : null;
        const checkpointNumber =
          typeof sourceMetadata?.accountNumber === "string" ? normalizeImportAccountNumber(sourceMetadata.accountNumber) : null;
        const checkpointKey = buildCurrencyScopedAccountIdentityKey({
          name: typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : null,
          institution: typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : null,
          accountNumber: checkpointNumber,
          type: typeof sourceMetadata?.accountType === "string" ? sourceMetadata.accountType : null,
          currency:
            typeof sourceMetadata?.currency === "string"
              ? sourceMetadata.currency
              : typeof sourceMetadata?.accountCurrency === "string"
                ? sourceMetadata.accountCurrency
                : null,
        });
        const checkpointBankLabel =
          typeof sourceMetadata?.institution === "string"
            ? sourceMetadata.institution
            : typeof sourceMetadata?.uploadBankHint === "string"
              ? sourceMetadata.uploadBankHint
              : null;
        const accountDigits = String(account.accountNumber ?? "").replace(/\D/g, "");
        const checkpointDigits = String(checkpointNumber ?? "").replace(/\D/g, "");
        const accountLastFour = accountDigits.slice(-4);
        const checkpointLastFour = checkpointDigits.slice(-4);
        const matchesByDigits =
          Boolean(accountDigits && checkpointDigits && accountDigits === checkpointDigits) ||
          Boolean(
            checkpointBankLabel &&
              accountLastFour.length === 4 &&
              checkpointLastFour.length === 4 &&
              accountLastFour === checkpointLastFour
          );
        const matchesAccount =
          checkpoint.accountId === account.id ||
          (accountKey !== "" && checkpointKey === accountKey) ||
          matchesByDigits;

        if (!matchesAccount) {
          continue;
        }

        if (!latestCheckpoint || compareAccountCheckpointFreshness(checkpoint, latestCheckpoint) >= 0) {
          latestCheckpoint = checkpoint;
        }
      }

      return latestCheckpoint;
    };
    const accountsWithCheckpointBackfill = visibleAccounts.map((account) => {
      const latestCheckpoint = latestCheckpointForAccount(account);
      const checkpointPublishedSummaries =
        latestCheckpoint?.sourceMetadata &&
        typeof latestCheckpoint.sourceMetadata === "object" &&
        !Array.isArray(latestCheckpoint.sourceMetadata) &&
        Array.isArray((latestCheckpoint.sourceMetadata as Record<string, unknown>).publishedAccountSummaries)
          ? ((latestCheckpoint.sourceMetadata as Record<string, unknown>).publishedAccountSummaries as Array<Record<string, unknown>>)
          : [];
      const exactCheckpointPublishedSummary =
        checkpointPublishedSummaries.find((summary) => String(summary.accountId ?? "").trim() === account.id) ?? null;
      const checkpointPublishedSummary =
        exactCheckpointPublishedSummary ??
        (publishedInventoryAccountIds.has(account.id)
          ? null
          : findPublishedSummaryForAccount(account, checkpointPublishedSummaries));
      const checkpointAccountName =
        checkpointPublishedSummary && typeof checkpointPublishedSummary.accountName === "string"
          ? String(checkpointPublishedSummary.accountName).trim()
          :
        latestCheckpoint?.sourceMetadata &&
        typeof latestCheckpoint.sourceMetadata === "object" &&
        !Array.isArray(latestCheckpoint.sourceMetadata) &&
        typeof (latestCheckpoint.sourceMetadata as Record<string, unknown>).accountName === "string"
          ? String((latestCheckpoint.sourceMetadata as Record<string, unknown>).accountName).trim()
          : null;
      const checkpointBankHint =
        latestCheckpoint?.sourceMetadata &&
        typeof latestCheckpoint.sourceMetadata === "object" &&
        !Array.isArray(latestCheckpoint.sourceMetadata) &&
        typeof (latestCheckpoint.sourceMetadata as Record<string, unknown>).uploadBankHint === "string"
          ? String((latestCheckpoint.sourceMetadata as Record<string, unknown>).uploadBankHint).trim()
          : null;
      const checkpointInstitution =
        checkpointPublishedSummary && typeof checkpointPublishedSummary.institution === "string"
          ? String(checkpointPublishedSummary.institution).trim()
          :
        latestCheckpoint?.sourceMetadata &&
        typeof latestCheckpoint.sourceMetadata === "object" &&
        !Array.isArray(latestCheckpoint.sourceMetadata) &&
        typeof (latestCheckpoint.sourceMetadata as Record<string, unknown>).institution === "string"
          ? String((latestCheckpoint.sourceMetadata as Record<string, unknown>).institution).trim()
          : null;
      const checkpointAccountNumber =
        checkpointPublishedSummary && typeof checkpointPublishedSummary.accountNumber === "string"
          ? String(checkpointPublishedSummary.accountNumber).trim()
          :
        latestCheckpoint?.sourceMetadata &&
        typeof latestCheckpoint.sourceMetadata === "object" &&
        !Array.isArray(latestCheckpoint.sourceMetadata) &&
        typeof (latestCheckpoint.sourceMetadata as Record<string, unknown>).accountNumber === "string"
          ? String((latestCheckpoint.sourceMetadata as Record<string, unknown>).accountNumber).trim()
          : null;
      const exactCheckpointEndingBalance =
        latestCheckpoint?.accountId === account.id &&
        latestCheckpoint.endingBalance !== null &&
        latestCheckpoint.endingBalance !== undefined
          ? latestCheckpoint.endingBalance.toString()
          : null;
      const publishedSummaryBalance =
        checkpointPublishedSummary?.balance !== null && checkpointPublishedSummary?.balance !== undefined
          ? String(checkpointPublishedSummary.balance).trim() || null
          : null;
      const checkpointBalance =
        latestCheckpoint?.status === "mismatch"
          ? null
          // The checkpoint row is the reconciled statement result. A cached
          // publication summary can contain an earlier parser projection (for
          // example Maya 2608's stale 60,184.87 beside a 27,228.09 ending
          // balance), so it must never outrank exact checkpoint evidence.
          : exactCheckpointEndingBalance ?? publishedSummaryBalance;
      const effectiveAccountNumber = account.accountNumber ?? checkpointAccountNumber ?? null;
      const hasCorrectedGotradeIdentity =
        account.institution?.trim().toLowerCase() === "gotrade" && /^gotrade(?: activity)?$/i.test(account.name.trim());
      const uploadedInstitution = hasCorrectedGotradeIdentity
        ? account.institution
        : resolveUploadedAccountInstitution(account.institution, checkpointBankHint, checkpointInstitution);
      const effectiveInstitution = uploadedInstitution ?? account.institution ?? checkpointInstitution ?? null;
      const effectiveSource =
        account.source === "upload"
          ? "upload"
          : latestCheckpoint && effectiveInstitution && effectiveAccountNumber
            ? "upload"
            : account.source;
      const shouldReplaceGenericImageFilename =
        looksLikeGenericImageFilenameAccount(account) &&
        Boolean(effectiveInstitution || effectiveAccountNumber || checkpointAccountName);
      const effectiveAccountName =
        effectiveSource === "upload"
          ? account.nameCustomized
            ? account.name
            : formatUploadAccountDisplayName(
                shouldReplaceGenericImageFilename
                  ? checkpointAccountName ?? effectiveInstitution ?? account.name
                  : hasCorrectedGotradeIdentity
                    ? account.name
                    : checkpointAccountName ?? account.name,
                effectiveInstitution,
                effectiveAccountNumber,
                account.type
              )
          : account.name;

      return {
        ...account,
        source: effectiveSource,
        name: effectiveAccountName,
        institution: effectiveInstitution,
        accountNumber: effectiveAccountNumber,
        // A portfolio checkpoint preserves the screenshot value at import
        // time. Do not publish it as the current balance: it can overwrite a
        // freshly revalued BTC/XRP holding and make Accounts disagree with the
        // institution Holdings total.
        balance: resolveEffectiveAccountBalance({
          accountType: account.type,
          liveBalance: account.balance,
          checkpointStatus: latestCheckpoint?.status ?? null,
          checkpointBalance,
        }),
      };
    });
    const responseAccounts = accountsWithCheckpointBackfill.filter(
      (account) =>
        !isOrphanUploadedAccountPlaceholder(account) &&
        !looksLikeReceiptImageFilenameAccount(account) &&
        !looksLikeGenericImageFilenameAccount(account)
    );
    const serializedResponseAccounts = responseAccounts.map((account) => {
      const purchaseStartDate = earliestInvestmentPurchaseDates.get(account.id) ?? null;
      const effectiveInvestmentStartDate =
        purchaseStartDate && (!account.investmentStartDate || purchaseStartDate < account.investmentStartDate)
          ? purchaseStartDate
          : account.investmentStartDate;
      return {
        ...serializeAccount({
          ...account,
          investmentStartDate: effectiveInvestmentStartDate,
          transactionCount: transactionCountByAccountId.get(account.id) ?? 0,
        }),
        // Account-inventory imports intentionally have no transactions. Carry
        // their publication evidence to the browser so cache cleanup never
        // mistakes a legitimate zero-balance account for a transient parser
        // placeholder.
        publishedImportInventory: publishedInventoryAccountIds.has(account.id),
      };
    });

    console.info("[accounts-api] response summary", {
      userId,
      workspaceId,
      persistedAccountCount: accounts.length,
      publishedInventoryAccountCount: publishedInventoryAccountIds.size,
      visibleAccountCount: serializedResponseAccounts.length,
    });

    return NextResponse.json({
      accounts: serializedResponseAccounts,
      accountRules,
      statementCheckpoints,
      investmentSnapshots,
      removedEmptyCashAccountIds,
      maintenance: shouldCleanupImportedAccounts
        ? {
            removedStalePdaxBucketHoldings,
            repairedPdaxPortfolioAssetLabels,
            repairedMalformedPdaxActionControlAccounts,
            repairedPdaxPortfolioAccounts,
            repairedDuplicatePdaxWalletAccounts,
            refreshedPdaxCryptoMarketValues,
            removedMalformedPdaxPortfolioOverviewAccounts,
            repairedLegacyGotradeAccounts,
            repairedLegacyWiseWallets,
          }
        : undefined,
    });
  } catch (error) {
    if (isTransientDataError(error)) {
      console.warn("[accounts] database temporarily unavailable", summarizeErrorForLog(error));
      return createTransientDataUnavailableResponse("Clover is reconnecting to your accounts. Please retry shortly.");
    }

    if (isUnauthorizedDataError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[accounts] unable to load accounts", summarizeErrorForLog(error));
    return NextResponse.json({ error: "Unable to load accounts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await resolveAccountsRouteUserId();
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || "");
    const name = String(body?.name || "").trim();
    const institution = body?.institution ? String(body.institution) : null;
    const accountNumber = body?.accountNumber ? String(body.accountNumber).trim() || null : null;
    const type = isSupportedAccountType(body?.type) ? body.type : "bank";
    const investmentSubtype = normalizeInvestmentSubtype(body?.investmentSubtype);
    const investmentSymbol = body?.investmentSymbol ? String(body.investmentSymbol).trim() || null : null;
    const investmentQuantity = parseNullableDecimal(body?.investmentQuantity);
    const investmentCostBasis = parseNullableDecimal(body?.investmentCostBasis);
    const investmentPrincipal = parseNullableDecimal(body?.investmentPrincipal);
    const investmentStartDate = parseNullableDate(body?.investmentStartDate);
    const investmentMaturityDate = parseNullableDate(body?.investmentMaturityDate);
    const investmentInterestRate = parseNullableDecimal(body?.investmentInterestRate);
    const investmentMaturityValue = parseNullableDecimal(body?.investmentMaturityValue);
    const investmentPurchaseDate = parseNullableDate(body?.investmentPurchaseDate);
    const investmentDividendDate = parseNullableDate(body?.investmentDividendDate);
    const investmentDividendAmount = parseNullableDecimal(body?.investmentDividendAmount);
    const investmentPurchaseNote = parseNullableText(body?.investmentPurchaseNote);
    const investmentDividendNote = parseNullableText(body?.investmentDividendNote);
    const balance = parseNullableDecimal(body?.balance);
    const normalizedCurrency = normalizeInstitutionCurrency(
      institution,
      body?.currency ? String(body.currency).trim().toUpperCase() : null,
      name
    ) ?? "PHP";

    if (!workspaceId || !name) {
      return NextResponse.json({ error: "workspaceId and name are required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    await seedWorkspaceDefaults(workspaceId);
    const compatibleColumns = await getCompatibleAccountColumns();

    const existingAccounts = await prisma.account.findMany({
      where: { workspaceId },
      select: getCompatibleAccountSelect(compatibleColumns),
    });
    const candidateKey = normalizeAccountRuleKey(name, institution);
    const requestSpecifiedCurrency = Boolean(body?.currency && String(body.currency).trim());
    const existingAccount =
      existingAccounts.find(
        (account) =>
          account.type === type &&
          normalizeAccountRuleKey(account.name, account.institution) === candidateKey &&
          normalizeAccountCurrency(account) === normalizedCurrency
      ) ??
      (!requestSpecifiedCurrency
        ? existingAccounts.find(
            (account) =>
              account.type === type &&
              normalizeAccountRuleKey(account.name, account.institution) === candidateKey
          ) ??
          existingAccounts.find((account) => account.type === type && account.name === name && account.institution === institution)
        : null) ??
      null;
    const existingCashAccount =
      type === "cash"
        ? existingAccounts.find((account) => account.type === "cash" && normalizeAccountCurrency(account) === normalizedCurrency) ?? null
        : null;
    const hasInitialPurchaseHistory =
      type === "investment" &&
      investmentPurchaseDate !== null &&
      (investmentCostBasis !== null || investmentPrincipal !== null);
    const hasInitialDividend =
      type === "investment" &&
      investmentDividendDate !== null &&
      investmentDividendAmount !== null;

    const createInitialInvestmentHistory = async (
      accountId: string,
      accountSubtype: string | null,
      adjustSummary: boolean
    ) => {
      if (type !== "investment") {
        return;
      }

      await prisma.$transaction(async (tx) => {
        if (hasInitialPurchaseHistory) {
          const purchaseTotal = getInvestmentSummaryField(accountSubtype) === "investmentPrincipal" ? investmentPrincipal : investmentCostBasis;
          if (purchaseTotal !== null) {
            await tx.investmentPurchase.create({
              data: {
                accountId,
                purchasedAt: investmentPurchaseDate ?? new Date(),
                quantity: investmentQuantity,
                totalCost: purchaseTotal,
                currency: normalizedCurrency,
                note: investmentPurchaseNote ?? investmentSymbol,
              },
            });

            if (adjustSummary) {
              const summaryField = getInvestmentSummaryField(accountSubtype);
              const currentSummary = Number(
                summaryField === "investmentPrincipal"
                  ? (existingAccount?.investmentPrincipal?.toString() ?? 0)
                  : (existingAccount?.investmentCostBasis?.toString() ?? 0)
              );
              const nextSummary = new Prisma.Decimal(currentSummary).plus(new Prisma.Decimal(purchaseTotal));

              await tx.account.update({
                where: { id: accountId },
                data:
                  summaryField === "investmentPrincipal"
                    ? { investmentPrincipal: nextSummary.toString() }
                    : { investmentCostBasis: nextSummary.toString() },
              });
            }
          }
        }

        if (hasInitialDividend) {
          await tx.investmentDividend.create({
            data: {
              accountId,
              paidAt: investmentDividendDate ?? new Date(),
              amount: investmentDividendAmount,
              currency: normalizedCurrency,
              note: investmentDividendNote,
            },
          });
        }
      });
    };

    if (existingCashAccount) {
      return NextResponse.json({
        account: serializeAccount(existingCashAccount),
      });
    }

    if (existingAccount) {
      if (normalizedCurrency) {
        await ensureWorkspaceCashAccount(workspaceId, normalizedCurrency);
      }

      if (compatibleColumns.has("accountNumber") && accountNumber && (existingAccount.accountNumber ?? null) !== accountNumber) {
        const accountUpdate = (data: Record<string, unknown>) =>
          prisma.account.update({
            where: { id: existingAccount.id },
            data,
            select: getCompatibleAccountSelect(compatibleColumns),
          });

        let updatedAccount;
        try {
          updatedAccount = await accountUpdate({ accountNumber });
        } catch (error) {
          if (!isMissingAccountNumberColumnError(error)) {
            throw error;
          }

          const fallbackData = omitAccountNumberField({ accountNumber });
          updatedAccount =
            Object.keys(fallbackData).length === 0
              ? existingAccount
              : await accountUpdate(fallbackData);
        }

        await createInitialInvestmentHistory(updatedAccount.id, updatedAccount.investmentSubtype, true);

        const refreshedAccount = hasInitialPurchaseHistory
          ? await prisma.account.findUnique({
              where: { id: updatedAccount.id },
              select: getCompatibleAccountSelect(compatibleColumns),
            })
          : updatedAccount;

        return NextResponse.json({
          account: serializeAccount(refreshedAccount ?? updatedAccount),
        });
      }

      await createInitialInvestmentHistory(existingAccount.id, existingAccount.investmentSubtype, true);

      const refreshedAccount = hasInitialPurchaseHistory
        ? await prisma.account.findUnique({
            where: { id: existingAccount.id },
            select: getCompatibleAccountSelect(compatibleColumns),
          })
        : existingAccount;

      return NextResponse.json({
        account: serializeAccount(refreshedAccount ?? existingAccount),
      });
    }

    if (type !== "cash") {
      const user = await getOrCreateCurrentUser(userId);
      const effectiveLimits = getEffectiveUserLimits(user);
      const nonCashAccountCount = await countWorkspaceOwnerPlanLimitedAccounts(workspaceId);

      if (effectiveLimits.accountLimit !== null && nonCashAccountCount >= effectiveLimits.accountLimit) {
        const isFreePlan = user.planTier === "free";
        return NextResponse.json(
          {
            error: isFreePlan
              ? `Free includes up to ${effectiveLimits.accountLimit} non-cash accounts. Upgrade to Pro to add more.`
              : `You’ve reached the current ${effectiveLimits.accountLimit}-account limit on Pro. Remove an account or manage billing if you need more room.`,
            planTier: user.planTier,
            limitType: "account_limit",
            limitValue: effectiveLimits.accountLimit,
          },
          { status: 403 }
        );
      }
    }

    const accountCreateData = {
      workspaceId,
      name,
      institution,
      ...(compatibleColumns.has("accountNumber") ? { accountNumber } : {}),
      investmentSubtype: type === "investment" ? investmentSubtype : null,
      investmentSymbol: type === "investment" ? investmentSymbol : null,
      investmentQuantity: type === "investment" ? investmentQuantity : null,
      investmentCostBasis: type === "investment" ? investmentCostBasis : null,
      investmentPrincipal: type === "investment" ? investmentPrincipal : null,
      investmentStartDate: type === "investment" ? investmentStartDate : null,
      investmentMaturityDate: type === "investment" ? investmentMaturityDate : null,
      investmentInterestRate: type === "investment" ? investmentInterestRate : null,
      investmentMaturityValue: type === "investment" ? investmentMaturityValue : null,
      type,
      currency: normalizedCurrency,
      source: body?.source ? String(body.source) : "upload",
      balance,
      favorite: false,
    };

    let account;
    try {
      account = await prisma.account.create({
        data: accountCreateData,
        select: getCompatibleAccountSelect(compatibleColumns),
      });
    } catch (error) {
      if (!isMissingAccountNumberColumnError(error)) {
        throw error;
      }

      account = await prisma.account.create({
        data: omitAccountNumberField(accountCreateData),
        select: getCompatibleAccountSelect(compatibleColumns),
      });
    }

    if (normalizedCurrency) {
      await ensureWorkspaceCashAccount(workspaceId, normalizedCurrency);
    }

    await createInitialInvestmentHistory(account.id, account.investmentSubtype, false);

    void capturePostHogServerEvent("account_created", userId, {
      workspace_id: workspaceId,
      account_id: account.id,
      account_name: account.name,
      account_institution: account.institution,
      account_type: account.type,
      account_currency: account.currency,
      account_source: account.source,
      is_cash: account.type === "cash",
    });

    void upsertAccountRule({
      workspaceId,
      accountId: account.id,
      accountName: account.name,
      institution: account.institution,
      accountType: account.type,
      source: "manual_account_creation",
      confidence: 100,
    }).catch(() => null);

    return NextResponse.json({ account: serializeAccount(account) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create account.";
    const status = /unauthorized/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

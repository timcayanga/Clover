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
import { isWiseWalletWithoutVisibleAccountNumber, normalizeImportedCurrencyCode } from "@/lib/imported-account-identity";
import { repairWorkspaceDataVisibility } from "@/lib/reconciliation";

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

const resolveUploadedAccountInstitution = (
  currentInstitution?: string | null,
  checkpointBankHint?: string | null,
  checkpointInstitution?: string | null
) =>
  normalizeUploadBankName(currentInstitution) ??
  normalizeUploadBankName(checkpointBankHint) ??
  normalizeUploadBankName(checkpointInstitution) ??
  null;

const importedAccountIdentityKey = (institution?: string | null, accountNumber?: string | null) => {
  const normalizedAccountNumber = normalizeImportAccountNumber(accountNumber);
  return normalizedAccountNumber ? `${canonicalImportInstitutionKey(institution)}:${normalizedAccountNumber}` : null;
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

const readCheckpointDateTime = (value: Date | string | null | undefined) => {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const readCheckpointFreshnessTime = (checkpoint: {
  createdAt: Date | string;
  statementEndDate?: Date | string | null;
  sourceMetadata?: Prisma.JsonValue | null;
}) => {
  const sourceMetadata =
    checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
      ? (checkpoint.sourceMetadata as Record<string, unknown>)
      : null;
  const importMode = typeof sourceMetadata?.importMode === "string" ? sourceMetadata.importMode.trim() : null;
  if (importMode && importMode !== "statement") {
    return readCheckpointDateTime(checkpoint.createdAt);
  }

  return Math.max(
    readCheckpointDateTime(checkpoint.statementEndDate),
    readCheckpointDateTime(checkpoint.createdAt)
  );
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
  const accountByNumber = new Map(
    existingAccounts
      .map((account) => [importedAccountIdentityKey(account.institution, account.accountNumber), account] as const)
      .filter((entry): entry is [string, (typeof existingAccounts)[number]] => Boolean(entry[0]))
  );
  const accountByPlainNumber = new Map(
    existingAccounts
      .map((account) => {
        const number = normalizeImportAccountNumber(account.accountNumber ?? null);
        return number ? [number, account] as const : null;
      })
      .filter((entry): entry is [string, (typeof existingAccounts)[number]] => Boolean(entry))
  );
  const accountByLastFour = new Map(
    existingAccounts
      .map((account) => {
        const number = normalizeImportAccountNumber(account.accountNumber ?? null);
        const lastFour = number ? number.slice(-4) : null;
        return lastFour ? [lastFour, account] as const : null;
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

    const institution = normalizeImportInstitution(row.institution ?? readImportedJsonText(row.rawPayload, "institution"));
    const key = `${institution.toLowerCase() || "unknown"}:${accountNumber}`;
    const group: RepairGroup =
      groups.get(key) ??
        {
          accountNumber,
          accountName: row.accountName?.trim() || readImportedJsonText(row.rawPayload, "accountName"),
          institution: institution || null,
          accountType: readImportedAccountType(row.rawPayload),
          currency: row.currency?.trim().toUpperCase() || null,
          balance: null,
          rows: [],
        };
    const runningBalance = readImportedRunningBalance(row.rawPayload);
    if (group.balance === null && runningBalance !== null) {
      group.balance = runningBalance.toFixed(2);
    }
    group.rows.push(row);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const accountType =
      (group.accountType && isSupportedAccountType(group.accountType) ? group.accountType : null) ?? "bank";
    const groupIdentityKey = importedAccountIdentityKey(group.institution, group.accountNumber);
    let account =
      (groupIdentityKey ? accountByNumber.get(groupIdentityKey) ?? null : null) ??
      accountByPlainNumber.get(normalizeImportAccountNumber(group.accountNumber) ?? "") ??
      accountByLastFour.get((normalizeImportAccountNumber(group.accountNumber) ?? "").slice(-4)) ??
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
          ...(group.balance !== null ? { balance: group.balance } : {}),
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
        accountByNumber.set(groupIdentityKey, account);
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
          ...(group.balance !== null ? { balance: group.balance } : {}),
        },
      }).catch(() => null);
    }

    const importRows = group.rows
      .map((row) => ({
        importFileId: row.importFileId,
        sourceRowIndex: readImportedSourceRowIndex(row.rawPayload),
      }))
      .filter((row): row is { importFileId: string; sourceRowIndex: number } => Boolean(row.importFileId && row.sourceRowIndex !== null));
    for (const row of importRows) {
      await prisma.transaction.updateMany({
        where: {
          workspaceId,
          importFileId: row.importFileId,
          deletedAt: null,
          rawPayload: {
            path: ["sourceRowIndex"],
            equals: row.sourceRowIndex,
          },
        },
        data: { accountId: account.id },
      }).catch(() => null);
    }
  }

  const numberedInstitutions = new Set(
    Array.from(groups.values())
      .map((group) => importedAccountInstitutionKey({ institution: group.institution, accountNumber: group.accountNumber }))
      .filter(Boolean)
  );
  const genericPlaceholderIds = existingAccounts
    .filter((account) => {
      const institutionKey = importedAccountInstitutionKey(account);
      return Boolean(institutionKey && numberedInstitutions.has(institutionKey));
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
    },
  }).catch(() => []);
  const institutionsWithNumberedAccounts = new Set(
    new Set(
      numberedUploadAccounts
        .map((account) => importedAccountInstitutionKey(account))
        .filter(Boolean)
    )
  );
  if (institutionsWithNumberedAccounts.size === 0) {
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
      source: true,
    },
  }).catch(() => []);
  const deletableIds = emptyPlaceholderAccounts
    .filter(isGenericUploadedAccountForInstitution)
    .filter((account) => {
      const institutionKey = importedAccountInstitutionKey(account);
      return Boolean(institutionKey && institutionsWithNumberedAccounts.has(institutionKey));
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
    const key = importedAccountIdentityKey(account.institution, account.accountNumber);
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

export async function GET(request: Request) {
  try {
    const userId = await resolveAccountsRouteUserId();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    await repairWorkspaceDataVisibility(workspaceId).catch((error) => {
      console.warn("[accounts] unable to repair workspace data visibility", {
        workspaceId,
        error,
      });
    });
    const compatibleColumns = await getCompatibleAccountColumns();
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
    if (shouldCleanupImportedAccounts) {
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
    }

    const accounts = await prisma.account.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: getCompatibleAccountSelect(compatibleColumns),
    });
    const accountRules = await loadAccountRules(workspaceId);

    const statementCheckpoints = await (async () => {
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
        const checkpointTime = readCheckpointFreshnessTime(checkpoint);
        if (checkpointKey) {
          const currentByKey = latestByAccountKey.get(checkpointKey);
          const currentTimeByKey = currentByKey
            ? readCheckpointFreshnessTime(currentByKey)
            : -1;

          if (!currentByKey || checkpointTime >= currentTimeByKey) {
            latestByAccountKey.set(checkpointKey, checkpoint);
          }
        }

        if (checkpoint.accountId) {
          const current = latestByAccountId.get(checkpoint.accountId);
          const currentTime = current
            ? readCheckpointFreshnessTime(current)
            : -1;

          if (!current || checkpointTime >= currentTime) {
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
    })();
    const accountIds = accounts.map((account) => account.id);
    const transactionCounts = accountIds.length
      ? await prisma.transaction.groupBy({
          by: ["accountId"],
          where: {
            workspaceId,
            accountId: { in: accountIds },
            deletedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const transactionCountByAccountId = new Map(
      transactionCounts
        .filter((row) => row.accountId)
        .map((row) => [row.accountId as string, row._count._all])
    );
    const checkpointAccountIds = new Set(
      statementCheckpoints
        .map((checkpoint) => checkpoint.accountId)
        .filter((accountId): accountId is string => typeof accountId === "string" && accountId.trim().length > 0)
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
      if (transactionCount > 0 || checkpointAccountIds.has(account.id)) {
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
      if (transactionCount > 0 || checkpointAccountIds.has(account.id)) {
        return false;
      }

      return account.type === "bank" || account.type === "credit_card" || account.type === "line_of_credit";
    };

    const numberedInstitutionKeys = new Set(
      accounts
        .filter((account) => normalizeImportAccountNumber(account.accountNumber ?? null))
        .map((account) => importedAccountInstitutionKey(account))
        .filter(Boolean)
    );
    const visibleAccounts = accounts.filter(
      (account) => {
        const institutionKey = importedAccountInstitutionKey(account);
        return (
          !looksLikeReceiptImageFilenameAccount(account) &&
          !isOrphanUploadedAccountPlaceholder(account) &&
          !isTransientUploadedAccountPlaceholder(account) &&
          !(
            institutionKey &&
            numberedInstitutionKeys.has(institutionKey) &&
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
      let latestTime = -1;
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

        const checkpointTime = readCheckpointFreshnessTime(checkpoint);

        if (checkpointTime >= latestTime) {
          latestCheckpoint = checkpoint;
          latestTime = checkpointTime;
        }
      }

      return latestCheckpoint;
    };
    const accountsWithCheckpointBackfill = visibleAccounts.map((account) => {
      const latestCheckpoint = latestCheckpointForAccount(account);
      const checkpointPublishedSummary =
        latestCheckpoint?.sourceMetadata &&
        typeof latestCheckpoint.sourceMetadata === "object" &&
        !Array.isArray(latestCheckpoint.sourceMetadata) &&
        Array.isArray((latestCheckpoint.sourceMetadata as Record<string, unknown>).publishedAccountSummaries)
          ? findPublishedSummaryForAccount(
              account,
              (latestCheckpoint.sourceMetadata as Record<string, unknown>).publishedAccountSummaries as Array<Record<string, unknown>>
            )
          : null;
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
      const checkpointBalance =
        checkpointPublishedSummary && typeof checkpointPublishedSummary.balance === "string"
          ? checkpointPublishedSummary.balance
          :
        latestCheckpoint?.endingBalance !== null && latestCheckpoint?.endingBalance !== undefined
          ? latestCheckpoint.endingBalance.toString()
          : null;
      const effectiveAccountNumber = account.accountNumber ?? checkpointAccountNumber ?? null;
      const uploadedInstitution = resolveUploadedAccountInstitution(account.institution, checkpointBankHint, checkpointInstitution);
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
          ? formatUploadAccountDisplayName(
              shouldReplaceGenericImageFilename
                ? checkpointAccountName ?? effectiveInstitution ?? account.name
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
        balance: checkpointBalance ?? account.balance,
      };
    });
    const responseAccounts = accountsWithCheckpointBackfill.filter(
      (account) => !isOrphanUploadedAccountPlaceholder(account)
    );

    return NextResponse.json({
      accounts: responseAccounts.map((account) =>
        serializeAccount({
          ...account,
          transactionCount: transactionCountByAccountId.get(account.id) ?? 0,
        })
      ),
      accountRules,
      statementCheckpoints,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const existingAccount =
      existingAccounts.find((account) => account.type === type && normalizeAccountRuleKey(account.name, account.institution) === candidateKey) ??
      existingAccounts.find((account) => account.type === type && account.name === name && account.institution === institution) ??
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

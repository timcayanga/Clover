import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertAccountRule } from "@/lib/data-engine";
import { INVESTMENT_SUBTYPES, type InvestmentSubtype } from "@/lib/investments";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { isMissingAccountNumberColumnError, omitAccountNumberField } from "@/lib/account-column-compat";
import { ACCOUNT_TYPES } from "@/lib/account-types";
import { normalizeInstitutionCurrency } from "@/lib/import-parser";
import { deleteAccountsAndImportArtifacts } from "@/lib/account-deletion";
import { formatUploadAccountDisplayName } from "@/lib/account-display";
import { BANK_PRIORITY, normalizeBankName } from "@/lib/data-qa-banks";
import { hasCompatibleTable } from "@/lib/data-engine";

export const dynamic = "force-dynamic";

const resolveAccountRouteUserId = async () => {
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
  ...(columns.has("creditLimit") ? { creditLimit: true } : {}),
  ...(columns.has("creditLimitSource") ? { creditLimitSource: true } : {}),
  ...(columns.has("creditLimitUpdatedAt") ? { creditLimitUpdatedAt: true } : {}),
  ...(columns.has("creditPeriodStart") ? { creditPeriodStart: true } : {}),
  ...(columns.has("creditPeriodEnd") ? { creditPeriodEnd: true } : {}),
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

const resolveUploadedAccountInstitution = (
  currentInstitution?: string | null,
  checkpointBankHint?: string | null,
  checkpointInstitution?: string | null
) =>
  normalizeUploadBankName(currentInstitution) ??
  normalizeUploadBankName(checkpointBankHint) ??
  normalizeUploadBankName(checkpointInstitution) ??
  null;

const accountPatchSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).optional(),
  institution: z.string().nullable().optional(),
  accountNumber: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
  creditLimit: z.union([z.string(), z.number(), z.null()]).optional(),
  creditPeriodStart: z.union([z.string(), z.number(), z.null()]).optional(),
  creditPeriodEnd: z.union([z.string(), z.number(), z.null()]).optional(),
  investmentSubtype: z.string().nullable().optional(),
  investmentSymbol: z.string().nullable().optional(),
  investmentQuantity: z.union([z.string(), z.number(), z.null()]).optional(),
  investmentCostBasis: z.union([z.string(), z.number(), z.null()]).optional(),
  investmentPrincipal: z.union([z.string(), z.number(), z.null()]).optional(),
  investmentStartDate: z.union([z.string(), z.number(), z.null()]).optional(),
  investmentMaturityDate: z.union([z.string(), z.number(), z.null()]).optional(),
  investmentInterestRate: z.union([z.string(), z.number(), z.null()]).optional(),
  investmentMaturityValue: z.union([z.string(), z.number(), z.null()]).optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  currency: z.string().optional(),
  source: z.string().optional(),
  balance: z.union([z.string(), z.number(), z.null()]).optional(),
});

const serializeAccount = <T extends {
  accountNumber?: string | null;
  currency?: string | null;
  institution?: string | null;
  name?: string | null;
  favorite?: boolean;
  creditLimit?: { toString: () => string } | null;
  creditLimitSource?: string | null;
  creditLimitUpdatedAt?: Date | null;
  creditPeriodStart?: Date | null;
  creditPeriodEnd?: Date | null;
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
  creditLimit: account.creditLimit?.toString() ?? null,
  creditLimitSource: account.creditLimitSource ?? null,
  creditLimitUpdatedAt: account.creditLimitUpdatedAt?.toISOString() ?? null,
  creditPeriodStart: account.creditPeriodStart?.toISOString() ?? null,
  creditPeriodEnd: account.creditPeriodEnd?.toISOString() ?? null,
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

const normalizeInvestmentSubtype = (value: unknown): InvestmentSubtype | null => {
  const subtype = typeof value === "string" ? value.trim() : "";
  return INVESTMENT_SUBTYPES.includes(subtype as InvestmentSubtype) ? (subtype as InvestmentSubtype) : null;
};

const normalizeWhitespace = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

const extractLastFourDigits = (value?: string | null) => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
};

const normalizeAccountKey = (accountName?: string | null, institution?: string | null, accountNumber?: string | null) =>
  normalizeWhitespace(`${institution ?? ""} ${extractLastFourDigits(accountNumber) ?? normalizeWhitespace(String(accountName ?? ""))}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function GET(_request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveAccountRouteUserId();
    const { accountId } = await params;
    const compatibleColumns = await getCompatibleAccountColumns();

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: getCompatibleAccountSelect(compatibleColumns),
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, account.workspaceId);

    let latestCheckpoint:
      | {
          accountId: string | null;
          statementEndDate: Date | null;
          createdAt: Date;
          endingBalance: { toString: () => string } | null;
          sourceMetadata: unknown;
        }
      | null = null;
    if (await hasCompatibleTable("AccountStatementCheckpoint")) {
      const checkpoints = await prisma.accountStatementCheckpoint.findMany({
        where: { workspaceId: account.workspaceId },
        orderBy: [
          { statementEndDate: "desc" },
          { createdAt: "desc" },
        ],
      });
      const accountNumber = typeof account.accountNumber === "string" ? account.accountNumber : null;
      const accountKey = normalizeAccountKey(account.name, account.institution, accountNumber);
      let latestTime = -1;

      for (const checkpoint of checkpoints) {
        const sourceMetadata =
          checkpoint.sourceMetadata && typeof checkpoint.sourceMetadata === "object" && !Array.isArray(checkpoint.sourceMetadata)
            ? (checkpoint.sourceMetadata as Record<string, unknown>)
            : null;
        const checkpointKey = normalizeAccountKey(
          typeof sourceMetadata?.accountName === "string" ? sourceMetadata.accountName : null,
          typeof sourceMetadata?.institution === "string" ? sourceMetadata.institution : null,
          typeof sourceMetadata?.accountNumber === "string" ? sourceMetadata.accountNumber : null
        );
        const checkpointNumber = typeof sourceMetadata?.accountNumber === "string" ? sourceMetadata.accountNumber : null;
        const accountDigits = String(accountNumber ?? "").replace(/\D/g, "");
        const checkpointDigits = String(checkpointNumber ?? "").replace(/\D/g, "");
        const matchesAccount =
          checkpoint.accountId === accountId ||
          (accountKey !== "" && checkpointKey === accountKey) ||
          Boolean(accountDigits && checkpointDigits && accountDigits === checkpointDigits);

        if (!matchesAccount) {
          continue;
        }

        const checkpointTime = Math.max(
          checkpoint.statementEndDate?.getTime() ?? 0,
          checkpoint.createdAt.getTime()
        );
        if (checkpointTime >= latestTime) {
          latestTime = checkpointTime;
          latestCheckpoint = checkpoint;
        }
      }
    }

    const transactionCount = await prisma.transaction.count({
      where: {
        accountId,
        workspaceId: account.workspaceId,
        deletedAt: null,
      },
    });

    const latestCheckpointAccountNumber =
      latestCheckpoint?.sourceMetadata &&
      typeof latestCheckpoint.sourceMetadata === "object" &&
      !Array.isArray(latestCheckpoint.sourceMetadata) &&
      typeof (latestCheckpoint.sourceMetadata as Record<string, unknown>).accountNumber === "string"
        ? String((latestCheckpoint.sourceMetadata as Record<string, unknown>).accountNumber).trim()
        : null;
    const latestCheckpointAccountName =
      latestCheckpoint?.sourceMetadata &&
      typeof latestCheckpoint.sourceMetadata === "object" &&
      !Array.isArray(latestCheckpoint.sourceMetadata) &&
      typeof (latestCheckpoint.sourceMetadata as Record<string, unknown>).accountName === "string"
        ? String((latestCheckpoint.sourceMetadata as Record<string, unknown>).accountName).trim()
        : null;
    const latestCheckpointInstitution =
      latestCheckpoint?.sourceMetadata &&
      typeof latestCheckpoint.sourceMetadata === "object" &&
      !Array.isArray(latestCheckpoint.sourceMetadata) &&
      typeof (latestCheckpoint.sourceMetadata as Record<string, unknown>).institution === "string"
        ? String((latestCheckpoint.sourceMetadata as Record<string, unknown>).institution).trim()
        : null;
    const latestCheckpointBankHint =
      latestCheckpoint?.sourceMetadata &&
      typeof latestCheckpoint.sourceMetadata === "object" &&
      !Array.isArray(latestCheckpoint.sourceMetadata) &&
      typeof (latestCheckpoint.sourceMetadata as Record<string, unknown>).uploadBankHint === "string"
        ? String((latestCheckpoint.sourceMetadata as Record<string, unknown>).uploadBankHint).trim()
        : null;
    const latestCheckpointBalance =
      latestCheckpoint?.endingBalance !== null && latestCheckpoint?.endingBalance !== undefined
        ? latestCheckpoint.endingBalance.toString()
        : null;
    const effectiveAccountNumber = account.accountNumber ?? latestCheckpointAccountNumber ?? null;
    const uploadedInstitution = resolveUploadedAccountInstitution(
      account.institution,
      latestCheckpointBankHint,
      latestCheckpointInstitution
    );
    const effectiveInstitution = uploadedInstitution ?? account.institution ?? latestCheckpointInstitution ?? null;
    const effectiveSource =
      account.source === "upload"
        ? "upload"
        : latestCheckpoint && uploadedInstitution && effectiveAccountNumber
          ? "upload"
          : account.source;
    const effectiveAccountName =
      effectiveSource === "upload"
        ? formatUploadAccountDisplayName(
            latestCheckpointAccountName ?? account.name,
            effectiveInstitution,
            effectiveAccountNumber,
            account.type
          )
        : account.name;
    const effectiveBalance = latestCheckpointBalance ?? account.balance?.toString() ?? null;

    return NextResponse.json({
      account: serializeAccount({
        ...account,
        source: effectiveSource,
        name: effectiveAccountName,
        institution: effectiveInstitution,
        accountNumber: effectiveAccountNumber,
        balance: effectiveBalance,
        transactionCount,
      }),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveAccountRouteUserId();
    const { accountId } = await params;
    const payload = accountPatchSchema.parse(await request.json());
    const compatibleColumns = await getCompatibleAccountColumns();
    const normalizedCurrency = payload.currency
      ? normalizeInstitutionCurrency(
          payload.institution ?? payload.name ?? null,
          payload.currency.trim().toUpperCase(),
          payload.name ?? null
        ) ?? payload.currency.trim().toUpperCase()
      : undefined;

    await assertWorkspaceAccess(userId, payload.workspaceId);

    const accountUpdateData = {
        name: payload.name?.trim() ?? undefined,
        institution: payload.institution === undefined ? undefined : payload.institution?.trim() || null,
        ...(compatibleColumns.has("accountNumber")
          ? { accountNumber: payload.accountNumber === undefined ? undefined : payload.accountNumber?.trim() || null }
          : {}),
        favorite: payload.favorite === undefined ? undefined : payload.favorite,
        ...(compatibleColumns.has("creditLimit")
          ? {
              creditLimit:
                payload.creditLimit === undefined
                  ? undefined
                  : payload.creditLimit === null || payload.creditLimit === ""
                    ? null
                    : payload.creditLimit.toString(),
            }
          : {}),
        ...(compatibleColumns.has("creditLimitSource") && payload.creditLimit !== undefined
          ? { creditLimitSource: payload.creditLimit === null || payload.creditLimit === "" ? null : "manual" }
          : {}),
        ...(compatibleColumns.has("creditLimitUpdatedAt") && payload.creditLimit !== undefined
          ? { creditLimitUpdatedAt: new Date() }
          : {}),
        ...(compatibleColumns.has("creditPeriodStart")
          ? { creditPeriodStart: payload.creditPeriodStart === undefined ? undefined : parseNullableDate(payload.creditPeriodStart) }
          : {}),
        ...(compatibleColumns.has("creditPeriodEnd")
          ? { creditPeriodEnd: payload.creditPeriodEnd === undefined ? undefined : parseNullableDate(payload.creditPeriodEnd) }
          : {}),
        investmentSubtype:
          payload.investmentSubtype === undefined ? undefined : normalizeInvestmentSubtype(payload.investmentSubtype),
        investmentSymbol: payload.investmentSymbol === undefined ? undefined : payload.investmentSymbol?.trim() || null,
        investmentQuantity:
          payload.investmentQuantity === undefined ? undefined : parseNullableDecimal(payload.investmentQuantity),
        investmentCostBasis:
          payload.investmentCostBasis === undefined
            ? undefined
            : payload.investmentCostBasis === null || payload.investmentCostBasis === ""
              ? null
              : payload.investmentCostBasis.toString(),
        investmentPrincipal:
          payload.investmentPrincipal === undefined ? undefined : parseNullableDecimal(payload.investmentPrincipal),
        investmentStartDate:
          payload.investmentStartDate === undefined ? undefined : parseNullableDate(payload.investmentStartDate),
        investmentMaturityDate:
          payload.investmentMaturityDate === undefined ? undefined : parseNullableDate(payload.investmentMaturityDate),
        investmentInterestRate:
          payload.investmentInterestRate === undefined ? undefined : parseNullableDecimal(payload.investmentInterestRate),
        investmentMaturityValue:
          payload.investmentMaturityValue === undefined ? undefined : parseNullableDecimal(payload.investmentMaturityValue),
        type: payload.type,
        currency: normalizedCurrency,
        source: payload.source,
        balance: payload.balance === undefined ? undefined : payload.balance === null || payload.balance === "" ? null : payload.balance.toString(),
      };

    let account;
    try {
      account = await prisma.account.update({
        where: { id: accountId },
        data: accountUpdateData,
        select: getCompatibleAccountSelect(compatibleColumns),
      });
    } catch (error) {
      if (!isMissingAccountNumberColumnError(error)) {
        throw error;
      }

      account = await prisma.account.update({
        where: { id: accountId },
        data: omitAccountNumberField(accountUpdateData),
        select: getCompatibleAccountSelect(compatibleColumns),
      });
    }

    void capturePostHogServerEvent("account_updated", userId, {
      workspace_id: account.workspaceId,
      account_id: account.id,
      account_name: account.name,
      account_institution: account.institution,
      account_type: account.type,
      account_currency: account.currency,
      account_source: account.source,
      is_cash: account.type === "cash",
    });

    void upsertAccountRule({
      workspaceId: account.workspaceId,
      accountId: account.id,
      accountName: account.name,
      institution: account.institution,
      accountType: account.type,
      source: "manual_account_update",
      confidence: 100,
    }).catch(() => null);

    return NextResponse.json({ account: serializeAccount(account) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveAccountRouteUserId();
    const { accountId } = await params;
    const compatibleColumns = await getCompatibleAccountColumns();

    const existingAccount = await prisma.account.findUnique({
      where: { id: accountId },
      select: getCompatibleAccountSelect(compatibleColumns),
    });

    if (!existingAccount) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    await assertWorkspaceAccess(userId, existingAccount.workspaceId);

    const deletionResult = await prisma.$transaction(async (tx) => {
      return deleteAccountsAndImportArtifacts(tx, {
        workspaceId: existingAccount.workspaceId,
        accountIds: [accountId],
      });
    });

    return NextResponse.json({ account: serializeAccount(existingAccount), deletedTransactions: deletionResult.transactionsDeleted });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to delete account.",
      },
      { status: 400 }
    );
  }
}

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

const accountPatchSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).optional(),
  institution: z.string().nullable().optional(),
  accountNumber: z.string().nullable().optional(),
  favorite: z.boolean().optional(),
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

    return NextResponse.json({
      account: serializeAccount(account),
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

    const mergeTarget = await prisma.account.findFirst({
      where: {
        workspaceId: existingAccount.workspaceId,
        id: { not: accountId },
        name: existingAccount.name,
        institution: existingAccount.institution,
        type: existingAccount.type,
      },
      select: {
        id: true,
      },
    });
    const shouldMergeWithTarget = existingAccount.source !== "upload" && Boolean(mergeTarget);

    await prisma.$transaction(async (tx) => {
      if (shouldMergeWithTarget && mergeTarget) {
        await tx.transaction.updateMany({
          where: { accountId },
          data: { accountId: mergeTarget.id },
        });

        await tx.importFile.updateMany({
          where: { accountId },
          data: { accountId: mergeTarget.id },
        });

        await tx.accountStatementCheckpoint.updateMany({
          where: { accountId },
          data: { accountId: mergeTarget.id },
        });

        await tx.accountRule.updateMany({
          where: { accountId },
          data: { accountId: mergeTarget.id },
        });
      }

      // Let the database relations handle cascade / set-null cleanup for the normal delete path.
      await tx.account.delete({
        where: { id: accountId },
      });
    });

    return NextResponse.json({ account: serializeAccount(existingAccount) });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to delete account.",
      },
      { status: 400 }
    );
  }
}

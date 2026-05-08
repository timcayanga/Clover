import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { hasCompatibleTable, loadAccountRules, normalizeAccountRuleKey, upsertAccountRule } from "@/lib/data-engine";
import { INVESTMENT_SUBTYPES, isFixedIncomeInvestmentSubtype, type InvestmentSubtype } from "@/lib/investments";
import { countNonCashAccounts } from "@/lib/plan-access";
import { ensureWorkspaceCashAccount, seedWorkspaceDefaults } from "@/lib/starter-data";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getEffectiveUserLimits } from "@/lib/user-limits";
import { capturePostHogServerEvent } from "@/lib/analytics";
import { isMissingAccountNumberColumnError, omitAccountNumberField } from "@/lib/account-column-compat";
import { isSupportedAccountType } from "@/lib/account-types";
import { normalizeInstitutionCurrency } from "@/lib/import-parser";

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

export async function GET(request: Request) {
  try {
    const userId = await resolveAccountsRouteUserId();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    const compatibleColumns = await getCompatibleAccountColumns();

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
      for (const checkpoint of checkpoints) {
        if (!checkpoint.accountId) {
          continue;
        }

        const current = latestByAccountId.get(checkpoint.accountId);
        const checkpointTime = Math.max(
          checkpoint.statementEndDate?.getTime() ?? 0,
          checkpoint.createdAt.getTime()
        );
        const currentTime = current
          ? Math.max(
              current.statementEndDate?.getTime() ?? 0,
              current.createdAt.getTime()
            )
          : -1;

        if (!current || checkpointTime >= currentTime) {
          latestByAccountId.set(checkpoint.accountId, checkpoint);
        }
      }

      return Array.from(latestByAccountId.values()).map((checkpoint) => ({
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

    return NextResponse.json({ accounts: accounts.map((account) => serializeAccount(account)), accountRules, statementCheckpoints });
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
      const nonCashAccountCount = countNonCashAccounts(existingAccounts);

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

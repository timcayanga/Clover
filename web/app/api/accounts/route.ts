import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { NextResponse } from "next/server";
import { hasCompatibleTable, loadAccountRules, normalizeAccountRuleKey, upsertAccountRule } from "@/lib/data-engine";
import { INVESTMENT_SUBTYPES, type InvestmentSubtype } from "@/lib/investments";
import { countNonCashAccounts } from "@/lib/plan-access";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { getEffectiveUserLimits } from "@/lib/user-limits";

export const dynamic = "force-dynamic";

const serializeAccount = <T extends {
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

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const accounts = await prisma.account.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
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

    return NextResponse.json({ accounts, accountRules, statementCheckpoints });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const workspaceId = String(body?.workspaceId || "");
    const name = String(body?.name || "").trim();
    const institution = body?.institution ? String(body.institution) : null;
    const type = body?.type || "bank";
    const investmentSubtype = normalizeInvestmentSubtype(body?.investmentSubtype);
    const investmentSymbol = body?.investmentSymbol ? String(body.investmentSymbol).trim() || null : null;
    const investmentQuantity = parseNullableDecimal(body?.investmentQuantity);
    const investmentCostBasis = parseNullableDecimal(body?.investmentCostBasis);
    const investmentPrincipal = parseNullableDecimal(body?.investmentPrincipal);
    const investmentStartDate = parseNullableDate(body?.investmentStartDate);
    const investmentMaturityDate = parseNullableDate(body?.investmentMaturityDate);
    const investmentInterestRate = parseNullableDecimal(body?.investmentInterestRate);
    const investmentMaturityValue = parseNullableDecimal(body?.investmentMaturityValue);
    const balance = parseNullableDecimal(body?.balance);

    if (!workspaceId || !name) {
      return NextResponse.json({ error: "workspaceId and name are required" }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);

    const existingAccounts = await prisma.account.findMany({
      where: { workspaceId },
    });
    const candidateKey = normalizeAccountRuleKey(name, institution);
    const existingAccount =
      existingAccounts.find((account) => account.type === type && normalizeAccountRuleKey(account.name, account.institution) === candidateKey) ??
      existingAccounts.find((account) => account.type === type && account.name === name && account.institution === institution) ??
      null;
    if (existingAccount) {
      return NextResponse.json({
        account: serializeAccount(existingAccount),
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

    const account = await prisma.account.create({
      data: {
        workspaceId,
        name,
        institution,
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
        currency: body?.currency ? String(body.currency).toUpperCase() : "PHP",
        source: body?.source ? String(body.source) : "upload",
        balance,
      },
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
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

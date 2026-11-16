import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
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
  currency: normalizeInstitutionCurrency(account.institution ?? null, account.currency ?? null, account.name ?? null) ?? account.currency ?? "PHP",
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

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const userId = await resolveAccountRouteUserId();
    const { accountId: sourceAccountId } = await params;
    const payload = await request.json().catch(() => null);
    const workspaceId = String(payload?.workspaceId || "").trim();
    const targetAccountId = String(payload?.targetAccountId || "").trim();

    if (!workspaceId || !sourceAccountId || !targetAccountId) {
      return NextResponse.json({ error: "workspaceId, source account, and target account are required" }, { status: 400 });
    }

    if (sourceAccountId === targetAccountId) {
      return NextResponse.json({ error: "Choose a different account to merge into." }, { status: 400 });
    }

    await assertWorkspaceAccess(userId, workspaceId);
    const compatibleColumns = await getCompatibleAccountColumns();

    const [sourceAccount, targetAccount] = await Promise.all([
      prisma.account.findFirst({
        where: { id: sourceAccountId, workspaceId },
        select: getCompatibleAccountSelect(compatibleColumns),
      }),
      prisma.account.findFirst({
        where: { id: targetAccountId, workspaceId },
        select: getCompatibleAccountSelect(compatibleColumns),
      }),
    ]);

    if (!sourceAccount || !targetAccount) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.importFile.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.accountStatementCheckpoint.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.documentImport.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.receiptDocument.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.investmentSnapshot.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.investmentHolding.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.recurringPattern.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.financialCommitment.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.accountRule.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.investmentPurchase.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.investmentDividend.updateMany({
        where: { accountId: sourceAccountId },
        data: { accountId: targetAccountId },
      });

      await tx.account.delete({
        where: { id: sourceAccountId },
      });
    });

    return NextResponse.json({ account: serializeAccount(targetAccount) });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to merge accounts.",
      },
      { status: 400 }
    );
  }
}

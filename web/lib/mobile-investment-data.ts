import { prisma } from "./prisma";
import { hasCompatibleTable } from "./data-engine";
import {
  projectPortfolio,
  type PortfolioAccount,
  type PortfolioSnapshot,
  type RecordedValuation,
} from "../../shared/investment-portfolio";

/** Authorized Profile only. No raw import payloads or full account numbers leave this reader. */
export async function loadMobileInvestments(workspaceId: string) {
  const rows = await prisma.account.findMany({
    where: {
      workspaceId,
      OR: [
        { type: "investment" },
        { name: { contains: "gsave", mode: "insensitive" } },
        { institution: { contains: "gsave", mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
    take: 1001,
    select: {
      id: true,
      name: true,
      institution: true,
      type: true,
      currency: true,
      balance: true,
      source: true,
      updatedAt: true,
      investmentSubtype: true,
      investmentSymbol: true,
      investmentQuantity: true,
      investmentCostBasis: true,
      investmentPrincipal: true,
      investmentStartDate: true,
      investmentMaturityDate: true,
      investmentInterestRate: true,
      investmentMaturityValue: true,
    },
  });
  const accounts = rows
    .slice(0, 1000)
    .map((a) => ({
      ...a,
      balance: a.balance?.toString() ?? null,
      updatedAt: a.updatedAt.toISOString(),
      investmentQuantity: a.investmentQuantity?.toString() ?? null,
      investmentCostBasis: a.investmentCostBasis?.toString() ?? null,
      investmentPrincipal: a.investmentPrincipal?.toString() ?? null,
      investmentInterestRate: a.investmentInterestRate?.toString() ?? null,
      investmentMaturityValue: a.investmentMaturityValue?.toString() ?? null,
      investmentStartDate: a.investmentStartDate?.toISOString() ?? null,
      investmentMaturityDate: a.investmentMaturityDate?.toISOString() ?? null,
    }));
  const snapshots: PortfolioSnapshot[] =
    (await hasCompatibleTable("InvestmentSnapshot")) &&
    (await hasCompatibleTable("InvestmentHolding"))
      ? (
          await prisma.investmentSnapshot.findMany({
            where: {
              workspaceId,
              accountId: { in: accounts.map((a) => a.id) },
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 201,
            select: {
              id: true,
              accountId: true,
              snapshotDate: true,
              updatedAt: true,
              currency: true,
              totalValue: true,
              account: { select: { institution: true } },
              holdings: {
                select: {
                  id: true,
                  assetName: true,
                  assetSymbol: true,
                  assetType: true,
                  currency: true,
                  quantity: true,
                  currentValue: true,
                  marketValue: true,
                  costBasis: true,
                },
              },
            },
          })
        ).map((s) => ({
          id: s.id,
          accountId: s.accountId,
          institution: s.account?.institution ?? null,
          date: (s.snapshotDate ?? s.updatedAt).toISOString(),
          currency: s.currency,
          totalValue: s.totalValue?.toString() ?? null,
          holdings: s.holdings.map((h) => ({
            id: h.id,
            name: h.assetName,
            symbol: h.assetSymbol,
            subtype: h.assetType,
            currency: h.currency,
            quantity: h.quantity?.toString() ?? null,
            value: (h.currentValue ?? h.marketValue)?.toString() ?? null,
            cost: h.costBasis?.toString() ?? null,
          })),
        }))
      : [];
  const history: RecordedValuation[] = [];
  for (const s of snapshots.slice(0, 200))
    if (s.accountId && s.totalValue !== null)
      history.push({
        accountId: s.accountId,
        date: s.date,
        currency: s.currency,
        value: Number(s.totalValue),
      });
  for (const a of accounts)
    if (a.balance !== null && !snapshots.some((s) => s.accountId === a.id))
      history.push({
        accountId: a.id,
        date: a.updatedAt,
        currency: a.currency,
        value: Number(a.balance),
      });
  return {
    accounts,
    holdings: projectPortfolio(
      accounts as PortfolioAccount[],
      snapshots.slice(0, 200),
    ),
    history,
    limited: rows.length > 1000 || snapshots.length > 200,
  };
}

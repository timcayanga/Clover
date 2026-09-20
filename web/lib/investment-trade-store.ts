import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { isFixedIncomeInvestmentSubtype } from "./investments";
import {
  tradeSigns,
  type InvestmentTradeInput,
} from "./investment-trade-input";
type Trade = {
  id: string;
  accountId: string;
  positionId?: string | null;
  assetName: string;
  tradedAt: Date;
  kind: InvestmentTradeInput["kind"];
  quantity: Prisma.Decimal;
  amount: Prisma.Decimal;
  costBasis: Prisma.Decimal;
  currency: string;
  note: string;
  revision: number;
  deletedAt: Date | null;
};
export async function listInvestmentTrades(accountId: string, page: number, positionId?:string) {
  const items = await prisma.$queryRaw<
    Trade[]
  >(Prisma.sql`SELECT * FROM "InvestmentTrade" WHERE "accountId"=${accountId} AND "deletedAt" IS NULL ${positionId?Prisma.sql`AND "positionId"=${positionId}`:Prisma.empty} ORDER BY "tradedAt" DESC,"id" DESC LIMIT 30 OFFSET ${(page - 1) * 30}`);
  const totals = await prisma.$queryRaw<
    { count: bigint }[]
  >(Prisma.sql`SELECT COUNT(*) as count FROM "InvestmentTrade" WHERE "accountId"=${accountId} AND "deletedAt" IS NULL ${positionId?Prisma.sql`AND "positionId"=${positionId}`:Prisma.empty}`);
  return {
    items: items.map((r) => ({
      ...r,
      date: r.tradedAt.toISOString().slice(0, 10),
      quantity: String(r.quantity),
      amount: String(r.amount),
      costBasis: String(r.costBasis),
    })),
    totalCount: Number(totals[0].count),
    page,
  };
}
export async function saveInvestmentTrade(
  workspaceId: string,
  accountId: string,
  actorUserId: string,
  input: InvestmentTradeInput,
  remove = false,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id"=${accountId} AND "workspaceId"=${workspaceId} FOR UPDATE`;
    const account = await tx.account.findFirst({
      where: { id: accountId, workspaceId, type: "investment" },
      select: {
        id: true,
        currency: true,
        investmentSubtype: true,
        investmentQuantity: true,
        investmentPrincipal: true,
        investmentCostBasis: true,
      },
    });
    if (!account)
      throw new Error("Choose an investment account in this Profile.");
    const assets = await tx.investmentHolding.findMany({
      where: { accountId, workspaceId },
      distinct: ["assetName"],
      select: { assetName: true },
      take: 2,
    });
    if (assets.length > 1)
      throw new Error(
        "This account contains multiple statement assets. Record the trade in a separate account for this holding so unrelated units are not combined.",
      );
    const other = await tx.$queryRaw<
      { assetName: string }[]
    >`SELECT "assetName" FROM "InvestmentTrade" WHERE "accountId"=${accountId} AND "deletedAt" IS NULL AND "positionId" IS NULL AND "id"<>${input.id} LIMIT 1`;
    const recordedAsset = other[0]?.assetName ?? assets[0]?.assetName;
    if (
      recordedAsset &&
      recordedAsset.trim().toLowerCase() !==
        input.assetName.trim().toLowerCase()
    )
      throw new Error(
        `Use the recorded asset name: ${recordedAsset}. Keep different holdings in separate accounts.`,
      );
    const records = await tx.$queryRaw<
      Trade[]
    >`SELECT * FROM "InvestmentTrade" WHERE "id"=${input.id} FOR UPDATE`;
    const prior = records[0];
    if(prior?.positionId)throw new Error("Edit this trade from its asset’s trading history.");
    if (prior && prior.accountId !== accountId)
      throw new Error("Trade is not in this account.");
    if (prior?.deletedAt)
      throw new Error("This trade was deleted. Reload trading history.");
    // Identical retries are idempotent; conflicting revisions must be reviewed again.
    const same =
      prior &&
      prior.assetName === input.assetName &&
      prior.tradedAt.toISOString().slice(0, 10) === input.date &&
      prior.kind === input.kind &&
      prior.quantity.equals(input.quantity) &&
      prior.amount.equals(input.amount) &&
      prior.costBasis.equals(input.costBasis) &&
      prior.note === input.note;
    if (!remove && same && prior.revision === input.revision + 1)
      return { ok: true };
    if ((prior?.revision ?? 0) !== input.revision || (remove && !prior))
      throw new Error("Trade changed elsewhere. Reload it before saving.");
    const oldSign = prior ? tradeSigns(prior.kind) : 0,
      newSign = remove ? 0 : tradeSigns(input.kind);
    const qtyDelta = new Prisma.Decimal(input.quantity)
      .mul(newSign)
      .minus(new Prisma.Decimal(prior?.quantity ?? 0).mul(oldSign));
    const costDelta = new Prisma.Decimal(input.costBasis)
      .mul(newSign)
      .minus(new Prisma.Decimal(prior?.costBasis ?? 0).mul(oldSign));
    const fixed = isFixedIncomeInvestmentSubtype(account.investmentSubtype);
    const currentCost = fixed
      ? account.investmentPrincipal
      : account.investmentCostBasis;
    const quantity = new Prisma.Decimal(account.investmentQuantity ?? 0).plus(
      qtyDelta,
    );
    const cost = new Prisma.Decimal(currentCost ?? 0).plus(costDelta);
    if (quantity.lessThan(0) || cost.lessThan(0))
      throw new Error(
        "This trade exceeds recorded units or cost basis. Check the account’s opening values and trade details.",
      );
    await tx.account.update({
      where: { id: accountId },
      select: { id: true },
      data: {
        investmentQuantity: quantity,
        ...(fixed
          ? { investmentPrincipal: cost }
          : { investmentCostBasis: cost }),
      },
    });
    const date = new Date(input.date);
    const deleted = remove ? new Date() : null;
    if (prior)
      await tx.$executeRaw`UPDATE "InvestmentTrade" SET "assetName"=${input.assetName},"tradedAt"=${date},"kind"=${input.kind},"quantity"=${input.quantity}::numeric,"amount"=${input.amount}::numeric,"costBasis"=${input.costBasis}::numeric,"note"=${input.note},"revision"="revision"+1,"deletedAt"=${deleted},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${input.id}`;
    else
      await tx.$executeRaw`INSERT INTO "InvestmentTrade" ("id","accountId","assetName","tradedAt","kind","quantity","amount","costBasis","currency","note") VALUES (${input.id},${accountId},${input.assetName},${date},${input.kind},${input.quantity}::numeric,${input.amount}::numeric,${input.costBasis}::numeric,${account.currency},${input.note})`;
    await tx.$executeRaw`INSERT INTO "InvestmentTradeRevision" ("id","tradeId","actorUserId","before","after") VALUES (${randomUUID()},${input.id},${actorUserId},${JSON.stringify(prior ?? null)}::jsonb,${JSON.stringify({ ...input, deleted: remove, accountQuantity: String(quantity), accountCostBasis: String(cost) })}::jsonb)`;
    return { ok: true };
  });
}

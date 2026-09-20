import { NativeInputError } from "./native-input-error";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "./prisma";
import { investmentTradeInput, tradeSigns } from "./investment-trade-input";
import { getCurrencyCatalogCodes } from "./currencies";
import { INVESTMENT_SUBTYPES } from "./investments";
const decimal = (places: number) =>
  z.string().regex(new RegExp(`^\\d{1,10}(\\.\\d{1,${places}})?$`));
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const positionInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().min(0),
    assetName: z.string().trim().min(1).max(120),
    symbol: z.string().trim().max(30),
    subtype: z.enum(INVESTMENT_SUBTYPES),
    currency: z.string().regex(/^[A-Z]{3}$/),
    openingDate: date,
    openingQuantity: decimal(8),
    openingCostBasis: decimal(2),
    value: decimal(2).nullable(),
    valueDate: date.nullable(),
    sourceHoldingId: z.string().max(100).nullable(),
  })
  .strict()
  .refine((v) => (v.value === null) === (v.valueDate === null), {
    message: "Record both a value and its date, or leave both empty.",
  });
export const positionTradeInput = investmentTradeInput.extend({
  positionId: z.string().uuid(),
  counterpartPositionId: z.string().uuid().optional(),
});
type Position = {
  id: string;
  accountId: string;
  assetKey: string;
  assetName: string;
  symbol: string | null;
  subtype: string;
  currency: string;
  openingDate: Date;
  openingQuantity: Prisma.Decimal;
  openingCostBasis: Prisma.Decimal;
  quantity: Prisma.Decimal;
  costBasis: Prisma.Decimal;
  value: Prisma.Decimal | null;
  valueDate: Date | null;
  sourceHoldingId: string | null;
  revision: number;
  updatedAt: Date;
  accountName?: string;
  institution?: string | null;
};
type Trade = {
  id: string;
  accountId: string;
  positionId: string;
  transferPairId: string | null;
  assetName: string;
  kind: z.infer<typeof investmentTradeInput>["kind"];
  tradedAt: Date;
  quantity: Prisma.Decimal;
  amount: Prisma.Decimal;
  costBasis: Prisma.Decimal;
  currency: string;
  note: string;
  revision: number;
  deletedAt: Date | null;
};
const serialize = (p: Position) => ({
  ...p,
  openingDate: p.openingDate.toISOString().slice(0, 10),
  openingQuantity: String(p.openingQuantity),
  openingCostBasis: String(p.openingCostBasis),
  quantity: String(p.quantity),
  costBasis: String(p.costBasis),
  value: p.value === null ? null : String(p.value),
  valueDate: p.valueDate?.toISOString().slice(0, 10) ?? null,
  updatedAt: p.updatedAt.toISOString(),
});
export async function listInvestmentPositions(
  workspaceId: string,
  accountId?: string,
) {
  const rows = await prisma.$queryRaw<Position[]>(
    Prisma.sql`SELECT p.*,a."name" AS "accountName",a."institution" FROM "InvestmentPosition" p JOIN "Account" a ON a."id"=p."accountId" WHERE a."workspaceId"=${workspaceId} ${accountId ? Prisma.sql`AND p."accountId"=${accountId}` : Prisma.empty} ORDER BY p."assetName",p."id" LIMIT 1000`,
  );
  return rows.map(serialize);
}
export async function saveInvestmentPosition(
  workspaceId: string,
  accountId: string,
  actorUserId: string,
  input: z.infer<typeof positionInput>,
) {
  if (!getCurrencyCatalogCodes().some((code) => code === input.currency))
    throw new NativeInputError("Choose a supported currency.");
  return prisma.$transaction(async (tx) => {
    const [account] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "Account" WHERE "id"=${accountId} AND "workspaceId"=${workspaceId} AND "type"='investment' FOR UPDATE`;
    if (!account)
      throw new NativeInputError(
        "Choose an investment account in this Profile.",
      );
    const [prior] = await tx.$queryRaw<
      Position[]
    >`SELECT * FROM "InvestmentPosition" WHERE "id"=${input.id} FOR UPDATE`;
    if (prior && prior.accountId !== accountId)
      throw new NativeInputError("This asset belongs to another account.");
    if (prior && prior.revision === input.revision + 1) {
      const recorded = serialize(prior);
      if (
        Object.entries(input).every(([k, v]) => {
          if (k === "revision") return true;
          if (k === "symbol") return (recorded.symbol ?? "") === v;
          if (["openingQuantity", "openingCostBasis", "value"].includes(k)) {
            const current = recorded[k as "openingQuantity" | "openingCostBasis" | "value"];
            return current === null || v === null ? current === v : new Prisma.Decimal(current).equals(String(v));
          }
          return recorded[k as keyof typeof recorded] === v;
        })
      )
        return { ok: true, positionId: input.id };
    }
    if ((prior?.revision ?? 0) !== input.revision)
      throw new NativeInputError(
        "Asset changed elsewhere. Reload it before saving.",
      );
    if (prior && prior.sourceHoldingId !== input.sourceHoldingId)
      throw new NativeInputError(
        "The original source of a tracked asset cannot be replaced.",
      );
    if (input.sourceHoldingId && !prior) {
      const source = await tx.investmentHolding.findFirst({
        where: { id: input.sourceHoldingId, accountId, workspaceId },
        select: { id: true },
      });
      if (!source)
        throw new NativeInputError(
          "The source holding is not in this investment account.",
        );
    }
    const assetKey = (input.symbol || input.assetName)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    const [duplicate] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT "id" FROM "InvestmentPosition" WHERE "accountId"=${accountId} AND "assetKey"=${assetKey} AND "currency"=${input.currency} AND "id"<>${input.id}`;
    if (duplicate)
      throw new NativeInputError(
        "This asset is already tracked in this account. Open its existing details instead.",
      );
    const [trades] = await tx.$queryRaw<
      { count: bigint }[]
    >`SELECT COUNT(*) AS count FROM "InvestmentTrade" WHERE "positionId"=${input.id}`;
    if (
      prior &&
      Number(trades.count) > 0 &&
      (prior.assetKey !== assetKey ||
        prior.currency !== input.currency ||
        prior.subtype !== input.subtype ||
        prior.openingDate.toISOString().slice(0, 10) !== input.openingDate ||
        !prior.openingQuantity.equals(input.openingQuantity) ||
        !prior.openingCostBasis.equals(input.openingCostBasis))
    )
      throw new NativeInputError(
        "An asset with trading history must keep its identity, currency and opening values. Record changes as trades.",
      );
    if (prior) {
      await tx.$executeRaw`UPDATE "InvestmentPosition" SET "assetKey"=${assetKey},"assetName"=${input.assetName},"symbol"=${input.symbol || null},"subtype"=${input.subtype},"currency"=${input.currency},"openingDate"=${new Date(input.openingDate)},"openingQuantity"=${input.openingQuantity}::numeric,"openingCostBasis"=${input.openingCostBasis}::numeric,"quantity"=${Number(trades.count) ? String(prior.quantity) : input.openingQuantity}::numeric,"costBasis"=${Number(trades.count) ? String(prior.costBasis) : input.openingCostBasis}::numeric,"value"=${input.value}::numeric,"valueDate"=${input.valueDate ? new Date(input.valueDate) : null},"revision"="revision"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${input.id}`;
    } else {
      await tx.$executeRaw`INSERT INTO "InvestmentPosition" ("id","accountId","assetKey","assetName","symbol","subtype","currency","openingDate","openingQuantity","openingCostBasis","quantity","costBasis","value","valueDate","sourceHoldingId") VALUES (${input.id},${accountId},${assetKey},${input.assetName},${input.symbol || null},${input.subtype},${input.currency},${new Date(input.openingDate)},${input.openingQuantity}::numeric,${input.openingCostBasis}::numeric,${input.openingQuantity}::numeric,${input.openingCostBasis}::numeric,${input.value}::numeric,${input.valueDate ? new Date(input.valueDate) : null},${input.sourceHoldingId})`;
    }
    await tx.$executeRaw`INSERT INTO "InvestmentPositionRevision" ("id","positionId","actorUserId","before","after") VALUES (${randomUUID()},${input.id},${actorUserId},${JSON.stringify(prior ?? null)}::jsonb,${JSON.stringify(input)}::jsonb)`;
    return { ok: true, positionId: input.id };
  });
}
async function recalculate(tx: Prisma.TransactionClient, position: Position) {
  const trades = await tx.$queryRaw<
    Trade[]
  >`SELECT * FROM "InvestmentTrade" WHERE "positionId"=${position.id} AND "deletedAt" IS NULL ORDER BY "tradedAt","id"`;
  let quantity = new Prisma.Decimal(position.openingQuantity),
    cost = new Prisma.Decimal(position.openingCostBasis);
  for (const trade of trades) {
    if (trade.tradedAt < position.openingDate)
      throw new NativeInputError(
        "Trade date must be on or after this asset’s opening date.",
      );
    const sign = tradeSigns(trade.kind);
    quantity = quantity.plus(trade.quantity.mul(sign));
    cost = cost.plus(trade.costBasis.mul(sign));
    if (quantity.lessThan(0) || cost.lessThan(0))
      throw new NativeInputError(
        "This change would exceed the asset’s units or cost basis. Check its opening values and trade dates.",
      );
  }
  await tx.$executeRaw`UPDATE "InvestmentPosition" SET "quantity"=${String(quantity)}::numeric,"costBasis"=${String(cost)}::numeric,"revision"="revision"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${position.id}`;
}
export async function savePositionTrade(
  workspaceId: string,
  accountId: string,
  actorUserId: string,
  input: z.infer<typeof positionTradeInput>,
  remove = false,
) {
  return prisma.$transaction(async (tx) => {
    // Profile-level serialization gives paired transfers a stable lock order.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`position-trades:${workspaceId}`}))`;
    const ids = [
      input.positionId,
      ...(input.counterpartPositionId ? [input.counterpartPositionId] : []),
    ];
    const [prior] = await tx.$queryRaw<
      Trade[]
    >`SELECT * FROM "InvestmentTrade" WHERE "id"=${input.id} FOR UPDATE`;
    if (
      prior &&
      (prior.accountId !== accountId || prior.positionId !== input.positionId)
    )
      throw new NativeInputError("This trade belongs to another asset.");
    const paired = prior?.transferPairId
      ? await tx.$queryRaw<
          Trade[]
        >`SELECT * FROM "InvestmentTrade" WHERE "transferPairId"=${prior.transferPairId} FOR UPDATE`
      : [];
    ids.push(...paired.map((t) => t.positionId));
    const positions = await tx.$queryRaw<Position[]>(
      Prisma.sql`SELECT p.* FROM "InvestmentPosition" p JOIN "Account" a ON a."id"=p."accountId" WHERE a."workspaceId"=${workspaceId} AND p."id" IN (${Prisma.join([...new Set(ids)])}) ORDER BY p."id" FOR UPDATE OF p`,
    );
    const position = positions.find((p) => p.id === input.positionId);
    if (
      !position ||
      position.accountId !== accountId ||
      positions.length !== new Set(ids).size
    )
      throw new NativeInputError("Choose assets in this Profile.");
    if (input.assetName !== position.assetName && !remove)
      throw new NativeInputError("Use the selected asset’s recorded name.");
    if (prior?.deletedAt) {
      if (remove && prior.revision === input.revision + 1) return { ok: true };
      throw new NativeInputError(
        "This trade was deleted. Reload trading history.",
      );
    }
    const same =
      prior &&
      prior.assetName === input.assetName &&
      prior.tradedAt.toISOString().slice(0, 10) === input.date &&
      prior.kind === input.kind &&
      prior.quantity.equals(input.quantity) &&
      prior.amount.equals(input.amount) &&
      prior.costBasis.equals(input.costBasis) &&
      prior.note === input.note;
    if (!remove && same && prior.revision === input.revision + 1) {
      if (
        input.counterpartPositionId &&
        !paired.some((t) => t.positionId === input.counterpartPositionId)
      )
        throw new NativeInputError(
          "Transfer destination differs from the saved trade.",
        );
      return { ok: true };
    }
    if ((prior?.revision ?? 0) !== input.revision || (remove && !prior))
      throw new NativeInputError(
        "Trade changed elsewhere. Reload it before saving.",
      );
    if (prior?.transferPairId && !remove)
      throw new NativeInputError(
        "Delete the linked transfer first, then record its replacement. Both sides must stay together.",
      );
    if (prior && input.counterpartPositionId && !remove)
      throw new NativeInputError(
        "Create a new linked transfer instead of converting an existing trade.",
      );
    let counterpart: Position | undefined;
    if (input.counterpartPositionId) {
      counterpart = positions.find((p) => p.id === input.counterpartPositionId);
      if (
        !counterpart ||
        counterpart.id === position.id ||
        counterpart.accountId === position.accountId ||
        counterpart.currency !== position.currency ||
        counterpart.assetKey !== position.assetKey ||
        counterpart.subtype !== position.subtype ||
        !input.kind.startsWith("transfer_")
      )
        throw new NativeInputError(
          "Choose the same asset and currency in a different investment account.",
        );
    }
    const changes: Pick<
      Trade,
      | "id"
      | "accountId"
      | "positionId"
      | "assetName"
      | "currency"
      | "kind"
      | "transferPairId"
    >[] = remove
      ? paired.length
        ? paired
        : [prior!]
      : [
          {
            ...input,
            accountId,
            positionId: position.id,
            assetName: position.assetName,
            currency: position.currency,
            transferPairId: counterpart ? input.id : null,
          },
        ];
    if (!remove && counterpart)
      changes.push({
        ...input,
        id: randomUUID(),
        accountId: counterpart.accountId,
        positionId: counterpart.id,
        assetName: counterpart.assetName,
        currency: counterpart.currency,
        kind: input.kind === "transfer_out" ? "transfer_in" : "transfer_out",
        transferPairId: input.id,
      });
    for (const change of changes) {
      const before = remove ? change : prior?.id === change.id ? prior : null;
      if (remove)
        await tx.$executeRaw`UPDATE "InvestmentTrade" SET "deletedAt"=CURRENT_TIMESTAMP,"revision"="revision"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${change.id}`;
      else if (prior?.id === change.id)
        await tx.$executeRaw`UPDATE "InvestmentTrade" SET "assetName"=${change.assetName},"tradedAt"=${new Date(input.date)},"kind"=${input.kind},"quantity"=${input.quantity}::numeric,"amount"=${input.amount}::numeric,"costBasis"=${input.costBasis}::numeric,"note"=${input.note},"revision"="revision"+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${change.id}`;
      else
        await tx.$executeRaw`INSERT INTO "InvestmentTrade" ("id","accountId","positionId","transferPairId","assetName","tradedAt","kind","quantity","amount","costBasis","currency","note") VALUES (${change.id},${change.accountId},${change.positionId},${change.transferPairId},${change.assetName},${new Date(input.date)},${change.kind},${input.quantity}::numeric,${input.amount}::numeric,${input.costBasis}::numeric,${change.currency},${input.note})`;
      await tx.$executeRaw`INSERT INTO "InvestmentTradeRevision" ("id","tradeId","actorUserId","before","after") VALUES (${randomUUID()},${change.id},${actorUserId},${JSON.stringify(before ?? null)}::jsonb,${JSON.stringify({ ...change, deleted: remove })}::jsonb)`;
    }
    for (const affected of positions.filter((p) =>
      changes.some((c) => c.positionId === p.id),
    ))
      await recalculate(tx, affected);
    return { ok: true };
  });
}

export async function investmentPositionHistory(
  workspaceId: string,
  id: string,
) {
  const [position] = await prisma.$queryRaw<
    Position[]
  >`SELECT p.* FROM "InvestmentPosition" p JOIN "Account" a ON a.id=p."accountId" WHERE p.id=${id} AND a."workspaceId"=${workspaceId}`;
  if (!position)
    throw new NativeInputError("This asset is not in this Profile.");
  const records = await prisma.$queryRaw<
    {
      after: {
        value?: string | null;
        valueDate?: string | null;
        currency?: string;
      };
      createdAt: Date;
    }[]
  >`SELECT "after","createdAt" FROM "InvestmentPositionRevision" WHERE "positionId"=${id} ORDER BY "createdAt" DESC LIMIT 501`;
  const history = records
    .slice(0, 500)
    .reverse()
    .flatMap((r) =>
      r.after.value !== null &&
      r.after.value !== undefined &&
      r.after.valueDate &&
      Number.isFinite(Number(r.after.value))
        ? [
            {
              accountId: id,
              date: r.after.valueDate,
              currency: r.after.currency ?? position.currency,
              value: Number(r.after.value),
            },
          ]
        : [],
    );
  return { history, limited: records.length > 500 };
}

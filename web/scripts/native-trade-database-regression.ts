import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import {
  saveInvestmentTrade,
  listInvestmentTrades,
} from "../lib/investment-trade-store";
import type { InvestmentTradeInput } from "../lib/investment-trade-input";
async function main() {
  assert.equal(
    process.env.DATABASE_URL,
    "postgresql://clover_test@127.0.0.1:56544/clover_native",
  );
  await prisma.$executeRaw`INSERT INTO "Account" (id,"workspaceId",type,currency,"investmentSubtype","investmentQuantity","investmentCostBasis") VALUES ('holding','profile','investment','PHP','stock',10,1000),('other','other-profile','investment','PHP','stock',10,1000)`;
  const input: InvestmentTradeInput = {
    id: randomUUID(),
    revision: 0,
    assetName: "Example",
    date: "2026-09-19",
    kind: "buy",
    quantity: "2",
    amount: "200",
    costBasis: "210",
    note: "Fictional test",
  };
  const balance = async () => {
    const rows = await prisma.$queryRaw<
      { q: string; c: string }[]
    >`SELECT "investmentQuantity"::text AS q,"investmentCostBasis"::text AS c FROM "Account" WHERE id='holding'`;
    return [Number(rows[0].q), Number(rows[0].c)];
  };
  await saveInvestmentTrade("profile", "holding", "owner", input);
  assert.deepEqual(await balance(), [12, 1210]);
  await saveInvestmentTrade("profile", "holding", "owner", input);
  assert.deepEqual(
    await balance(),
    [12, 1210],
    "Duplicate retry is idempotent",
  );
  await assert.rejects(() =>
    saveInvestmentTrade("other-profile", "holding", "other", input),
  );
  const edit = { ...input, revision: 1, quantity: "3", costBasis: "310" };
  await saveInvestmentTrade("profile", "holding", "owner", edit);
  assert.deepEqual(await balance(), [13, 1310]);
  await assert.rejects(
    () =>
      saveInvestmentTrade("profile", "holding", "owner", {
        ...input,
        revision: 1,
        costBasis: "900",
      }),
    /changed elsewhere/,
  );
  const sell = {
    ...input,
    id: randomUUID(),
    kind: "sell" as const,
    quantity: "4",
    costBasis: "400",
    amount: "600",
  };
  await saveInvestmentTrade("profile", "holding", "owner", sell);
  assert.deepEqual(await balance(), [9, 910]);
  await assert.rejects(
    () =>
      saveInvestmentTrade("profile", "holding", "owner", {
        ...sell,
        id: randomUUID(),
        quantity: "100",
      }),
    /exceeds/,
  );
  assert.deepEqual(await balance(), [9, 910]);
  await saveInvestmentTrade(
    "profile",
    "holding",
    "owner",
    { ...sell, revision: 1 },
    true,
  );
  assert.deepEqual(await balance(), [13, 1310]);
  await Promise.all([
    saveInvestmentTrade("profile", "holding", "owner", {
      ...input,
      id: randomUUID(),
      kind: "reinvest",
    }),
    saveInvestmentTrade("profile", "holding", "owner", {
      ...input,
      id: randomUUID(),
      kind: "transfer_in",
    }),
  ]);
  assert.deepEqual(
    await balance(),
    [17, 1730],
    "Concurrent trades serialize account updates",
  );
  await saveInvestmentTrade("profile", "holding", "owner", {
    ...input,
    id: randomUUID(),
    kind: "transfer_out",
    quantity: "2",
    costBasis: "200",
  });
  assert.deepEqual(await balance(), [15, 1530]);
  assert.equal((await listInvestmentTrades("holding", 1)).totalCount, 4);
  const audit = await prisma.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM "InvestmentTradeRevision"`;
  assert.equal(Number(audit[0].n), 7);
  const access = await prisma.$queryRaw<
    { allowed: boolean }[]
  >`SELECT has_table_privilege('anon','"InvestmentTrade"','SELECT') AS allowed`;
  assert.equal(access[0].allowed, false);
  console.log(
    "PASS buy/edit/sell/reinvest/transfers, idempotent retries, stale revisions, oversell rollback, concurrent writes, Profile isolation, audit and RLS",
  );
}
main().finally(() => prisma.$disconnect());

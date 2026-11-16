import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import {
  commitTransactionTable,
  type TransactionTableBatch,
} from "../lib/transaction-table-save";
import { emptyTableRow } from "../../shared/transaction-table";
async function main() {
  assert.equal(
    process.env.DATABASE_URL,
    "postgresql://clover_test@127.0.0.1:56543/clover_entries",
    "Refusing financial-write tests outside the throwaway database",
  );
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      clerkUserId: `table-${suffix}`,
      email: `${suffix}@example.invalid`,
    },
  });
  try {
    const workspace = await prisma.workspace.create({
      data: { userId: user.id, name: "Table regression" },
    });
    const other = await prisma.workspace.create({
      data: { userId: user.id, name: "Other profile" },
    });
    const make = (id: string, name: string) =>
      prisma.account.create({
        data: {
          workspaceId: id,
          name,
          currency: "PHP",
          type: "cash",
          balance: "1000",
        },
      });
    const [a, b, foreign] = await Promise.all([
      make(workspace.id, "A"),
      make(workspace.id, "B"),
      make(other.id, "Foreign"),
    ]);
    const category = await prisma.category.create({
      data: { workspaceId: workspace.id, name: "Food", type: "expense" },
    });
    const row = {
      ...emptyTableRow("row1"),
      date: "2026-09-19",
      merchant: "Lunch",
      amount: "350.25",
      currency: "PHP",
      accountId: a.id,
      categoryId: category.id,
      tags: "lunch, shared",
    };
    const batch: TransactionTableBatch = {
      id: randomUUID(),
      workspaceId: workspace.id,
      duplicatesAcknowledged: false,
      rows: [
        row,
        {
          ...row,
          key: "row2",
          merchant: "Transfer",
          type: "transfer",
          categoryId: "",
          destinationAccountId: b.id,
          amount: "50",
        },
      ],
    };
    await assert.rejects(
      commitTransactionTable(prisma, batch, "another-user"),
      /unavailable/,
    );
    await Promise.all(
      Array.from({ length: 5 }, () =>
        commitTransactionTable(prisma, batch, user.id),
      ),
    );
    assert.equal(
      await prisma.transaction.count({ where: { workspaceId: workspace.id } }),
      3,
      "Concurrent retries create exactly one batch, including a transfer pair",
    );
    assert.equal(
      await prisma.auditLog.count({ where: { workspaceId: workspace.id } }),
      1,
    );
    assert.equal(
      (
        await prisma.account.findUniqueOrThrow({ where: { id: a.id } })
      ).balance?.toString(),
      "1000",
      "Do not overwrite confirmed opening balance",
    );
    await assert.rejects(
      commitTransactionTable(
        prisma,
        { ...batch, rows: [{ ...row, amount: "500" }] },
        user.id,
      ),
      /already been saved/,
    );
    await assert.rejects(
      commitTransactionTable(prisma, { ...batch, id: randomUUID() }, user.id),
      /Possible duplicates/,
    );
    await assert.rejects(
      commitTransactionTable(
        prisma,
        {
          ...batch,
          id: randomUUID(),
          duplicatesAcknowledged: true,
          rows: [
            { ...row, merchant: "Valid first" },
            { ...row, key: "bad", accountId: foreign.id },
          ],
        },
        user.id,
      ),
      /Profile/,
    );
    assert.equal(
      await prisma.transaction.count({ where: { workspaceId: workspace.id } }),
      3,
      "Invalid later row rolls back the entire batch",
    );
    await assert.rejects(
      commitTransactionTable(
        prisma,
        {
          ...batch,
          id: randomUUID(),
          rows: [{ ...row, key: "bad", date: "2026-02-30" }],
        },
        user.id,
      ),
      /valid date/,
    );
    const transfer = await prisma.transaction.findMany({
      where: { workspaceId: workspace.id, type: "transfer" },
    });
    assert.equal(transfer.length, 2);
    assert.deepEqual(
      transfer
        .map(
          (t) =>
            (t.rawPayload as { transferDirection: string }).transferDirection,
        )
        .sort(),
      ["in", "out"],
    );
    console.log(
      "Transaction table atomic save, authorization, retry, duplicate, transfer and preservation checks passed.",
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

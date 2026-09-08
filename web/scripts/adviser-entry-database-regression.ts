// Run only against the throwaway database created for this suite.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { commitAdviserEntries } from "../lib/adviser-entry-save";
import {
  entryTransaction,
  entryAccount,
  entryLine,
  type EntryDraft,
} from "../lib/adviser-entry-types";
async function main() {
  assert.equal(
    process.env.DATABASE_URL,
    "postgresql://clover_test@127.0.0.1:56543/clover_entries",
    "Refusing to run financial write tests on any other database",
  );
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { clerkUserId: `test-${suffix}`, email: `${suffix}@example.invalid` },
  });
  try {
    const workspace = await prisma.workspace.create({
      data: { userId: user.id, name: "Entry tests" },
    });
    const other = await prisma.workspace.create({
      data: { userId: user.id, name: "Other Profile" },
    });
    const account = await prisma.account.create({
      data: {
        workspaceId: workspace.id,
        name: "Cash",
        currency: "PHP",
        type: "cash",
      },
    });
    const foreign = await prisma.account.create({
      data: {
        workspaceId: other.id,
        name: "Foreign",
        currency: "PHP",
        type: "cash",
      },
    });
    const row = {
      ...entryTransaction("t1"),
      merchant: "Coffee",
      amount: "180",
      date: "2026-09-08",
      accountId: account.id,
    };
    const base: EntryDraft = {
      version: 1,
      id: randomUUID(),
      workspaceId: workspace.id,
      sourceText: "Coffee 180; Parking 50",
      confidence: 0,
      accounts: [],
      transactions: [
        row,
        { ...row, key: "t2", merchant: "Parking", amount: "50" },
      ],
      receipts: [],
    };
    await assert.rejects(
      commitAdviserEntries(prisma, base, "foreign-actor"),
      /not available/,
    );
    await Promise.all(
      Array.from({ length: 8 }, () =>
        commitAdviserEntries(prisma, base, user.id),
      ),
    );
    assert.equal(
      await prisma.transaction.count({ where: { workspaceId: workspace.id } }),
      2,
      "Concurrent confirmations create only two rows",
    );
    assert.equal(
      await prisma.auditLog.count({ where: { workspaceId: workspace.id } }),
      1,
    );
    await assert.rejects(
      commitAdviserEntries(
        prisma,
        { ...base, transactions: [{ ...row, amount: "200" }] },
        user.id,
      ),
      /already saved/,
    );
    const newAccount = {
      ...entryAccount("new"),
      name: "New cash",
      balance: "0",
    };
    await assert.rejects(
      commitAdviserEntries(
        prisma,
        {
          ...base,
          id: randomUUID(),
          accounts: [newAccount],
          transactions: [
            { ...row, accountId: "new:new" },
            { ...row, key: "bad", currency: "USD" },
          ],
        },
        user.id,
      ),
      /Use PHP/,
    );
    assert.equal(
      await prisma.account.count({
        where: { workspaceId: workspace.id, name: "New cash" },
      }),
      0,
      "Failed batch rolls back its new account",
    );
    assert.equal(
      await prisma.transaction.count({ where: { workspaceId: workspace.id } }),
      2,
      "Failed batch rolls back earlier rows",
    );
    await assert.rejects(
      commitAdviserEntries(
        prisma,
        {
          ...base,
          id: randomUUID(),
          transactions: [{ ...row, accountId: foreign.id }],
        },
        user.id,
      ),
      /not available/,
    );
    await commitAdviserEntries(
      prisma,
      {
        ...base,
        id: randomUUID(),
        accounts: [newAccount],
        transactions: [
          {
            ...row,
            accountId: "new:new",
            lines: [
              { ...entryLine(), description: "Coffee", unitPrice: "180" },
            ],
          },
        ],
      },
      user.id,
    );
    const receipt = await prisma.transaction.create({
      data: {
        workspaceId: workspace.id,
        accountId: account.id,
        merchantRaw: "Receipt",
        date: new Date("2026-09-08"),
        amount: "100",
        currency: "PHP",
        type: "expense",
        reviewStatus: "confirmed",
        rawPayload: {
          original: "preserve",
          receiptLineItems: [
            {
              description: "Existing",
              amount: "40",
              quantity: "1",
              unitPrice: "40",
            },
          ],
        },
      },
    });
    const receiptDraft: EntryDraft = {
      ...base,
      id: randomUUID(),
      transactions: [],
      receipts: [
        {
          transactionId: receipt.id,
          expectedUpdatedAt: receipt.updatedAt.toISOString(),
          lines: [
            { ...entryLine(), description: "More items", unitPrice: "60" },
          ],
        },
      ],
    };
    await commitAdviserEntries(prisma, receiptDraft, user.id);
    await commitAdviserEntries(prisma, receiptDraft, user.id);
    const after = await prisma.transaction.findUniqueOrThrow({
      where: { id: receipt.id },
    });
    assert.equal(after.amount.toString(), "100");
    assert.deepEqual(after.rawPayload, receipt.rawPayload);
    assert.equal(
      (after.normalizedPayload as { receiptLineItems: unknown[] })
        .receiptLineItems.length,
      2,
    );
    await assert.rejects(
      commitAdviserEntries(
        prisma,
        { ...receiptDraft, id: randomUUID() },
        user.id,
      ),
      /changed/,
    );
    await assert.rejects(
      commitAdviserEntries(
        prisma,
        {
          ...receiptDraft,
          id: randomUUID(),
          receipts: [
            {
              ...receiptDraft.receipts[0],
              expectedUpdatedAt: after.updatedAt.toISOString(),
            },
          ],
        },
        user.id,
      ),
      /must equal/,
    );
    const count = await prisma.auditLog.count({
      where: { workspaceId: workspace.id },
    });
    assert.equal(count, 3);
    console.log(
      "PASS PostgreSQL concurrent idempotency, changed replay rejection, atomic batch rollback, cross-Profile references, new-account dependencies, receipt totals, raw preservation and optimistic conflicts",
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

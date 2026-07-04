import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reconcileWorkspaceData, repairWorkspaceDataVisibility } from "@/lib/reconciliation";
import {
  buildTransactionQueryWhere,
  buildVisibleWorkspaceTransactionWhere,
} from "@/lib/transaction-query";

const run = async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      clerkUserId: `data-visibility-${suffix}`,
      email: `data-visibility-${suffix}@example.com`,
      environment: "test",
    },
  });

  try {
    const [visibleWorkspace, driftWorkspace] = await Promise.all([
      prisma.workspace.create({
        data: {
          userId: user.id,
          name: "Visible workspace",
        },
      }),
      prisma.workspace.create({
        data: {
          userId: user.id,
          name: "Drift workspace",
        },
      }),
    ]);

    const account = await prisma.account.create({
      data: {
        workspaceId: visibleWorkspace.id,
        name: "Regression Bank 1234",
        institution: "Regression Bank",
        accountNumber: "1234",
        type: "bank",
        currency: "PHP",
        balance: new Prisma.Decimal("123.45"),
      },
    });

    const transaction = await prisma.transaction.create({
      data: {
        workspaceId: driftWorkspace.id,
        accountId: account.id,
        date: new Date("2026-01-15T00:00:00.000Z"),
        amount: new Prisma.Decimal("123.45"),
        currency: "PHP",
        type: "expense",
        merchantRaw: "Regression Merchant",
        merchantClean: "Regression Merchant",
        reviewStatus: "confirmed",
        parserConfidence: 100,
        categoryConfidence: 100,
        accountMatchConfidence: 100,
      },
    });

    const strictBeforeRepair = await prisma.transaction.count({
      where: {
        workspaceId: visibleWorkspace.id,
        deletedAt: null,
      },
    });
    assert.equal(strictBeforeRepair, 0, "fixture should start with a drifted transaction workspaceId");

    const visibleViaSharedScope = await prisma.transaction.count({
      where: buildVisibleWorkspaceTransactionWhere(visibleWorkspace.id),
    });
    assert.equal(visibleViaSharedScope, 1, "shared scope should keep account-linked transactions visible");

    const visibleViaTransactionsPageScope = await prisma.transaction.count({
      where: buildTransactionQueryWhere(visibleWorkspace.id, {}),
    });
    assert.equal(visibleViaTransactionsPageScope, 1, "transactions page scope should keep account-linked transactions visible");

    const repairs = await repairWorkspaceDataVisibility(visibleWorkspace.id);
    assert.equal(repairs.repairedTransactionWorkspaceRows, 1, "repair should reconnect the transaction workspaceId");

    const repairedTransaction = await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
      select: {
        workspaceId: true,
      },
    });
    assert.equal(repairedTransaction.workspaceId, visibleWorkspace.id, "repair should persist the account workspaceId");

    const issues = await reconcileWorkspaceData(visibleWorkspace.id);
    assert.equal(
      issues.some((issue) => issue.type === "transaction_workspace_mismatch"),
      false,
      "a second reconciliation pass should not find the same mismatch again"
    );

    console.info("Data visibility regression passed.");
  } finally {
    await prisma.user.delete({
      where: { id: user.id },
    });
    await prisma.$disconnect();
  }
};

run().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

import { randomUUID } from "node:crypto";
import { strict as assert } from "node:assert";
import { prisma } from "@/lib/prisma";
import { recordTrainingSignal } from "@/lib/data-engine";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55441"); assert.equal(url.pathname, "/clover_migration_qa"); assert(process.argv.includes("--execute"));

const main = async () => {
  const unique = randomUUID();
  const clerkUserId = `test-${unique}`;
  const email = `test-${unique}@example.com`;

  const user = await prisma.user.create({
    data: {
      clerkUserId,
      email,
      verified: false,
    },
  });

  try {
    const workspace = await prisma.workspace.create({
      data: {
        userId: user.id,
        name: `Training Signal Regression ${unique}`,
        type: "personal",
      },
    });

    const category = await prisma.category.create({
      data: {
        workspaceId: workspace.id,
        name: "Food & Dining",
        type: "expense",
      },
    });

    const account = await prisma.account.create({ data: { workspaceId: workspace.id, name: "Synthetic account", type: "bank", currency: "PHP", balance: 0 } });
    const file = await prisma.importFile.create({ data: { workspaceId: workspace.id, fileName: "synthetic.csv", fileType: "text/csv", storageKey: "synthetic/training" } });
    const transaction = await prisma.transaction.create({ data: { workspaceId: workspace.id, accountId: account.id, importFileId: file.id, categoryId: category.id, merchantRaw: "GrabPay", merchantClean: "GrabPay", date: new Date("2026-01-01"), amount: 10, currency: "PHP", type: "expense", reviewStatus: "confirmed" } });
    const signalArgs = {
      workspaceId: workspace.id,
      importFileId: file.id,
      transactionId: transaction.id,
      merchantText: "GrabPay",
      categoryId: category.id,
      categoryName: category.name,
      type: "expense" as const,
      source: "manual_recategorization" as const,
      confidence: 92,
    };

    await recordTrainingSignal(signalArgs);
    await recordTrainingSignal({
      ...signalArgs,
      notes: "updated notes from the second pass",
      confidence: 88,
    });

    const signals = await prisma.trainingSignal.findMany({
      where: {
        workspaceId: workspace.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    assert.equal(signals.length, 1, "duplicate training signals should upsert into a single row");
    assert.equal(signals[0]?.notes, "updated notes from the second pass", "the latest signal payload should win");
    assert.equal(signals[0]?.confidence, 88, "the latest confidence should be stored on the deduped row");

    console.log("training-signal database regression passed");
  } finally {
    await prisma.user.delete({
      where: {
        id: user.id,
      },
    });
    await prisma.$disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

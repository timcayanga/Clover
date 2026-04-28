import { randomUUID } from "node:crypto";
import { strict as assert } from "node:assert";
import { prisma } from "@/lib/prisma";
import { recordTrainingSignal } from "@/lib/data-engine";

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

    const signalArgs = {
      workspaceId: workspace.id,
      importFileId: "import-test",
      transactionId: "transaction-test",
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
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

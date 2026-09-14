import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { applyMobileOfflineMutation } from "../lib/mobile-offline-sync";
import { reserveLocalAllowance } from "../lib/mobile-local-allowance";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55439" ||
  url.pathname !== "/clover_offline_qa"
)
  throw new Error(
    "This fixture test requires the dedicated loopback QA database.",
  );
const clerk = "offline-qa-" + randomUUID();
let owner: string | undefined;
(async () => {
  try {
    const user = await prisma.user.create({
      data: {
        clerkUserId: clerk,
        email: clerk + "@example.invalid",
        environment: "development",
      },
    });
    owner = user.id;
    const workspace = await prisma.workspace.create({
      data: { userId: user.id, name: "Offline isolated QA" },
    });
    const account = await prisma.account.create({
      data: {
        workspaceId: workspace.id,
        name: "QA Cash",
        type: "cash",
        currency: "PHP",
      },
    });
    const operation = {
      id: randomUUID(),
      kind: "create",
      payload: {
        accountId: account.id,
        categoryId: null,
        merchantRaw: "Offline QA lunch",
        date: "2026-09-14",
        amount: "12.30",
        currency: "PHP",
        type: "expense",
        description: "Original note",
        tags: [" QA  tag ", "qa tag"],
      },
    };
    const incomeCategory = await prisma.category.create({data: {workspaceId: workspace.id, name: "Income QA", type: "income"}});
    assert.equal((await applyMobileOfflineMutation(clerk, workspace.id, {...operation, id: randomUUID(), payload: {...operation.payload, categoryId: incomeCategory.id}})).status, 400);
    console.log("PASS category type mismatch rejected without a transaction");
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        applyMobileOfflineMutation(clerk, workspace.id, operation),
      ),
    );
    assert(results.every((r) => r.status === 200));
    assert.equal(
      await prisma.transaction.count({ where: { workspaceId: workspace.id } }),
      1,
    );
    assert.equal(
      await prisma.mobileOfflineMutation.count({
        where: { workspaceId: workspace.id },
      }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({ where: { workspaceId: workspace.id } }),
      1,
    );
    console.log(
      "PASS concurrent create replay: one transaction, receipt, audit",
    );
    const transaction = await prisma.transaction.findFirstOrThrow({
      where: { workspaceId: workspace.id },
      include: { transactionTags: true },
    });
    assert.equal(transaction.transactionTags.length, 1);
    assert.equal(transaction.amount.toString(), "12.3");
    assert.equal(
      (
        await applyMobileOfflineMutation(clerk, workspace.id, {
          ...operation,
          payload: { ...operation.payload, amount: "99" },
        })
      ).status,
      409,
    );
    console.log("PASS reused operation ID cannot change payload");
    assert.equal(
      (
        await applyMobileOfflineMutation("other-user", workspace.id, {
          ...operation,
          id: randomUUID(),
        })
      ).status,
      403,
    );
    console.log("PASS cross-user mutation rejected");
    const edit = {
      id: randomUUID(),
      kind: "edit",
      transactionId: transaction.id,
      baseVersion: transaction.updatedAt.toISOString(),
      payload: { merchantClean: "My name", description: "My note" },
    };
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        merchantClean: "Changed elsewhere",
        updatedAt: new Date(transaction.updatedAt.getTime() + 1000),
      },
    });
    const conflict = await applyMobileOfflineMutation(
      clerk,
      workspace.id,
      edit,
    );
    assert.equal(conflict.status, 409);
    assert.equal(
      (conflict.body as any).current.merchantClean,
      "Changed elsewhere",
    );
    assert.equal(
      await prisma.mobileOfflineMutation.count({
        where: { workspaceId: workspace.id },
      }),
      1,
    );
    console.log("PASS stale edit preserves confirmed record");
    const current = await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
    });
    const concurrent = await Promise.all(
      ["First", "Second"].map((name) =>
        applyMobileOfflineMutation(clerk, workspace.id, {
          ...edit,
          id: randomUUID(),
          baseVersion: current.updatedAt.toISOString(),
          payload: { merchantClean: name },
        }),
      ),
    );
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
    const after = await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
    });
    assert.equal(after.amount.toString(), transaction.amount.toString());
    assert.deepEqual(after.rawPayload, transaction.rawPayload);
    console.log(
      "PASS competing edits have one winner and preserve raw/financial fields",
    );
    await prisma.user.update({
      where: { id: user.id },
      data: { dataWipedAt: new Date() },
    });
    assert.equal(
      (
        await applyMobileOfflineMutation(clerk, workspace.id, {
          ...operation,
          id: randomUUID(),
        })
      ).status,
      409,
    );
    await prisma.user.update({
      where: { id: user.id },
      data: { dataWipedAt: null },
    });
    console.log("PASS old offline operation cannot restore data after a wipe");
    const grants = await Promise.all(
      Array.from({ length: 7 }, () =>
        reserveLocalAllowance(user.id, { deviceId: randomUUID() }),
      ),
    );
    assert.equal(
      grants.reduce((n, g) => n + (g.grant?.issued ?? 0), 0),
      50,
    );
    assert.equal(grants.filter((g) => !g.grant).length, 2);
    console.log("PASS concurrent devices cannot exceed Free allowance");
    const active = await prisma.mobileLocalAllowance.findFirstOrThrow({
      where: { userId: user.id },
    });
    const refreshed = await reserveLocalAllowance(user.id, {
      deviceId: active.deviceId,
      grantId: active.id,
      used: 3,
    });
    assert.equal(refreshed.grant?.used, 3);
    const rolledBack = await reserveLocalAllowance(user.id, {
      deviceId: active.deviceId,
      grantId: active.id,
      used: 0,
    });
    assert.equal(rolledBack.grant?.used, 3);
    console.log("PASS usage receipts are monotonic");
    await assert.rejects(
      reserveLocalAllowance(user.id, {
        deviceId: randomUUID(),
        grantId: active.id,
        used: 1,
      }),
      /Invalid local/,
    );
    console.log("PASS device cannot claim another device allowance");
    console.log("10/10 database integration checks passed");
  } finally {
    if (owner) await prisma.user.delete({ where: { id: owner } });
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

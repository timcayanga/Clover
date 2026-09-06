// Destructive fixtures are restricted to this disposable, loopback-only DB.
import assert from "node:assert/strict";
import { Client } from "pg";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/clover_import_latency_test");
  const { prisma } = await import("../lib/prisma");
  const { ensureWorkspaceCashAccount, seedWorkspaceDefaults } = await import("../lib/starter-data");
  const { confirmImportFile } = await import("../workers/import-processor");
  const { loadImportStatusSnapshot } = await import("../lib/import-status-snapshot");
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { clerkUserId: `latency-${suffix}`, email: `latency-${suffix}@example.test` } });
  const workspace = await prisma.workspace.create({ data: { userId: user.id, name: "Import latency fixture", type: "personal" } });
  const workspaceId = workspace.id;
  await seedWorkspaceDefaults(workspaceId);
  const blocker = new Client({ connectionString: url.toString() });
  await blocker.connect();
  const timings: Record<string, number> = {};
  try {
    await blocker.query("BEGIN");
    await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`workspace-defaults:${workspaceId}`]);
    let started = performance.now();
    await ensureWorkspaceCashAccount(workspaceId, "PHP");
    timings.existingCashUnderHeldLockMs = Math.round(performance.now() - started);
    assert.ok(timings.existingCashUnderHeldLockMs < 1000, "Existing Cash must bypass a held defaults lock");
    started = performance.now();
    await seedWorkspaceDefaults(workspaceId);
    timings.existingDefaultsUnderHeldLockMs = Math.round(performance.now() - started);
    assert.ok(timings.existingDefaultsUnderHeldLockMs < 1000, "Refreshing a ready profile must bypass the defaults lock");

    started = performance.now();
    await assert.rejects(ensureWorkspaceCashAccount(workspaceId, "EUR"));
    timings.missingCashLockTimeoutMs = Math.round(performance.now() - started);
    assert.ok(timings.missingCashLockTimeoutMs < 3000, "A missing default must fail promptly instead of waiting for a statement timeout");
    assert.equal(await prisma.account.count({ where: { workspaceId, type: "cash", currency: "EUR" } }), 0);

    // Execute real confirmation under the very lock that stranded uploads.
    // Fixtures are bank-neutral; this shared path handles every statement format.
    for (const type of ["bank", "wallet", "credit_card"] as const) {
      const account = await prisma.account.create({ data: { workspaceId, name: `Test ${type}`, institution: "Fixture Institution", type, currency: "PHP", balance: "1000", source: "upload" } });
      const confirmed = await prisma.transaction.create({ data: { workspaceId, accountId: account.id, date: new Date("2026-08-01"), amount: "25", type: "expense", merchantRaw: "User confirmed fixture", merchantClean: "Keep this name", reviewStatus: "confirmed", currency: "PHP" } });
      const file = await prisma.importFile.create({ data: { workspaceId, accountId: account.id, fileName: `fixture-${type}.csv`, fileType: "text/csv", storageKey: "local-fixture-only", processingPhase: "reconciling", parsedRowsCount: 11 } });
      await prisma.parsedTransaction.createMany({ data: Array.from({ length: 11 }, (_, index) => ({
        importFileId: file.id, workspaceId, accountName: account.name, institution: account.institution,
        date: new Date(`2026-09-${String(index + 1).padStart(2, "0")}`), amount: String(100 + index),
        currency: "PHP", merchantRaw: `Fixture purchase ${index}`, merchantClean: `Fixture purchase ${index}`,
        type: "expense" as const, categoryName: "Shopping", confidence: 90,
        rawPayload: { source: "local_latency_fixture", sourceRowIndex: index + 1 },
      })) });
      started = performance.now();
      const result = await confirmImportFile(file.id, account.id);
      timings[`${type}ConfirmationUnderHeldLockMs`] = Math.round(performance.now() - started);
      assert.equal(result.status, "done");
      assert.equal(await prisma.transaction.count({ where: { importFileId: file.id } }), 11);
      assert.ok(timings[`${type}ConfirmationUnderHeldLockMs`] < 5000, "Small confirmation must not wait on unrelated setup");
      const snapshot = await loadImportStatusSnapshot(file.id);
      assert.equal(snapshot?.settledImportComplete, true, "Committed rows must reach the UI's completion condition");
      const preserved = await prisma.transaction.findUniqueOrThrow({ where: { id: confirmed.id } });
      assert.equal(preserved.merchantClean, "Keep this name");
      assert.equal(preserved.amount.toString(), "25");
      assert.equal(preserved.reviewStatus, "confirmed");
      assert.equal(await prisma.parsedTransaction.count({ where: { importFileId: file.id } }), 11, "Raw parsed audit rows must remain");
    }
    await blocker.query("ROLLBACK");
    await Promise.all(Array.from({ length: 8 }, () => ensureWorkspaceCashAccount(workspaceId, "EUR")));
    assert.equal(await prisma.account.count({ where: { workspaceId, type: "cash", currency: "EUR" } }), 1, "Concurrent creation must still be idempotent");
    console.log("[PASS] Import latency, real confirmation, lock timeout, preserved data, and concurrent creation", timings);
  } finally {
    await blocker.query("ROLLBACK");
    await blocker.end();
    // Let post-visible QA finish against fixture rows before disconnecting.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

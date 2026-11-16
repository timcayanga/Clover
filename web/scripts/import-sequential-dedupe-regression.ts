import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";

const webRoot = basename(process.cwd()) === "web" ? process.cwd() : join(process.cwd(), "web");
loadEnvConfig(webRoot);

const baseUrl = process.env.CLOVER_IMPORT_REGRESSION_BASE_URL ?? "http://localhost:3001";
const statementRoot = process.env.CLOVER_STATEMENT_ROOT ?? "/Users/TimCayanga1/Documents/Bank Statements";
const fixturePath = join(statementRoot, "Samples/BPI/848836638-BPI-BANK-STATEMENT.pdf");

const upload = async (workspaceId: string, bytes: Buffer) => {
  const importId = randomUUID();
  const formData = new FormData();
  formData.set("workspaceId", workspaceId);
  formData.set("fileName", "848836638-BPI-BANK-STATEMENT.pdf");
  formData.set("fileType", "application/pdf");
  formData.set("bankName", "BPI");
  formData.set("importMode", "statement");
  formData.set("forceInlineProcessing", "true");
  formData.set("file", new Blob([bytes], { type: "application/pdf" }), "848836638-BPI-BANK-STATEMENT.pdf");

  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/imports/${importId}/process`, {
    method: "POST",
    body: formData,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  assert.equal(response.ok, true, JSON.stringify(payload));
  return { importId, payload, elapsedMs: Date.now() - startedAt };
};

const main = async () => {
  const health = await fetch(`${baseUrl}/api/health`).catch(() => null);
  assert.equal(health?.ok, true, `Start Clover locally at ${baseUrl} before running this regression.`);

  const user = await prisma.user.upsert({
    where: { clerkUserId: "local-admin" },
    update: {},
    create: {
      clerkUserId: "local-admin",
      email: "local-admin+sequential-dedupe@clover.local",
      verified: true,
      environment: "local",
      planTier: "pro",
      planTierLocked: true,
    },
    select: { id: true },
  });
  const workspace = await prisma.workspace.create({
    data: {
      userId: user.id,
      name: `Sequential import dedupe ${randomUUID()}`,
      type: "personal",
    },
    select: { id: true },
  });

  try {
    const bytes = await readFile(fixturePath);
    const first = await upload(workspace.id, bytes);
    const firstCount = await prisma.transaction.count({ where: { workspaceId: workspace.id, deletedAt: null } });
    assert.equal(first.payload.duplicate, false, "The first upload must materialize the statement.");
    assert.ok(firstCount >= 25, `Expected BPI rows after first upload, got ${firstCount}.`);

    let cacheReady = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const cache = await prisma.importFileExtractionCache.findFirst({
        where: { workspaceId: workspace.id },
        select: { parsedRows: true },
      });
      if (Array.isArray(cache?.parsedRows) && cache.parsedRows.length === firstCount) {
        cacheReady = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(cacheReady, true, "The first import must persist its trained parse cache.");

    // Preserve the learned cache but retire the QA materialization so the next
    // upload proves the trained fast path, not the duplicate short circuit.
    await prisma.transaction.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.importFile.update({
      where: { id: first.importId },
      data: {
        status: "done",
        parsedRowsCount: 0,
        confirmedTransactionsCount: 0,
        confirmedAt: null,
      },
    });

    const trained = await upload(workspace.id, bytes);
    const trainedCount = await prisma.transaction.count({ where: { workspaceId: workspace.id, deletedAt: null } });
    assert.equal(trained.payload.duplicate, false, "The trained replay must materialize after the prior QA rows are retired.");
    assert.equal(trainedCount, firstCount, "The trained replay must preserve the learned row count.");
    assert.ok(trained.elapsedMs < 12_000, `The trained end-to-end upload took ${trained.elapsedMs}ms.`);

    const repeated = await upload(workspace.id, bytes);
    const repeatedCount = await prisma.transaction.count({ where: { workspaceId: workspace.id, deletedAt: null } });
    const repeatedImportRows = await prisma.transaction.count({ where: { importFileId: repeated.importId, deletedAt: null } });

    assert.equal(repeated.payload.duplicate, true, "The repeated upload must be reported as a duplicate.");
    assert.equal(repeated.payload.importedRows, 0, "A skipped duplicate must report zero newly imported rows.");
    assert.equal(repeatedCount, trainedCount, "The repeated upload must not increase workspace transaction count.");
    assert.equal(repeatedImportRows, 0, "The repeated import record must not own transactions.");
    assert.ok(repeated.elapsedMs < 6_000, `The duplicate fast path took ${repeated.elapsedMs}ms.`);

    console.log(
      `[PASS] Untrained BPI: ${firstCount} rows in ${first.elapsedMs}ms; trained replay: ${trainedCount} rows in ${trained.elapsedMs}ms; duplicate: 0 new rows in ${repeated.elapsedMs}ms.`
    );
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => null);
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  await prisma.$disconnect().catch(() => null);
  process.exitCode = 1;
});

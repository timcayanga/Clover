import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));

const require = createRequire(import.meta.url);
const tasks: Array<() => Promise<void>> = [];
require("next/cache").revalidateTag = () => {};
require("next/server").after = (task: () => Promise<void>) => { tasks.push(task); };
globalThis.fetch = async () => { throw new Error("Replay QA prohibits network access"); };
const drain = async () => { while (tasks.length) await Promise.all(tasks.splice(0).map(task => task())); };
const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value));

async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const { confirmImportFile, processImportFileText } = await import("../workers/import-processor");
  await db.cloverDeploymentEnvironment.upsert({ where: { id: "primary" }, create: { environment: "staging" }, update: {} });
  const user = await db.user.create({ data: {
    clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: "staging", planTier: "pro", planTierLocked: true,
  } });
  try {
    const authPath = require.resolve("../lib/auth");
    const accessPath = require.resolve("../lib/workspace-access");
    require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
      isLocalDevHost: async () => false, requireAuth: async () => ({ userId: user.clerkUserId }),
    } } as NodeModule;
    require.cache[accessPath] = { id: accessPath, filename: accessPath, loaded: true, exports: {
      assertWorkspaceAccess: async (_actor: string, id: string) =>
        assert(await db.workspace.findFirst({ where: { id, userId: user.id } })),
    } } as NodeModule;
    const { POST: resume } = await import("../app/api/imports/[importId]/resume/route");
    const resumeFile = (id: string) => resume(new Request(
      `https://staging.clover.ph/api/imports/${id}/resume`, { method: "POST" },
    ), { params: Promise.resolve({ importId: id }) });
    const workspace = await db.workspace.create({ data: { userId: user.id, name: "Synthetic replay QA" } });
    const workspaceId = workspace.id;
    const account = await db.account.create({ data: {
      workspaceId, name: "Example Bank 4433", institution: "Example Bank", accountNumber: "7766554433", type: "bank", currency: "PHP", balance: 1000,
    } });
    const accountId = account.id;
    await db.account.create({ data: { workspaceId, name: "Cash", institution: "Cash", type: "cash", currency: "PHP", balance: 0 } });
    const manual = await db.transaction.create({ data: {
      workspaceId, accountId, reviewStatus: "edited", date: new Date("2025-02-01"),
      amount: 40, currency: "PHP", type: "expense", merchantRaw: "Manual coffee", merchantClean: "My coffee",
      description: "User notes", isExcluded: true, normalizedPayload: { receiptLineItems: [{ description: "Coffee", amount: "40.00" }] },
    } });
    const ledger = async () => snapshot({
      rows: await db.transaction.findMany({ where: { workspaceId }, orderBy: { id: "asc" } }),
      accounts: await db.account.findMany({ where: { workspaceId }, orderBy: { id: "asc" },
        select: { id: true, name: true, institution: true, accountNumber: true, type: true, currency: true, balance: true } }),
    });
    const statement = await db.importFile.create({ data: {
      workspaceId, accountId, fileName: "replay-fault-statement.csv", fileType: "text/csv", storageKey: "qa/statement",
      status: "processing", processingPhase: "staged", parsedRowsCount: 2,
    } });
    await db.parsedTransaction.createMany({ data: [1, 2].map(index => ({
      workspaceId, importFileId: statement.id, accountName: account.name, accountNumber: account.accountNumber,
      institution: account.institution, date: new Date("2026-09-01"), amount: 25, currency: "PHP",
      merchantRaw: "Repeated coffee", merchantClean: "Repeated coffee", type: "expense", categoryName: "Food & Dining",
      confidence: 95, rawPayload: { sourceRowIndex: index, line: "2026-09-01 Repeated coffee 25.00" },
    })) });
    await db.accountStatementCheckpoint.create({ data: {
      workspaceId, accountId, importFileId: statement.id, statementStartDate: new Date("2026-09-01"),
      statementEndDate: new Date("2026-09-30"), openingBalance: 1000, endingBalance: 950, rowCount: 2,
    } });

    const { insertParsedTransactionsCompat } = await import("../lib/data-engine");
    const priorCandidates = await db.parsedTransaction.findMany({ where: { importFileId: statement.id }, orderBy: { id: "asc" } });
    // Three bound values per row gives 3,333 rows in the first insert. A
    // duplicate in the second insert must roll back that batch and the delete.
    const candidates = Array.from({ length: 3334 }, (_, index) => ({
      id: `qa-${statement.id}-${index === 3333 ? 0 : index}`, importFileId: statement.id, workspaceId,
    }));
    await assert.rejects(db.$transaction(async tx => {
      await tx.parsedTransaction.deleteMany({ where: { importFileId: statement.id } });
      await insertParsedTransactionsCompat({ tx, columns: ["id", "importFileId", "workspaceId"], rows: candidates });
    }), /unique|duplicate|23505/i);
    assert.deepEqual(await db.parsedTransaction.findMany({ where: { importFileId: statement.id }, orderBy: { id: "asc" } }), priorCandidates);

    const withCompletionFailure = async (verify: () => Promise<void>) => {
      await db.$executeRawUnsafe(`CREATE FUNCTION qa_fail_import_commit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF OLD."fileName" LIKE 'replay-fault-%' AND OLD."confirmedAt" IS NULL AND NEW."confirmedAt" IS NOT NULL THEN
            RAISE EXCEPTION 'synthetic completion failure';
          END IF;
          RETURN NEW;
        END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER qa_fail_import_commit BEFORE UPDATE ON "ImportFile" FOR EACH ROW EXECUTE FUNCTION qa_fail_import_commit()`);
      try {
        await verify();
      } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER qa_fail_import_commit ON "ImportFile"`);
        await db.$executeRawUnsafe(`DROP FUNCTION qa_fail_import_commit()`);
      }

    };
    const beforeFailure = await ledger();
    await withCompletionFailure(async () => {
      await assert.rejects(confirmImportFile(statement.id, accountId), /synthetic completion failure/);
      assert.deepEqual(await ledger(), beforeFailure, "An interrupted statement commit rolls back every financial change");
    });

    let releaseLock!: () => void;
    let ready!: () => void;
    const held = new Promise<void>(resolve => { ready = resolve; });
    const released = new Promise<void>(resolve => { releaseLock = resolve; });
    const blocker = db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "ImportFile" WHERE id = ${statement.id} FOR UPDATE`;
      ready();
      await released;
    });
    await Promise.race([held, blocker]);
    const info = console.info;
    const waits: Record<string, number[]> = {};
    let scheduledRelease = false;
    console.info = (...args) => {
      if (args[0] === "[import-timing]") {
        const span = JSON.parse(String(args[1]));
        if (span.importFileId === statement.id) {
          if (span.stage === "confirmation_import_row_lock" && span.event === "started" && !scheduledRelease) {
            scheduledRelease = true;
            setTimeout(releaseLock, 100);
          }
          if (span.event === "finished") (waits[span.stage] ??= []).push(span.durationMs);
        }
      }
      info(...args);
    };
    const safetyRelease = setTimeout(releaseLock, 5000);
    const attempts = await Promise.all([confirmImportFile(statement.id, accountId), confirmImportFile(statement.id, accountId)]).finally(async () => {
      console.info = info;
      clearTimeout(safetyRelease);
      releaseLock();
      await blocker;
    });
    assert(scheduledRelease && waits.confirmation_import_row_lock.some(ms => ms >= 75));
    assert.equal(waits.confirmation_pool_wait.length, 2);
    assert.equal(waits.confirmation_statement_lock.length, 2);
    assert.equal(attempts.filter(result => result.duplicate).length, 1);
    await drain();
    const committed = await ledger();
    assert.equal(committed.rows.filter((row: { importFileId: string }) => row.importFileId === statement.id).length, 2);
    assert.deepEqual(committed.rows.find((row: { id: string }) => row.id === manual.id), snapshot(manual));
    await confirmImportFile(statement.id, accountId);
    await drain();
    assert.deepEqual(await ledger(), committed, "A lost response and replay do not change rows or balances after commit");

    const deleted = await db.transaction.findFirstOrThrow({ where: { importFileId: statement.id } });
    await db.transaction.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    const afterDeletion = await ledger();
    await confirmImportFile(statement.id, accountId);
    assert.deepEqual(await ledger(), afterDeletion, "A lower live count cannot replay a completed statement");
    await db.importFile.update({ where: { id: statement.id }, data: { status: "failed", processingPhase: "repair_needed" } });
    const restarted = await processImportFileText(statement.id, { text: "This retry payload must never be parsed", actorUserId: user.id });
    assert.equal(restarted.status, "done");
    assert.equal(restarted.duplicate, true);
    assert.equal((await resumeFile(statement.id)).status, 200);
    assert.deepEqual(await ledger(), afterDeletion, "A committed statement cannot re-enter parsing after a status failure");

    await db.transaction.updateMany({ where: { importFileId: statement.id, deletedAt: null }, data: { deletedAt: new Date() } });
    const emptyAfterDeletion = await ledger();
    assert.equal((await confirmImportFile(statement.id, accountId)).confirmedTransactionsCount, 0);
    assert.equal((await resumeFile(statement.id)).status, 200);
    assert.deepEqual(await ledger(), emptyAfterDeletion, "Deleting all imported rows does not make the statement resumable");

    // Older receipt saves could commit the transaction before its source link
    // and completion status. Reconstruct that state without touching any live data.
    const receipt = await db.importFile.create({ data: {
      workspaceId, accountId, fileName: "legacy-partial-receipt.jpg", fileType: "image/jpeg", storageKey: "qa/receipt",
      status: "failed", processingPhase: "repair_needed",
    } });
    await db.accountStatementCheckpoint.create({ data: { workspaceId, accountId, importFileId: receipt.id, sourceMetadata: { importMode: "receipt" } } });
    const document = await db.documentImport.create({ data: { workspaceId, accountId, importFileId: receipt.id, documentFamily: "receipt" } });
    const receiptDocument = await db.receiptDocument.create({ data: { workspaceId, accountId, documentImportId: document.id } });
    const receiptRow = await db.transaction.create({ data: {
      workspaceId, accountId, importFileId: receipt.id, reviewStatus: "confirmed", date: new Date("2026-09-03"),
      amount: 13, currency: "PHP", type: "expense", merchantRaw: "Receipt coffee",
    } });
    const partial = await ledger();
    const receiptResponses = await Promise.all([resumeFile(receipt.id), resumeFile(receipt.id)]);
    assert(receiptResponses.every(response => response.status === 200));
    const outcomes = await Promise.all(receiptResponses.map(response => response.json()));
    assert(outcomes.some(outcome => outcome.resumeStrategy === "existing_receipt_link"));
    assert.deepEqual(await ledger(), partial, "Receipt replay repairs provenance without changing the saved row or balances");
    assert.equal((await db.receiptDocument.findUniqueOrThrow({ where: { id: receiptDocument.id } })).transactionId, receiptRow.id);
    const finished = await db.importFile.findUniqueOrThrow({ where: { id: receipt.id } });
    assert.equal(finished.status, "done");
    assert(finished.confirmedAt);
    await confirmImportFile(receipt.id, accountId);
    assert.deepEqual(snapshot(await db.importFile.findUniqueOrThrow({ where: { id: receipt.id } })), snapshot(finished));
    const newReceipt = await db.importFile.create({ data: {
      workspaceId, accountId, fileName: "replay-fault-receipt.jpg", fileType: "image/jpeg", storageKey: "qa/new-receipt",
      status: "processing", processingPhase: "staged",
    } });
    await db.accountStatementCheckpoint.create({ data: { workspaceId, accountId, importFileId: newReceipt.id, sourceMetadata: { importMode: "receipt" } } });
    const newDocument = await db.documentImport.create({ data: { workspaceId, accountId, importFileId: newReceipt.id, documentFamily: "receipt" } });
    const staged = await db.receiptDocument.create({ data: {
      workspaceId, accountId, documentImportId: newDocument.id, merchantRaw: "Synthetic cafe", merchantClean: "Synthetic cafe",
      transactionDate: new Date("2026-09-05"), currency: "PHP", total: 55, confidence: 97,
      rawPayload: { receiptAccountResolution: { accountId } },
    } });
    const priorReceiptSave = await ledger();
    await withCompletionFailure(async () => {
      await assert.rejects(confirmImportFile(newReceipt.id, accountId), /synthetic completion failure/);
      assert.deepEqual(await ledger(), priorReceiptSave);
      assert.equal((await db.receiptDocument.findUniqueOrThrow({ where: { id: staged.id } })).transactionId, null);
    });
    await confirmImportFile(newReceipt.id, accountId);
    await drain();
    const newReceiptRow = await db.transaction.findFirstOrThrow({ where: { importFileId: newReceipt.id } });
    assert.equal((await db.receiptDocument.findUniqueOrThrow({ where: { id: staged.id } })).transactionId, newReceiptRow.id);
    const committedReceipt = await ledger();
    await confirmImportFile(newReceipt.id, accountId);
    assert.deepEqual(await ledger(), committedReceipt, "Replaying a new receipt save changes no ledger or balance fields");
    console.log("PASS database import replay: interrupted statement and receipt rollback, concurrent resume, lost response, preserved tombstone, and legacy receipt link recovery.");
  } finally {
    await drain();
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });

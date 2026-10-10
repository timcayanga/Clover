import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55441"); assert.equal(url.pathname, "/clover_migration_qa"); assert(process.argv.includes("--execute"));
const require = createRequire(import.meta.url);
require("next/cache").revalidateTag = () => {};
const tasks: Array<() => Promise<void>> = [];
require("next/server").after = (task: () => Promise<void>) => { tasks.push(task); };
const drain = async () => { while (tasks.length) await Promise.all(tasks.splice(0).map(fn => fn())); };
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Learning-loop QA prohibits provider calls"); };
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const { processImportFileText, confirmImportFile } = await import("../workers/import-processor");
  const { recordTrainingSignal, loadConfirmedImportLabels } = await import("../lib/data-engine");
  const { processLearningJob } = await import("../lib/learning-jobs");
  const { AI_CONSENT_VERSION } = await import("../../shared/ai-consent");
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: "staging", planTier: "pro", planTierLocked: true, appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } } } });
  try {
    const w = await db.workspace.create({ data: { userId: user.id, name: "Correction to next import" } });
    const category = await db.category.create({ data: { workspaceId: w.id, name: "Reviewed learning meals", type: "expense" } });
    const settle = async () => { await drain(); for (const job of await db.learningJob.findMany({ where: { workspaceId: w.id, status: "queued" } })) await processLearningJob(job.id); };
    const upload = async (text: string, name: string, mode: "statement" | "receipt" = "statement") => {
      const file = await db.importFile.create({ data: { workspaceId: w.id, fileName: name, fileType: mode === "receipt" ? "application/pdf" : "text/csv", storageKey: `qa/${randomUUID()}`, sourceFingerprint: createHash("sha256").update(text).digest("hex") } });
      await processImportFileText(file.id, { text, importMode: mode, actorUserId: user.id }); await settle();
      const rows = await db.transaction.findMany({ where: { importFileId: file.id }, orderBy: { sourceRowKey: "asc" } });
      return { file, rows };
    };
    const correct = async (id: string, title: string) => {
      const edited = await db.$transaction(async tx => {
        const row = await tx.transaction.update({ where: { id }, data: { merchantClean: title, categoryId: category.id, reviewStatus: "edited" } });
        await recordTrainingSignal({ workspaceId: w.id, importFileId: row.importFileId, transactionId: row.id, observationId: row.updatedAt.toISOString(), merchantText: row.merchantRaw, normalizedName: title, categoryId: category.id, categoryName: category.name, type: row.type, source: "manual_recategorization", confidence: 100 }, tx);
        return row;
      }); await settle(); return json(edited);
    };
    const source = readFileSync(new URL("./fixtures/reviewed-parser-corpus/repeated-and-multicurrency.csv", import.meta.url), "utf8");
    const first = await upload(source, "first.csv"); assert.equal(first.rows.length, 3);
    const coffee = first.rows.find(r => r.merchantRaw === "Repeated coffee")!;
    const edited = await correct(coffee.id, "My reviewed coffee");
    // The account editor persists this marker with an explicitly chosen name.
    const account = await db.account.update({ where: { id: coffee.accountId }, data: { name: "My reviewed travel account", nameCustomized: true, balance: 123.45 } });
    const originals = json(await db.parsedTransaction.findMany({ where: { importFileId: first.file.id }, orderBy: { id: "asc" } }));
    // An exact older correction must survive both age and popularity cutoffs.
    await db.merchantRule.updateMany({ where: { workspaceId: w.id, source: { startsWith: "manual" } }, data: { updatedAt: new Date("2020-01-01"), timesConfirmed: 1 } });
    await db.merchantRule.createMany({ data: Array.from({ length: 510 }, (_, i) => ({ workspaceId: w.id, merchantKey: `noise ${i}`, normalizedName: `Noise ${i}`, source: "import_confirmation", timesConfirmed: 100 })) });
    const rules = json(await db.merchantRule.findMany({ where: { workspaceId: w.id, source: { startsWith: "manual" } }, orderBy: { id: "asc" } }));
    assert.equal((await loadConfirmedImportLabels(w.id, [
      { merchantRaw: "Unrelated receipt", type: "expense" },
      { merchantRaw: "Repeated coffee", type: "income" },
    ])).size, 0, "No fuzzy label or debit/credit direction override at confirmation");
    const other = await db.workspace.create({ data: { userId: user.id, name: "Other Profile" } });
    assert.equal((await loadConfirmedImportLabels(other.id, [{ merchantRaw: "Repeated coffee", type: "expense" }])).size, 0);
    const later = await upload(source.replaceAll("2026-09-15", "2026-09-16"), "later.csv");
    assert.equal(later.rows.length, 3);
    const repeated = later.rows.filter(r => r.merchantRaw === "Repeated coffee"); assert.equal(repeated.length, 2);
    for (const row of repeated) {
      assert.equal(row.merchantClean, "My reviewed coffee", "A saved correction must reach the next real import before confirmation");
      assert.equal(row.categoryId, category.id); assert.equal(row.accountId, coffee.accountId); assert.equal(Number(row.amount), 25); assert.equal(row.currency, "PHP"); assert.equal(row.type, "expense");
      assert(Array.isArray(row.learnedRuleIdsApplied) && row.learnedRuleIdsApplied.length > 0); assert(row.rawPayload && row.sourceRowKey);
    }
    assert.equal(later.rows.find(r => r.merchantRaw === "Salary")?.currency, "USD");
    await confirmImportFile(first.file.id); await settle();
    assert.deepEqual(json(await db.transaction.findUnique({ where: { id: coffee.id } })), edited);
    assert.deepEqual(json(await db.parsedTransaction.findMany({ where: { importFileId: first.file.id }, orderBy: { id: "asc" } })), originals);
    const preservedAccount = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    for (const key of ["name", "accountNumber", "currency", "balance"] as const) assert.deepEqual(json(preservedAccount[key]), json(account[key]));
    assert.deepEqual(json(await db.merchantRule.findMany({ where: { workspaceId: w.id, source: { startsWith: "manual" } }, orderBy: { id: "asc" } })), rules);
    const receipt = readFileSync(new URL("./fixtures/reviewed-parser-corpus/receipt-php-items.txt", import.meta.url), "utf8");
    const firstReceipt = await upload(receipt, "receipt-first.pdf", "receipt"); assert.equal(firstReceipt.rows.length, 1);
    const editedReceipt = await correct(firstReceipt.rows[0].id, "My reviewed cafe");
    const laterReceipt = await upload(receipt.replace("Jan 12, 2026", "Jan 13, 2026"), "receipt-later.pdf", "receipt"); assert.equal(laterReceipt.rows.length, 1);
    assert.equal(laterReceipt.rows[0].merchantClean, "My reviewed cafe"); assert.equal(laterReceipt.rows[0].categoryId, category.id);
    assert.equal(Number(laterReceipt.rows[0].amount), 172.8); assert.equal(laterReceipt.rows[0].currency, "PHP");
    await confirmImportFile(firstReceipt.file.id); await settle();
    assert.deepEqual(json(await db.transaction.findUnique({ where: { id: firstReceipt.rows[0].id } })), editedReceipt);
    assert.equal(networkCalls, 0);
    console.log("PASS real import learning loop: reviewed CSV and receipt, durable correction, older rule retrieval, next-import labels, rule provenance, repeated purchases, currencies, account/balance and original confirmed evidence preservation.");
  } finally { await drain(); await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

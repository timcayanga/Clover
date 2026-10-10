import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
const require = createRequire(import.meta.url);
require("next/cache").revalidateTag = () => {};
const tasks: Array<() => Promise<void>> = [];
require("next/server").after = (task: () => Promise<void>) => { tasks.push(task); };
const drain = async () => { while (tasks.length) await Promise.all(tasks.splice(0).map(fn => fn())); };
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Preservation QA prohibits network/AI calls"); };
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const { processImportFileText } = await import("../workers/import-processor");
  const { AI_CONSENT_VERSION } = await import("../../shared/ai-consent");
  await db.cloverDeploymentEnvironment.upsert({ where: { id: "primary" }, create: { environment: "staging" }, update: {} });
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: "staging", planTier: "pro", planTierLocked: true, appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } } } });
  try {
    const workspace = await db.workspace.create({ data: { userId: user.id, name: "Reviewed preservation QA" } });
    const other = await db.workspace.create({ data: { userId: user.id, name: "Isolated Profile" } });
    const account = await db.account.create({ data: { workspaceId: workspace.id, name: "My account", institution: "Example Bank", accountNumber: "000001", type: "bank", currency: "PHP", balance: 321.45 } });
    const foreignAccount = await db.account.create({ data: { workspaceId: other.id, name: account.name, institution: account.institution, accountNumber: account.accountNumber, type: "bank", currency: "PHP", balance: 987.65 } });
    const usdAccount = await db.account.create({ data: { workspaceId: workspace.id, name: account.name, institution: account.institution, accountNumber: account.accountNumber, type: "bank", currency: "USD", balance: 98.76 } });
    const category = await db.category.create({ data: { workspaceId: workspace.id, name: "My chosen category", type: "expense" } });
    const manual = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: account.id, categoryId: category.id, date: new Date("2025-01-01"), amount: 17.33, currency: "PHP", type: "expense", merchantRaw: "My manual entry", merchantClean: "My title", description: "My notes", reviewStatus: "confirmed", isExcluded: true, rawPayload: { source: "manual", originalInput: "17.33" } } });
    const rule = await db.merchantRule.create({ data: { workspaceId: workspace.id, merchantKey: "my-manual-entry", normalizedName: "My title", categoryId: category.id, categoryName: category.name, source: "manual", provenance: { review: "synthetic confirmed correction" } } });
    const signal = await db.trainingSignal.create({ data: { workspaceId: workspace.id, transactionId: manual.id, source: "manual_recategorization", merchantKey: "my-manual-entry", dedupeKey: "manual-review", categoryId: category.id, categoryName: category.name, type: "expense", correctedValue: { categoryId: category.id }, previousValue: { categoryName: "Other" } } });
    const header = "Migration Source,Date,Description,Amount,Currency,Account,Type,Category,Notes,Balance";
    const repeated = "spreadsheet,2026-09-15,Repeated coffee,25,PHP,My account,Expense,Food,Original note,100";
    const distinct = "spreadsheet,2026-09-16,Bus fare,10,PHP,My account,Expense,Transport,Original note,90";
    const source = [header, repeated, repeated, distinct].join("\n");
    const upload = async (text: string, name: string, workspaceId = workspace.id, accountId = account.id) => {
      const fingerprint = createHash("sha256").update(text).digest("hex");
      const file = await db.importFile.create({ data: { workspaceId, accountId, fileName: name, fileType: "text/csv", storageKey: `qa/${fingerprint}`, sourceFingerprint: fingerprint } });
      const result = await processImportFileText(file.id, { text, importMode: "statement", actorUserId: user.id });
      await drain();
      return { file, result };
    };
    const first = await upload(source, "original.csv");
    const rows = await db.transaction.findMany({ where: { importFileId: first.file.id }, orderBy: { createdAt: "asc" } });
    assert.equal(rows.length, 3, JSON.stringify(first.result));
    assert.equal(rows.filter(row => Number(row.amount) === 25 && row.date.toISOString().startsWith("2026-09-15")).length, 2, "Two real identical purchases survive first import");
    assert(rows.every(row => row.accountId === account.id && row.currency === "PHP"));
    const evidence = await db.parsedTransaction.findMany({ where: { importFileId: first.file.id }, orderBy: { id: "asc" } });
    assert.equal(evidence.length, 3, "Parsed source rows remain a distinct persisted stage");
    assert(evidence.every(row => JSON.stringify(row.rawPayload).includes("Original note")), "Original cells remain traceable");
    assert(rows.every(row => row.rawPayload && row.sourceRowKey), "Saved transactions retain source evidence and row identity");
    const protectedRows = [];
    for (const [i, status] of (["confirmed", "edited", "rejected"] as const).entries()) {
      protectedRows.push(await db.transaction.update({ where: { id: rows[i].id }, data: { reviewStatus: status, categoryId: category.id, date: new Date(`2025-01-0${i + 1}`), amount: 91.11 + i, merchantRaw: "User corrected raw title", merchantClean: `User name ${i}`, description: "User corrected notes", isExcluded: true, isTransfer: true, type: "transfer", categoryConfidence: 100, reviewReasons: ["user_decision"], normalizedPayload: { title: "User confirmed normalized fields" } } }));
    }
    const again = await upload(source, "renamed.csv");
    assert.equal(await db.transaction.count({ where: { importFileId: again.file.id } }), 0, "Renaming identical source cannot duplicate edited transactions");
    const overlap = await upload([header, repeated, repeated, repeated, distinct].join("\n"), "one-more-real-purchase.csv");
    assert.equal(await db.transaction.count({ where: { importFileId: overlap.file.id } }), 1, "An extra occurrence creates exactly one new transaction");
    for (const before of protectedRows) assert.deepEqual(json(await db.transaction.findUniqueOrThrow({ where: { id: before.id } })), json(before), `${before.reviewStatus}: all fields, evidence and timestamps preserved`);
    assert.deepEqual(json(await db.transaction.findUniqueOrThrow({ where: { id: manual.id } })), json(manual), "Manual confirmed transaction remains unchanged");
    assert.deepEqual(json(await db.parsedTransaction.findMany({ where: { importFileId: first.file.id }, orderBy: { id: "asc" } })), json(evidence), "Prior parsed evidence remains unchanged");
    const fileAfter = await db.importFile.findUniqueOrThrow({ where: { id: first.file.id } });
    assert.equal(fileAfter.storageKey, first.file.storageKey); assert.equal(fileAfter.sourceFingerprint, first.file.sourceFingerprint);
    for (const before of [account, foreignAccount, usdAccount]) {
      const after = await db.account.findUniqueOrThrow({ where: { id: before.id } });
      for (const key of ["workspaceId", "name", "institution", "accountNumber", "type", "currency", "balance"] as const) assert.deepEqual(json(after[key]), json(before[key]), `Preserve account ${key}`);
    }
    assert.equal(await db.transaction.count({ where: { workspaceId: other.id } }), 0, "Identical identity in another Profile receives no writes");
    assert.deepEqual(json(await db.merchantRule.findUniqueOrThrow({ where: { id: rule.id } })), json(rule), "Unrelated durable manual rule remains intact");
    assert.deepEqual(json(await db.trainingSignal.findUniqueOrThrow({ where: { id: signal.id } })), json(signal), "Confirmed correction signal remains intact");
    assert.equal(networkCalls, 0);
    console.log("PASS real worker preservation: confirmed/edited/rejected/manual values, account and Profile identity, balances, currencies, occurrence counts, raw/normalized separation, source hashes, parsed evidence, learned rules and corrections.");
  } finally { await drain(); await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { processImportFileText } from "@/workers/import-processor";
import { AI_CONSENT_VERSION } from "../../shared/ai-consent";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55441"); assert.equal(url.pathname, "/clover_migration_qa"); assert(process.argv.includes("--execute"));
createRequire(import.meta.url)("next/cache").revalidateTag = () => {};
const postTasks: Array<() => Promise<void>> = [];
createRequire(import.meta.url)("next/server").after = (task: () => Promise<void>) => { postTasks.push(task); };
const drain = async () => { while (postTasks.length) await Promise.all(postTasks.splice(0).map(task => task())); };
let owner: string | undefined; let networkCalls = 0;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error("Migration QA prohibits network/AI calls"); };
async function main() {
 await prisma.cloverDeploymentEnvironment.upsert({ where: { id: "primary" }, create: { environment: "staging" }, update: {} });
 const u = await prisma.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: "staging", planTier: "pro", planTierLocked: true, appPreferences: { aiConsent: { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString(), withdrawnAt: null } } } }); owner = u.id;
 const w = await prisma.workspace.create({ data: { userId: u.id, name: "Migration synthetic QA" } });
 const text = readFileSync("public/templates/clover-migration.csv", "utf8").replace("personal,false,example-1", "personal;work,true,example-1");
 const upload = async (content: string, name: string) => {
  const f = await prisma.importFile.create({ data: { workspaceId: w.id, fileName: name, fileType: "text/csv", storageKey: "qa/synthetic-migration" } });
  const start = performance.now(); const result = await processImportFileText(f.id, { text: content, importMode: "statement", actorUserId: u.id });
  return { result, id: f.id, ms: Math.round(performance.now() - start) };
 };
 const first = await upload(text, "migration.csv");
 const rows = await prisma.transaction.findMany({ where: { workspaceId: w.id, deletedAt: null }, include: { account: true, category: true, transactionTags: { include: { tag: true } } } });
 assert.equal(rows.length, 4, JSON.stringify(first.result));
 const lunch = rows.find(r => r.merchantRaw === "Lunch")!;
 assert(lunch); assert.equal(lunch.account.name, "Cash"); assert.equal(lunch.category?.name, "Food / Lunch"); assert.equal(lunch.isExcluded, true); assert.equal(lunch.type, "expense"); assert.deepEqual(lunch.transactionTags.map(t => t.tag.name).sort(), ["personal", "work"]);
 assert.equal(rows.filter(r => r.isTransfer).length, 2); assert.equal(rows.find(r => r.merchantRaw === "Monthly pay")?.type, "income");
 await prisma.transaction.update({ where: { id: lunch.id }, data: { merchantClean: "My confirmed lunch", reviewStatus: "confirmed" } });
 const again = await upload(text + "\nspreadsheet,2026-09-06,New purchase,25,PHP,Cash,Expense,Food,,,false,example-new\n", "overlap.csv");
 assert.equal(await prisma.transaction.count({ where: { workspaceId: w.id, deletedAt: null } }), 5, JSON.stringify(again.result));
 assert.equal((await prisma.transaction.findUnique({ where: { id: lunch.id } }))?.merchantClean, "My confirmed lunch");
 const blue = await upload(readFileSync("scripts/fixtures/app-migrations/bluecoins-official-advanced.csv", "utf8"), "bluecoins.csv");
 assert.equal(await prisma.transaction.count({ where: { importFileId: blue.id, deletedAt: null } }), 9, JSON.stringify(blue.result));
 const extra = [
  { name: "realbyte.csv", count: 3, text: "Date,Account,Category,Subcategory,Note,Amount,Income/Expense,Description,Currency\n09/02/2026,BPI,Work,Stipend,Employer,10000,Income,monthly,PHP\n09/03/2026,BPI,Savings,,Transfer,1000,Transfer out,,PHP" },
  { name: "money-lover.csv", count: 1, text: "Date,Wallet,Category,Amount,Note,Type,Currency\n2026-09-02,BCA,Work,5000000,Employer,Income,IDR" },
  { name: "wallet.csv", count: 1, text: "date,account,category,amount,currency,ref_currency_amount,payment_type,type,note,tags,excluded\n2026-09-01,BPI,Food,-501,PHP,-9,card,Expense,Wallet lunch,travel|work,true" },
 ];
 for (const fixture of extra) {
  const run = await upload(fixture.text, fixture.name);
  const saved = await prisma.transaction.findMany({ where: { importFileId: run.id, deletedAt: null }, include: { account: true } });
  assert.equal(saved.length, fixture.count, fixture.name + JSON.stringify(run.result));
  if (fixture.name === "realbyte.csv") assert.equal(saved.filter(r => r.isTransfer).length, 2);
  if (fixture.name === "money-lover.csv") { assert.equal(saved[0].currency, "IDR"); assert.equal(Number(saved[0].amount), 5000000); assert.equal(saved[0].account.name, "BCA"); }
 }
 const mixed = await upload("Migration Source,Date,Description,Amount,Currency,Account,Type,Category\nspreadsheet,2026-09-06,US dollars,100,USD,Travel,Income,Salary\nspreadsheet,2026-09-06,Philippine pesos,200,PHP,Travel,Income,Salary", "mixed.csv");
 const mixedRows = await prisma.transaction.findMany({ where: { importFileId: mixed.id }, include: { account: true } });
 assert.equal(mixedRows.length, 2); assert.notEqual(mixedRows[0].accountId, mixedRows[1].accountId);
 assert(mixedRows.every(r => r.currency === r.account.currency && r.account.name === "Travel"));
 const large = ["Migration Source,Date,Description,Amount,Currency,Account,Type,Category", ...Array.from({length:1000}, (_,i) => `spreadsheet,2026-09-01,Migration purchase ${i},12.50,PHP,QA Ledger,Expense,Source category`)].join("\n");
 const largeRun = await upload(large, "large.csv");
 assert.equal(await prisma.transaction.count({where: {importFileId: largeRun.id}}), 1000);
 assert(largeRun.ms < 10000, `Local 1,000-row worker exceeded 10s: ${largeRun.ms}`);
 await drain();
 assert.equal(networkCalls, 0);
 console.log(JSON.stringify({ passed: true, firstImportMs: first.ms, duplicateMs: again.ms, bluecoinsMs: blue.ms, networkCalls, tags: "preserved", exclusions: "preserved", confirmedEdits: "preserved", savedTransactions: await prisma.transaction.count({ where: { workspaceId: w.id } }), thousandRowWorkerMs: largeRun.ms }));
}
main().finally(async () => { globalThis.fetch = fetchOriginal; await drain(); if (owner) await prisma.user.delete({ where: { id: owner } }); await prisma.$disconnect(); }).catch(error => { console.error(error); process.exitCode = 1; });

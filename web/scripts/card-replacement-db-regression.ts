import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { matchingBankAccounts } from "../lib/finverse-matching";
import { findBestImportedAccountMatch, scoreDurableImportedAccountIdentityMatch } from "../lib/workspace-cache";
import { publicCardHistory } from "../../shared/card-replacement";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
globalThis.fetch = async () => { throw Error("Card replacement QA forbids external services"); };
const require = createRequire(import.meta.url);
require("next/cache").revalidateTag = () => {};
require("next/server").after = () => {};
async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: "staging", planTier: "pro", planTierLocked: true } });
  const path = require.resolve("../lib/auth"), oldAuth = require.cache[path];
  let caller = user.clerkUserId;
  require.cache[path] = { id: path, filename: path, loaded: true, exports: { isLocalDevHost: async () => false, requireAuth: async () => ({ userId: caller }) } } as NodeModule;
  try {
    const { PATCH } = await import("../app/api/accounts/[accountId]/route");
    const { replaceAccountCard } = await import("../lib/card-replacement");
    const { confirmImportFile } = await import("../workers/import-processor");
    const workspace = await db.workspace.create({ data: { userId: user.id, name: "Disposable replacement QA" } });
    const otherProfile = await db.workspace.create({ data: { userId: user.id, name: "Other Profile" } });
    const account = await db.account.create({ data: { workspaceId: workspace.id, name: "My bank", institution: "BPI", accountNumber: "123456783012", importIdentityAccountNumber: "123456783012", importIdentityInstitution: "BPI", currency: "PHP", type: "bank", source: "manual", balance: "765.43", nameCustomized: true } });
    const transaction = await db.transaction.create({ data: { workspaceId: workspace.id, accountId: account.id, date: new Date("2026-10-01"), amount: "97.25", type: "expense", currency: "PHP", merchantRaw: "Original raw merchant", merchantClean: "User corrected", reviewStatus: "confirmed", rawPayload: { untouched: "source evidence" }, normalizedPayload: { userNote: "Keep this" } } });
    const makeInput = (expectedLastFour: string | null, newLastFour: string) => ({ requestId: randomUUID(), expectedLastFour, newLastFour, effectiveDate: "2026-11-05", reason: "stolen" as const, confirmed: true as const });
    const send = (replacement: unknown, extra = {}, origin = "https://clover.test", id = account.id) => PATCH(new Request(`https://clover.test/api/accounts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ workspaceId: workspace.id, replacement, ...extra }) }), { params: Promise.resolve({ accountId: id }) });
    const first = makeInput("3012", "8745");
    assert.equal((await send(first, {}, "https://evil.test")).status, 403);
    assert.equal((await send({ ...first, confirmed: false })).status, 400);
    assert.equal((await send({ ...first, newLastFour: "1111222233334444" })).status, 400);
    assert.equal((await send(first, { balance: "999" })).status, 400);
    assert.equal((await send(first, { workspaceId: otherProfile.id })).status, 404);
    caller = "another-owner";
    assert.equal((await send(first)).status, 401);
    caller = user.clerkUserId;
    assert.deepEqual(await db.account.findUniqueOrThrow({ where: { id: account.id } }), account);
    const responses = await Promise.all([send(first), send(first)]);
    for (const response of responses) assert.equal(response.status, 200, await response.clone().text());
    const publicAccount = (await responses[0].json()).account;
    assert.equal(publicAccount.cardNumberHistory.length, 1);
    assert(!JSON.stringify(publicAccount.cardNumberHistory).includes(user.clerkUserId));
    assert(!JSON.stringify(publicAccount.cardNumberHistory).includes(first.requestId));
    let current = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    assert.equal(current.accountNumber, "•••• 8745");
    const { accountNumber: _number, cardNumberHistory: _history, updatedAt: _updated, ...unchanged } = current;
    const { accountNumber: _oldNumber, cardNumberHistory: _oldHistory, updatedAt: _oldUpdated, ...original } = account;
    assert.deepEqual(unchanged, original, "Replacement may only change the current number, history and updatedAt");
    assert.deepEqual(await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }), transaction);
    assert.equal((await send({ ...first, newLastFour: "9000" })).status, 409);
    assert.equal((await send(makeInput("3012", "9000"))).status, 409);
    const second = makeInput("8745", "9000"), competing = makeInput("8745", "9001");
    const races = await Promise.all([send(second), send(competing)]);
    assert.deepEqual(races.map(r => r.status).sort(), [200, 409]);
    current = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    const finalSuffix = current.accountNumber!.slice(-4);
    assert.equal(publicCardHistory(current.cardNumberHistory).length, 2);
    assert.equal((await send(first)).status, 200, "An old retry returns the current account without restoring an old number");
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: account.id } })).accountNumber, current.accountNumber);
    const incoming = (digits: string) => ({ name: "BPI " + digits, institution: "BPI", accountNumber: "****" + digits, currency: "PHP", type: "bank" });
    for (const digits of ["3012", "8745", finalSuffix]) {
      assert.equal(matchingBankAccounts([current], incoming(digits)).length, 1);
      assert.equal(scoreDurableImportedAccountIdentityMatch(current, incoming(digits)), 100);
    }
    for (const identity of [incoming("1111"), { ...incoming("3012"), currency: "USD" }, { ...incoming("3012"), institution: "BDO" }, { ...incoming("3012"), type: "credit_card" }]) {
      assert.equal(matchingBankAccounts([current], identity).length, 0);
      assert.equal(scoreDurableImportedAccountIdentityMatch(current, identity), 0);
    }
    const collision = await db.account.create({ data: { workspaceId: workspace.id, name: "Separate BPI", institution: "BPI", type: "bank", currency: "PHP", accountNumber: "5555" } });
    assert.equal((await send(makeInput(finalSuffix, "5555"))).status, 409);
    const cash = await db.account.create({ data: { workspaceId: workspace.id, name: "Cash", type: "cash", currency: "PHP" } });
    assert.equal((await send(makeInput(null, "5555"), {}, "https://clover.test", cash.id)).status, 400);
    await assert.rejects(replaceAccountCard(account.id, workspace.id, "wrong-owner", makeInput(finalSuffix, "4444")), /Profile not found/);
    // Real worker persistence: old/new statement numbers reuse this account,
    // preserve the current number and never rewrite confirmed financial rows.
    for (const [index, digits] of ["3012", "8745", finalSuffix].entries()) {
      const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: `replacement-${index}.csv`, fileType: "text/csv", storageKey: "qa/" + randomUUID(), status: "processing" } });
      await db.parsedTransaction.create({ data: { workspaceId: workspace.id, importFileId: file.id, institution: "BPI", accountName: "BPI " + digits, accountNumber: "****" + digits, date: new Date(`2026-10-${10 + index}`), amount: 10 + index, currency: "PHP", type: "expense", merchantRaw: "Invented purchase " + index, categoryName: "Food & Dining", confidence: 99, rawPayload: { source: "structured_transaction_csv", sourceRowIndex: 1, accountType: "bank", parserConfidence: 100 } } });
      await confirmImportFile(file.id);
      const saved = await db.transaction.findMany({ where: { importFileId: file.id } });
      assert.equal(saved.length, 1); assert.equal(saved[0].accountId, account.id);
      assert.equal((await db.account.findUniqueOrThrow({ where: { id: account.id } })).accountNumber, current.accountNumber);
      const before = JSON.stringify(saved); await confirmImportFile(file.id);
      assert.equal(JSON.stringify(await db.transaction.findMany({ where: { importFileId: file.id } })), before);
      assert.deepEqual(await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }), transaction);
    }
    assert.equal(await db.account.count({ where: { workspaceId: workspace.id } }), 3, "No duplicate replacement account is created");
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: collision.id } })).accountNumber, "5555");
    const duplicateSuffix = await db.account.create({ data: { workspaceId: workspace.id, name: "Separate full BPI number", institution: "BPI", type: "bank", currency: "PHP", accountNumber: "9999993012" } });
    assert.equal(findBestImportedAccountMatch([current, duplicateSuffix], incoming("3012")), null, "A reused last four must never silently select the replacement account");
    const unknown = await db.importFile.create({ data: { workspaceId: workspace.id, accountId: account.id, fileName: "unknown-number.csv", fileType: "text/csv", storageKey: "qa/" + randomUUID(), status: "processing" } });
    await db.parsedTransaction.create({ data: { workspaceId: workspace.id, importFileId: unknown.id, institution: "BPI", accountName: "BPI 1111", accountNumber: "****1111", date: new Date("2026-10-21"), amount: 55, currency: "PHP", type: "expense", merchantRaw: "Unknown card purchase", confidence: 99, rawPayload: { source: "structured_transaction_csv", sourceRowIndex: 1, accountType: "bank", parserConfidence: 100 } } });
    await assert.rejects(confirmImportFile(unknown.id, account.id), /different card number/);
    assert.equal(await db.transaction.count({ where: { importFileId: unknown.id } }), 0);
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: account.id } })).accountNumber, current.accountNumber);
    assert.deepEqual(await db.transaction.findUniqueOrThrow({ where: { id: transaction.id } }), transaction);

    // Force the real worker's read/save interleaving: a user confirms a
    // replacement after identity inference but before the account UPDATE.
    const raceAccount = await db.account.create({data:{workspaceId:otherProfile.id,name:"Old user-visible title",institution:"BPI",type:"bank",currency:"PHP",accountNumber:"123456783012",source:"upload",balance:"500"}});
    const raceFile = await db.importFile.create({data:{workspaceId:otherProfile.id,accountId:raceAccount.id,fileName:"delayed-statement.csv",fileType:"text/csv",storageKey:"qa/"+randomUUID(),status:"processing"}});
    await db.parsedTransaction.create({data:{workspaceId:otherProfile.id,importFileId:raceFile.id,institution:"BPI",accountName:"BPI 3012",accountNumber:"****3012",date:new Date("2026-10-22"),amount:25,currency:"PHP",type:"expense",merchantRaw:"Delayed purchase",confidence:99,rawPayload:{source:"structured_transaction_csv",sourceRowIndex:1,accountType:"bank",parserConfidence:100}}});
    const originalUpdate = db.account.update;
    let interleaved = false;
    db.account.update = (async (args: Parameters<typeof originalUpdate>[0]) => {
      if(args.where.id === raceAccount.id && !interleaved) {
        interleaved = true;
        await replaceAccountCard(raceAccount.id,otherProfile.id,user.clerkUserId,makeInput("3012","8745"));
      }
      return originalUpdate.call(db.account,args);
    }) as typeof originalUpdate;
    try { await assert.rejects(confirmImportFile(raceFile.id,raceAccount.id)); }
    finally { db.account.update = originalUpdate; }
    assert(interleaved,"Exercise the account write, not just the matching helper");
    const afterRace = await db.account.findUniqueOrThrow({where:{id:raceAccount.id}});
    assert.equal(afterRace.accountNumber,"•••• 8745");
    assert.equal(afterRace.name,raceAccount.name);
    assert.equal(String(afterRace.balance),"500");
    assert.equal(await db.transaction.count({where:{importFileId:raceFile.id}}),0,"A stale import cannot partially record finance");
    console.log("PASS card replacement: real PATCH auth/origin/Profile, idempotency/concurrency, masked audit, collision refusal, old/new import and sync matching, confirmed source/finance preservation, repeated confirmation.");
  } finally {
    if (oldAuth) require.cache[path] = oldAuth; else delete require.cache[path];
    await db.user.delete({ where: { id: user.id } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

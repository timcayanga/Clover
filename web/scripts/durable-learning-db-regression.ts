import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { LearningAction } from "../lib/learning-jobs";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55441"); assert.equal(url.pathname, "/clover_migration_qa"); assert(process.argv.includes("--execute"));
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("Learning QA prohibits provider calls"); };
const json = (v: unknown) => JSON.parse(JSON.stringify(v));
async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const { enqueueLearningJob: enqueue, processLearningJob: processJob, retryLearningJob: retry, learningFailure } = await import("../lib/learning-jobs");
  const { recordTrainingSignal: record, loadMerchantRules, loadTrainingSignals, loadAccountRules, normalizeAccountRuleKey, loadBestStatementTemplateForInstitution, loadScoredStatementTemplatesForInstitution, classifyMerchant, normalizeMerchantText, buildTrainingSignalDedupeKey } = await import("../lib/data-engine");
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: "staging" } });
  const w = await db.workspace.create({ data: { userId: user.id, name: "Learning preservation" } });
  const other = await db.workspace.create({ data: { userId: user.id, name: "Isolated learning" } });
  const category = await db.category.create({ data: { workspaceId: w.id, name: "My category", type: "expense" } });
  const alternate = await db.category.create({ data: { workspaceId: w.id, name: "Another category", type: "expense" } });
  const foreign = await db.category.create({ data: { workspaceId: other.id, name: "Private category", type: "expense" } });
  const account = await db.account.create({ data: { workspaceId: w.id, name: "Preserve account", institution: "Example Bank", accountNumber: "000001", currency: "PHP", type: "bank", balance: 123.45 } });
  const file = await db.importFile.create({ data: { workspaceId: w.id, accountId: account.id, fileName: "retained.csv", fileType: "text/csv", storageKey: "synthetic/retained", sourceFingerprint: "retained-source-sha" } });
  const transaction = await db.transaction.create({ data: { workspaceId: w.id, accountId: account.id, importFileId: file.id, categoryId: category.id, merchantRaw: "Preserved purchase", merchantClean: "My confirmed title", description: "Original evidence", date: new Date("2026-01-01"), amount: 25, currency: "PHP", type: "expense", reviewStatus: "edited", rawPayload: { original: "PHP25.00" }, normalizedPayload: { user: "confirmed" } } });
  const input = (name: string) => ({ workspaceId: w.id, importFileId: file.id, merchantText: name, categoryId: category.id, categoryName: category.name, type: "expense" as const, source: "training_upload" as const, confidence: 75, teachabilityScore: 60 });
  const action = (name: string): LearningAction => ({ kind: "signal", input: input(name) });
  const make = async (source: string, actions: LearningAction[]) => (await enqueue({ workspaceId: w.id, source, sourceId: file.id, actions }))!;
  try {
    const jobsBefore = await db.learningJob.count();
    await assert.rejects(db.$transaction(async tx => {
      await tx.transaction.update({ where: { id: transaction.id }, data: { merchantClean: "Must roll back" } });
      await record(input("Atomic outbox"), tx);
      throw new Error("Interrupted financial save");
    }));
    assert.equal(await db.learningJob.count(), jobsBefore);
    assert.deepEqual(json(await db.transaction.findUnique({ where: { id: transaction.id } })), json(transaction));
    await db.$transaction(async tx => { await record(input("Atomic outbox"), tx); });
    const queued = await db.learningJob.findFirstOrThrow({ where: { workspaceId: w.id } });
    assert.equal(queued.status, "queued"); assert.equal(await db.trainingSignal.count({ where: { workspaceId: w.id } }), 0);
    await processJob(queued.id);
    const historical = await db.trainingSignal.create({ data: { workspaceId: w.id, importFileId: file.id, source: "import_confirmation", merchantKey: "retained legacy", dedupeKey: "legacy", categoryId: category.id, type: "expense", previousValue: { original: "review evidence" } } });
    // Database failure between the signal and rule must roll back the whole item.
    await db.$executeRawUnsafe(`CREATE FUNCTION learning_qa_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."merchantKey" = 'checkpoint failure' THEN RAISE EXCEPTION 'private-source-and-secret-must-not-leak'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER learning_qa_fail BEFORE INSERT OR UPDATE ON "MerchantRule" FOR EACH ROW EXECUTE FUNCTION learning_qa_fail()`);
    const actions = [action("Checkpoint first"), action("Checkpoint failure"), action("Checkpoint last")];
    const batch = await make("regression", actions);
    const failed = (await processJob(batch.id))!;
    assert.equal(failed.status, "failed"); assert.equal(failed.nextIndex, 1); assert.equal(failed.appliedItems, 1);
    assert.equal(await db.trainingSignal.count({ where: { workspaceId: w.id, merchantKey: "checkpoint failure" } }), 0);
    assert(!JSON.stringify(failed).includes("private-source-and-secret"));
    const firstRule = await db.merchantRule.findUniqueOrThrow({ where: { workspaceId_merchantKey: { workspaceId: w.id, merchantKey: "checkpoint first" } } });
    assert.equal((await make("regression", actions)).nextIndex, 1);
    await db.$executeRawUnsafe(`DROP TRIGGER learning_qa_fail ON "MerchantRule"`); await db.$executeRawUnsafe(`DROP FUNCTION learning_qa_fail()`);
    await Promise.all([retry(batch.id, w.id), retry(batch.id, w.id), processJob(batch.id)]);
    const done = await db.learningJob.findUniqueOrThrow({ where: { id: batch.id }, include: { runs: true } });
    assert.equal(done.status, "completed"); assert.equal(done.nextIndex, 3); assert.equal(done.appliedItems, 3);
    assert(done.runs.some(run => run.status === "failed" && run.errorMessage));
    assert.deepEqual(json(await db.merchantRule.findUnique({ where: { id: firstRule.id } })), json(firstRule));
    await processJob(batch.id); assert.equal((await db.learningJob.findUniqueOrThrow({ where: { id: batch.id } })).attempts, done.attempts);
    const overlapping = await make("overlapping-batch", [actions[0]]); await processJob(overlapping.id);
    assert.deepEqual(json(await db.merchantRule.findUnique({ where: { id: firstRule.id } })), json(firstRule), "Other batches cannot inflate the same observation");

    const interrupted = await make("interruption", [action("Resume one"), action("Resume two"), action("Resume three")]);
    await processJob(interrupted.id, { maxItems: 1 });
    await db.learningJob.update({ where: { id: interrupted.id }, data: { status: "running", leaseToken: "stopped-worker", lockedUntil: new Date(0), attempts: { increment: 1 } } });
    await db.learningJobAttempt.create({ data: { jobId: interrupted.id, attempt: 2, status: "running", startIndex: 1, endIndex: 1 } });
    await processJob(interrupted.id);
    const resumed = await db.learningJob.findUniqueOrThrow({ where: { id: interrupted.id }, include: { runs: true } });
    assert.equal(resumed.nextIndex, 3); assert.equal(resumed.appliedItems, 3); assert(resumed.runs.some(run => run.errorCode === "LEASE_EXPIRED"));
    const many = await make("large-import", Array.from({ length: 205 }, (_, i) => action(`Distinct retailer ${i}`)));
    // Measure real PostgreSQL result payloads, including UPDATE RETURNING. A
    // large immutable batch must not be transferred again for every item.
    const originalQuery = Client.prototype.query;
    let payloadReads = 0, payloadBytes = 0;
    Client.prototype.query = function (...args: unknown[]) {
      const result = (originalQuery as (...args: unknown[]) => unknown).apply(this, args);
      if (!result || typeof (result as Promise<unknown>).then !== "function") return result;
      return (result as Promise<{ fields?: { name: string }[]; rows?: unknown[][] }>).then(response => {
        const index = response.fields?.findIndex(field => field.name === "payload") ?? -1;
        if (index >= 0) for (const row of response.rows ?? []) {
          payloadReads++; payloadBytes += Buffer.byteLength(JSON.stringify(row[index]));
        }
        return response;
      });
    } as typeof originalQuery;
    try { for (let i = 0; i < 5; i++) await processJob(many.id, { maxItems: 50 }); }
    finally { Client.prototype.query = originalQuery; }
    assert(payloadReads >= 5 && payloadReads <= 10, `Expected bounded payload reads across five slices, got ${payloadReads}`);
    assert(payloadBytes <= Buffer.byteLength(JSON.stringify(many.payload)) * 10, "Payload traffic must scale with slices, not squared with batch size");
    console.log(`PASS learning payload budget: ${payloadReads} batch reads, ${payloadBytes} bytes for 205 observations in five resumable slices.`);
    assert.equal((await db.learningJob.findUniqueOrThrow({ where: { id: many.id } })).nextIndex, 205);
    assert.deepEqual(json(await db.trainingSignal.findUnique({ where: { id: historical.id } })), json(historical));

    const old = new Date("2020-01-01");
    const oldRule = await db.merchantRule.create({ data: { workspaceId: w.id, merchantKey: "rare legacy merchant", merchantPattern: "Rare legacy merchant", normalizedName: "My old title", categoryId: alternate.id, categoryName: alternate.name, source: "manual_recategorization", createdAt: old, updatedAt: old } });
    await db.merchantRule.createMany({ data: Array.from({ length: 550 }, (_, i) => ({ workspaceId: w.id, merchantKey: `noise rule ${i}`, normalizedName: "Noise", categoryId: category.id, source: "import_confirmation", timesConfirmed: 20 })) });
    await db.trainingSignal.createMany({ data: Array.from({ length: 550 }, (_, i) => ({ workspaceId: w.id, merchantKey: `noise signal ${i}`, dedupeKey: `noise-${i}`, merchantTokens: ["noise"], categoryId: category.id, type: "expense" as const, source: "training_upload" as const })) });
    const oldSignal = await db.trainingSignal.create({ data: { workspaceId: w.id, merchantKey: "ancient correction", dedupeKey: "ancient", categoryId: alternate.id, categoryName: alternate.name, merchantTokens: ["ancient", "correction"], type: "expense", source: "manual_recategorization", createdAt: old, updatedAt: old } });
    await db.trainingSignal.create({ data: { workspaceId: w.id, merchantKey: "suspended correction", dedupeKey: "suspended", categoryId: category.id, type: "expense", source: "manual_recategorization", approvalStatus: "suspended" } });
    await db.merchantRule.create({ data: { workspaceId: other.id, merchantKey: "rare legacy merchant", normalizedName: "Foreign", categoryId: foreign.id, source: "manual" } });
    assert(!(await loadMerchantRules(w.id)).some(rule => rule.merchantKey === oldRule.merchantKey));
    const rules = await loadMerchantRules(w.id, [{ merchantRaw: "Rare legacy merchant" }]);
    assert(rules.some(rule => rule.merchantKey === oldRule.merchantKey)); assert(!rules.some(rule => rule.normalizedName === "Foreign"));
    assert.equal(classifyMerchant({ merchantText: "Rare legacy merchant", type: "expense", merchantRules: rules, trainingSignals: [] }).categoryName, alternate.name);
    const signals = await loadTrainingSignals(w.id, [{ merchantRaw: "Ancient correction" }, { merchantRaw: "Suspended correction" }]);
    assert(signals.some(signal => signal.merchantKey === oldSignal.merchantKey)); assert(!signals.some(signal => signal.merchantKey === "suspended correction"));
    assert.equal(classifyMerchant({ merchantText: "Ancient correction", type: "expense", merchantRules: [], trainingSignals: signals }).categoryName, alternate.name);

    const older = await make("old-review", [{ kind: "signal", input: { ...input("Conflicting retailer"), source: "manual_recategorization", normalizedName: "Older label" } }]);
    await db.learningJob.update({ where: { id: older.id }, data: { createdAt: old } });
    const newer = await make("new-review", [{ kind: "signal", input: { ...input("Conflicting retailer"), source: "manual_recategorization", categoryId: alternate.id, normalizedName: "Latest label" } }]);
    await processJob(newer.id); await processJob(older.id);
    await record({ ...input("Conflicting retailer"), source: "import_confirmation", confidence: 100, normalizedName: "Automatic label" });
    const protectedRule = await db.merchantRule.findUniqueOrThrow({ where: { workspaceId_merchantKey: { workspaceId: w.id, merchantKey: "conflicting retailer" } } });
    assert.equal(protectedRule.normalizedName, "Latest label"); assert.equal(protectedRule.categoryId, alternate.id);
    const currentSignal = (await loadTrainingSignals(w.id, [{ merchantRaw: "Conflicting retailer" }])).find(signal => signal.merchantKey === "conflicting retailer");
    assert.equal(currentSignal?.categoryId, alternate.id, "Delayed processing time and automatic observations cannot demote the latest manual correction");
    const mismatch = await make("invalid-scope", [{ kind: "signal", input: { ...input("Foreign category attempt"), categoryId: foreign.id } }]);
    await processJob(mismatch.id);
    assert.equal((await db.learningJob.findUniqueOrThrow({ where: { id: mismatch.id } })).errorCode, "CATEGORY_UNAVAILABLE");
    assert.equal(await db.trainingSignal.count({ where: { workspaceId: w.id, categoryId: foreign.id } }), 0);
    const suspendedInput = input("Never reactivate"); await record(suspendedInput);
    const dedupeKey = buildTrainingSignalDedupeKey({ ...suspendedInput, merchantKey: normalizeMerchantText(suspendedInput.merchantText) });
    await db.trainingSignal.update({ where: { workspaceId_dedupeKey: { workspaceId: w.id, dedupeKey } }, data: { approvalStatus: "suspended" } });
    await record({ ...suspendedInput, notes: "New retry variation" });
    assert.equal((await db.trainingSignal.findUniqueOrThrow({ where: { workspaceId_dedupeKey: { workspaceId: w.id, dedupeKey } } })).approvalStatus, "suspended");
    // Retrieval also reaches old family, account and statement-layout memory.
    await db.merchantRule.create({ data: { workspaceId: w.id, merchantKey: "old woodland groceries", merchantPattern: "Woodland groceries", normalizedName: "Woodland groceries", categoryId: alternate.id, categoryName: alternate.name, source: "manual_recategorization", createdAt: old, updatedAt: old } });
    const familyRules = await loadMerchantRules(w.id, [{ merchantRaw: "Woodland groceries outlet" }]);
    assert(familyRules.some(rule => rule.merchantKey === "old woodland groceries"));
    const oldAccountRule = await db.accountRule.create({ data: { workspaceId: w.id, ruleKey: normalizeAccountRuleKey("Historical account", "Example Bank"), accountName: "Historical account", institution: "Example Bank", accountType: "bank", accountId: account.id, source: "manual", createdAt: old, updatedAt: old } });
    await db.accountRule.createMany({ data: Array.from({ length: 260 }, (_, i) => ({ workspaceId: w.id, ruleKey: `noise-account-${i}`, accountName: `Noise account ${i}`, accountType: "bank" as const, timesConfirmed: 20 })) });
    assert(!(await loadAccountRules(w.id)).some(rule => rule.ruleKey === oldAccountRule.ruleKey));
    assert((await loadAccountRules(w.id, [{ accountName: "Historical account", institution: "Example Bank" }])).some(rule => rule.ruleKey === oldAccountRule.ruleKey && rule.accountId === account.id));
    const oldTemplate = await db.statementTemplate.create({ data: { workspaceId: w.id, fingerprint: "old-family", institution: "BPI", fileType: "application/pdf", parserVersion: "v2", parserConfig: { statementFamilySignature: "rare-family", accountType: "bank", source: "data_qa_review" }, createdAt: old, updatedAt: old } });
    await db.statementTemplate.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ workspaceId: w.id, fingerprint: `noise-template-${i}`, institution: "BPI", fileType: "application/pdf", parserVersion: "v2", successCount: 30 })) });
    const templateQuery = { workspaceId: w.id, institution: "BPI", fileType: "application/pdf", accountType: "bank" as const, statementFamilySignature: "rare-family" };
    assert.equal((await loadBestStatementTemplateForInstitution(templateQuery))?.id, oldTemplate.id);
    assert((await loadScoredStatementTemplatesForInstitution(templateQuery)).some(row => row.template.id === oldTemplate.id));
    assert.equal(await retry(mismatch.id, other.id), null, "A Profile-scoped retry cannot process another Profile's job");

    const editedSource = await db.transaction.create({ data: { workspaceId: w.id, accountId: account.id, categoryId: category.id, merchantRaw: "Durable editor merchant", merchantClean: "My editor title", date: new Date("2026-01-01"), amount: 10, currency: "PHP", type: "expense", reviewStatus: "edited" } });
    const editAction: LearningAction = { kind: "signal", input: { ...input(editedSource.merchantRaw), transactionId: editedSource.id, observationId: editedSource.updatedAt.toISOString(), normalizedName: editedSource.merchantClean, source: "manual_recategorization" } };
    const editJob = await make("saved-edit", [editAction]);
    await db.transaction.update({ where: { id: editedSource.id }, data: { description: "An unrelated note was edited", updatedAt: new Date(Date.now() + 1000) } });
    assert.equal((await processJob(editJob.id))?.appliedItems, 1, "Unrelated edits do not discard a saved correction");
    const obsolete = await make("obsolete-edit", [{ kind: "signal", input: { ...editAction.input, notes: "Old label observation" } }]);
    await db.transaction.update({ where: { id: editedSource.id }, data: { merchantClean: "A newer confirmed title" } });
    assert.equal((await processJob(obsolete.id))?.skippedItems, 1, "A superseded label must not be learned");

    const reviewedAccount = await db.accountRule.create({ data: { workspaceId: w.id, ruleKey: normalizeAccountRuleKey("Reviewed alias", "Example Bank"), accountName: "Reviewed alias", institution: "Example Bank", accountId: account.id, accountType: "bank", source: "data_qa_review" } });
    const automaticAccount = await make("automatic-account-refresh", [{ kind: "account", input: { workspaceId: w.id, accountName: "Reviewed alias", institution: "Example Bank", accountType: "wallet", source: "automated_qa" } }]);
    await processJob(automaticAccount.id);
    assert.deepEqual(json(await db.accountRule.findUnique({ where: { id: reviewedAccount.id } })), json(reviewedAccount));

    // Save template work before its source finishes; interrupted scheduling loses nothing.
    const templateSource = await db.importFile.create({ data: { workspaceId: w.id, fileName: "template.csv", fileType: "text/csv", storageKey: "synthetic/template", status: "processing" } });
    const candidate = (merchantSeed: string) => ({ merchantSeed, categoryName: category.name, count: 3, avgConfidence: 90, avgTeachability: 80 });
    const templateAction: LearningAction = { kind: "template", sourceImportFileId: templateSource.id, requireCompletedSource: true, learnCandidates: true, input: {
      workspaceId: w.id, fingerprint: "durable-template", fileType: "text/csv", metadata: { institution: "BPI", accountNumber: null, accountName: null, openingBalance: null, endingBalance: null, startDate: null, endDate: null, confidence: 90 },
      parserConfig: { unsupervisedLearning: { clusters: [candidate("Template candidate"), candidate("checkpoint failure"), candidate("Keep rejected decision")] } },
    } };
    const templateJob = await make("template-learning", [templateAction]);
    const waiting = (await processJob(templateJob.id))!;
    assert.equal(waiting.status, "queued"); assert.equal(waiting.errorCode, "SOURCE_NOT_READY"); assert.equal(waiting.nextIndex, 0); assert.equal(waiting.failureCount, 0);
    await db.importFile.update({ where: { id: templateSource.id }, data: { status: "done" } });
    const rejected = await db.merchantRule.create({ data: { workspaceId: w.id, merchantKey: "keep rejected decision", normalizedName: "Keep rejected decision", source: "unsupervised_learning", status: "rejected" } });
    await db.$executeRawUnsafe(`CREATE FUNCTION learning_qa_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."merchantKey" = 'checkpoint failure' THEN RAISE EXCEPTION 'private-source-and-secret-must-not-leak'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER learning_qa_fail BEFORE INSERT OR UPDATE ON "MerchantRule" FOR EACH ROW EXECUTE FUNCTION learning_qa_fail()`);
    // Make this key a candidate so its derivation hits the injected write failure.
    await db.$executeRawUnsafe(`ALTER TABLE "MerchantRule" DISABLE TRIGGER learning_qa_fail`);
    await db.merchantRule.update({ where: { workspaceId_merchantKey: { workspaceId: w.id, merchantKey: "checkpoint failure" } }, data: { status: "candidate" } });
    await db.$executeRawUnsafe(`ALTER TABLE "MerchantRule" ENABLE TRIGGER learning_qa_fail`);
    assert.equal((await retry(templateJob.id, w.id))?.status, "failed");
    assert.equal(await db.statementTemplate.count({ where: { workspaceId: w.id, fingerprint: "durable-template" } }), 0);
    assert.equal(await db.merchantRule.count({ where: { workspaceId: w.id, merchantKey: "template candidate" } }), 0);
    await db.$executeRawUnsafe(`DROP TRIGGER learning_qa_fail ON "MerchantRule"`); await db.$executeRawUnsafe(`DROP FUNCTION learning_qa_fail()`);
    assert.equal((await retry(templateJob.id, w.id))?.status, "completed");
    const savedTemplate = await db.statementTemplate.findUniqueOrThrow({ where: { workspaceId_fingerprint: { workspaceId: w.id, fingerprint: "durable-template" } } });
    const savedCandidate = await db.merchantRule.findUniqueOrThrow({ where: { workspaceId_merchantKey: { workspaceId: w.id, merchantKey: "template candidate" } } });
    assert.equal(savedCandidate.status, "candidate"); assert.equal(savedCandidate.timesConfirmed, 0);
    await processJob((await make("template-learning", [templateAction])).id);
    assert.deepEqual(json(await db.statementTemplate.findUnique({ where: { id: savedTemplate.id } })), json(savedTemplate));
    assert.deepEqual(json(await db.merchantRule.findUnique({ where: { id: savedCandidate.id } })), json(savedCandidate));
    assert.deepEqual(json(await db.merchantRule.findUnique({ where: { id: rejected.id } })), json(rejected));
    const overwrite = await make("automatic-template-refresh", [{ kind: "template", input: { ...templateAction.input, fingerprint: oldTemplate.fingerprint, parserConfig: { source: "local_parser" } } }]);
    await processJob(overwrite.id);
    assert.deepEqual(json(await db.statementTemplate.findUnique({ where: { id: oldTemplate.id } })), json(oldTemplate));

    const receiptSource = await db.importFile.create({ data: { workspaceId: w.id, fileName: "reviewed-receipt.png", fileType: "image/png", storageKey: "synthetic/receipt", status: "done" } });
    const receiptJob = await make("receipt-template-review", [{ ...templateAction, sourceImportFileId: receiptSource.id, requireReviewedTransactions: true, learnCandidates: false, input: { ...templateAction.input, fingerprint: "receipt-reviewed-template" } }]);
    assert.equal((await processJob(receiptJob.id))?.errorCode, "SOURCE_NOT_READY", "A receipt without transactions cannot teach a template");
    const pendingReceipt = await db.transaction.create({ data: { workspaceId: w.id, accountId: account.id, importFileId: receiptSource.id, merchantRaw: "Receipt merchant", merchantClean: "Receipt merchant", date: new Date("2026-01-01"), amount: 10, currency: "PHP", type: "expense", reviewStatus: "pending_review" } });
    assert.equal((await retry(receiptJob.id, w.id))?.errorCode, "SOURCE_NOT_READY", "Pending receipt review must not promote a template");
    assert.equal(await db.statementTemplate.count({ where: { workspaceId: w.id, fingerprint: "receipt-reviewed-template" } }), 0);
    await db.transaction.update({ where: { id: pendingReceipt.id }, data: { reviewStatus: "confirmed" } });
    assert.equal((await retry(receiptJob.id, w.id))?.status, "completed");

    // Exercise the real admin handlers with only the session boundary replaced.
    const require = createRequire(import.meta.url);
    const adminPath = require.resolve("../lib/admin");
    const priorAdmin = require.cache[adminPath];
    let permission = "owner";
    require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: {
      getAdminDataEnvironment: () => "staging",
      requireAdminAuth: async (operation = "read") => {
        if (permission === "anonymous") throw new Error("UNAUTHORIZED");
        if (operation === "operate" && permission === "reader") throw new Error("FORBIDDEN");
        return { userId: user.id, role: permission };
      },
    } } as NodeModule;
    try {
      const route = await import("../app/api/admin/learning-jobs/route");
      const request = (method = "GET", origin = "https://staging.clover.ph") => new Request("https://staging.clover.ph/api/admin/learning-jobs", { method, ...(method === "POST" ? { headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ id: mismatch.id }) } : {}) });
      permission = "anonymous"; assert.equal((await route.GET(request())).status, 401);
      permission = "reader"; assert.equal((await route.POST(request("POST"))).status, 403);
      permission = "owner"; assert.equal((await route.POST(request("POST", "https://untrusted.invalid"))).status, 403);
      const listing = await route.GET(request()); assert.equal(listing.status, 200);
      const body = await listing.json();
      assert(body.jobs.some((job: { id: string; errorCode: string }) => job.id === mismatch.id && job.errorCode === "CATEGORY_UNAVAILABLE"));
      assert(!JSON.stringify(body).includes("merchantText")); assert(!JSON.stringify(body).includes("private-source-and-secret"));
      assert.equal((await route.POST(request("POST"))).status, 200);
      const productionUser = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: "production" } });
      try {
        const productionWorkspace = await db.workspace.create({ data: { userId: productionUser.id, name: "Another environment" } });
        const productionJob = await db.learningJob.create({ data: { workspaceId: productionWorkspace.id, source: "private", dedupeKey: "private", totalItems: 0, payload: [] } });
        const scoped = await (await route.GET(request())).json(); assert(!scoped.jobs.some((job: { id: string }) => job.id === productionJob.id));
        assert.equal((await route.POST(new Request(request("POST"), { body: JSON.stringify({ id: productionJob.id }) }))).status, 404);
      } finally { await db.user.delete({ where: { id: productionUser.id } }); }
    } finally { if (priorAdmin) require.cache[adminPath] = priorAdmin; else delete require.cache[adminPath]; }
    const disabled = await make("consent-withdrawn", [action("Privacy retailer")]);
    await db.user.update({ where: { id: user.id }, data: { appPreferences: { privacy: { improveSuggestions: false } } } });
    await processJob(disabled.id); assert.equal((await db.learningJob.findUniqueOrThrow({ where: { id: disabled.id } })).status, "cancelled");
    assert.equal(await enqueue({ workspaceId: w.id, source: "disabled", actions: [action("Privacy retailer")] }), null);
    assert.deepEqual(json(await db.transaction.findUnique({ where: { id: transaction.id } })), json(transaction));
    assert.deepEqual(json(await db.account.findUnique({ where: { id: account.id } })), json(account));
    assert.deepEqual(json(await db.importFile.findUnique({ where: { id: file.id } })), json(file));
    assert(!learningFailure(new Error("postgres://private:credential@host/source")).errorMessage.includes("private")); assert.equal(networkCalls, 0);
    console.log("PASS durable learning: atomic outbox; rollback/resume; concurrency; expired lease; 205 observations; old-rule retrieval; inactive exclusion; manual authority; Profile isolation; consent; safe errors; unchanged financial evidence.");
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS learning_qa_fail ON "MerchantRule"`); await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS learning_qa_fail()`);
    await db.user.delete({ where: { id: user.id } }); assert.equal(await db.learningJob.count({ where: { workspaceId: w.id } }), 0); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

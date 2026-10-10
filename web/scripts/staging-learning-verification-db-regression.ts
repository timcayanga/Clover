import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55441"); assert.equal(url.pathname, "/clover_migration_qa"); assert(process.argv.includes("--execute"));
globalThis.fetch = async () => { throw new Error("Verification regression prohibits network calls"); };
async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const v = await import("../lib/staging-learning-verification");
  for (const env of [{}, { VERCEL_ENV: "production", CLOVER_DEPLOYMENT_ENVIRONMENT: "staging", VERCEL_GIT_COMMIT_REF: "staging" }, { VERCEL_ENV: "preview", CLOVER_DEPLOYMENT_ENVIRONMENT: "production", VERCEL_GIT_COMMIT_REF: "staging" }, { VERCEL_ENV: "preview", CLOVER_DEPLOYMENT_ENVIRONMENT: "staging", VERCEL_GIT_COMMIT_REF: "main" }]) assert.throws(() => v.assertLearningVerificationEnvironment(env), /VERIFICATION_UNAVAILABLE/);
  Object.assign(process.env, { VERCEL_ENV: "preview", CLOVER_DEPLOYMENT_ENVIRONMENT: "staging", VERCEL_GIT_COMMIT_REF: "staging" });
  const user = await db.user.create({ data: { clerkUserId: v.LEARNING_QA_USER, email: "staging-learning-regression@example.invalid", environment: "staging" } });
  const original = await db.workspace.create({ data: { userId: user.id, name: "Existing knowledge" } });
  const oldRule = await db.merchantRule.create({ data: { workspaceId: original.id, merchantKey: "old rule", normalizedName: "Do not change" } });
  const runId = randomUUID(), actor = "verification-regression";
  try {
    const start = await v.startLearningVerification(runId, actor);
    assert.deepEqual(await v.startLearningVerification(runId, actor), start, "Retry does not reset the baseline or create a Profile");
    await assert.rejects(v.startLearningVerification(runId, "another-admin"), /VERIFICATION_NOT_FOUND/);
    await assert.rejects(v.inspectLearningVerification(randomUUID(), actor), /VERIFICATION_NOT_FOUND/);
    const account = await db.account.create({ data: { workspaceId: start.workspaceId, name: "Test PHP", accountNumber: "0001", balance: 123, type: "bank" } });
    const category = await db.category.create({ data: { workspaceId: start.workspaceId, name: "Food", type: "expense" } });
    await db.transaction.create({ data: { workspaceId: start.workspaceId, accountId: account.id, categoryId: category.id, merchantRaw: "Retained fixture", date: new Date("2026-09-15"), amount: 25, type: "expense", reviewStatus: "edited", rawPayload: { evidence: "retained" } } });
    const prepared = await v.prepareLearningVerificationCheckpoints(runId, actor);
    const report = await v.inspectLearningVerification(runId, actor);
    assert.deepEqual(report.changedOutsideProfile, []); assert.deepEqual(report.changedProtectedFinancial, []);
    const failed = report.jobs.find(j => j.id === prepared.failureJobId)!;
    assert.equal(failed.errorCode, "CATEGORY_UNAVAILABLE"); assert.equal(failed.nextIndex, 1); assert.equal(failed.status, "failed");
    const interrupted = report.jobs.find(j => j.id === prepared.interruptionJobId)!;
    assert.equal(interrupted.nextIndex, 1); assert.equal(interrupted.status, "running"); assert(interrupted.lockedUntil! < new Date());
    assert.deepEqual(await v.prepareLearningVerificationCheckpoints(runId, actor), prepared);
    const { retryLearningJob } = await import("../lib/learning-jobs");
    await v.repairLearningVerificationReference(runId, actor);
    await retryLearningJob(failed.id, start.workspaceId); await retryLearningJob(interrupted.id, start.workspaceId);
    const finished = await v.inspectLearningVerification(runId, actor);
    assert(finished.jobs.every(j => j.status === "completed" && j.nextIndex === 3));
    assert(finished.jobs.some(j => j.runs.some(r => r.errorCode === "LEASE_EXPIRED")));
    const knowledge = JSON.stringify([finished.rules, finished.signals]);
    await Promise.all([retryLearningJob(failed.id, start.workspaceId), retryLearningJob(interrupted.id, start.workspaceId)]);
    const again = await v.inspectLearningVerification(runId, actor);
    assert.equal(JSON.stringify([again.rules, again.signals]), knowledge);
    assert.deepEqual(again.changedOutsideProfile, []); assert.deepEqual(again.changedProtectedFinancial, []);
    await db.merchantRule.update({ where: { id: oldRule.id }, data: { normalizedName: "Concurrent change" } });
    assert.deepEqual((await v.inspectLearningVerification(runId, actor)).changedOutsideProfile, ["MerchantRule"], "The baseline detects changes and never silently accepts a new baseline");
    const require = createRequire(import.meta.url), adminPath = require.resolve("../lib/admin"), prior = require.cache[adminPath];
    let permission = "owner";
    require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true, exports: { requireAdminAuth: async () => { if (permission === "anonymous") throw new Error("UNAUTHORIZED"); if (permission === "reader") throw new Error("FORBIDDEN"); return { userId: actor }; } } } as NodeModule;
    try {
      const route = await import("../app/api/admin/learning-verification/route");
      const request = (body: unknown = { runId, action: "inspect" }, origin = "https://staging.clover.ph") => new Request("https://staging.clover.ph/api/admin/learning-verification", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
      permission = "anonymous"; assert.equal((await route.POST(request())).status, 401);
      permission = "reader"; assert.equal((await route.POST(request())).status, 403);
      permission = "owner"; assert.equal((await route.POST(request(undefined, "https://untrusted.invalid"))).status, 403);
      assert.equal((await route.POST(request({ runId, action: "inspect", workspaceId: original.id }))).status, 400);
      assert.equal((await route.POST(request())).status, 200);
      process.env.VERCEL_ENV = "production"; assert.equal((await route.POST(request())).status, 404);
    } finally { if (prior) require.cache[adminPath] = prior; else delete require.cache[adminPath]; }
    console.log("PASS staging verification: production denied; authenticated operator and origin required; fixed QA ownership; retryable start; checkpoint failures and expired leases; no duplicate learning; financial and historical row hashes preserved; changes detected.");
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

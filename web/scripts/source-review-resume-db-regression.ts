import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { SourceReviewRequiredError, SOURCE_REVIEW_PHASE } from "../lib/import-source-review";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
const require = createRequire(import.meta.url);
let network = 0;
globalThis.fetch = async () => { network++; throw new Error("Resume regression prohibits providers"); };

async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: randomUUID()+"@example.invalid", environment: "staging" } });
  const paths = ["../lib/auth", "../lib/workspace-access", "../workers/import-processor"].map(path => require.resolve(path));
  const prior = paths.map(path => require.cache[path]);
  let parserCalls = 0;
  const sourceError = new SourceReviewRequiredError("Native source requires review: GCash payment template mixes currencies and an unverified cash-in instruction; no reliable payment established");
  require.cache[paths[0]] = { id: paths[0], filename: paths[0], loaded: true, exports: {
    isLocalDevHost: async () => false, requireAuth: async () => ({ userId: user.clerkUserId }),
  } } as NodeModule;
  require.cache[paths[1]] = { id: paths[1], filename: paths[1], loaded: true, exports: {
    assertWorkspaceAccess: async (_actor: string, id: string) => { assert(await db.workspace.findFirst({ where: { id, userId: user.id } })); },
  } } as NodeModule;
  require.cache[paths[2]] = { id: paths[2], filename: paths[2], loaded: true, exports: {
    processImportFileText: async () => { parserCalls++; await Promise.resolve(); throw sourceError; },
    confirmImportFile: async () => ({ imported: 0, status: "staged" }),
  } } as NodeModule;
  try {
    const { POST } = await import("../app/api/imports/[importId]/resume/route");
    for (const checkpointed of [false, true]) {
      const workspace = await db.workspace.create({ data: { userId: user.id, name: "Async source review "+checkpointed } });
      const file = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: "invented-source.pdf", fileType: "application/pdf", storageKey: "qa/"+randomUUID(), status: "failed", processingPhase: "repair_needed" } });
      if (checkpointed) await db.accountStatementCheckpoint.create({ data: { workspaceId: workspace.id, importFileId: file.id, status: "reconciled", rowCount: 0 } });
      const response = await POST(new Request("https://staging.clover.ph/api/imports/"+file.id+"/resume", { method: "POST" }), { params: Promise.resolve({ importId: file.id }) });
      assert.equal(response.status, 422, "A rejection after await must reach the resume error handler");
      const payload = await response.json(); assert.equal(payload.code, "I-109"); assert.equal(payload.retryable, false);
      assert.equal(payload.diagnosticReason, sourceError.message); assert.match(payload.error, /conflicting currencies/);
      const before = await db.importFile.findUniqueOrThrow({ where: { id: file.id } });
      assert.equal(before.status, "failed"); assert.equal(before.processingPhase, SOURCE_REVIEW_PHASE);
      const calls = parserCalls;
      const repeat = await POST(new Request("https://staging.clover.ph/api/imports/"+file.id+"/resume", { method: "POST" }), { params: Promise.resolve({ importId: file.id }) });
      assert.equal(repeat.status, 422); assert.equal(parserCalls, calls, "Held retry must not invoke the parser again");
      assert.deepEqual(await db.importFile.findUniqueOrThrow({ where: { id: file.id } }), before);
      assert.equal(await db.transaction.count({ where: { workspaceId: workspace.id } }), 0);
      assert.equal(await db.parsedTransaction.count({ where: { workspaceId: workspace.id } }), 0);
      assert.equal(await db.learningJob.count({ where: { workspaceId: workspace.id } }), 0);
    }
    assert.equal(parserCalls, 2, "Both inline resume paths are exercised");
  } finally {
    paths.forEach((path, i) => { if (prior[i]) require.cache[path] = prior[i]; else delete require.cache[path]; });
    await db.user.delete({ where: { id: user.id } }); await db.$disconnect();
  }
  assert.equal(network, 0);
  console.log("Resume API: delayed native refusal in both inline paths, real stored review reasons, no finance/learning and repeated retry no-op passed.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });

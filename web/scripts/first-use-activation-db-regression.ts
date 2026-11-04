import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
globalThis.fetch = async () => { throw new Error("External services disabled in activation QA"); };
const require = createRequire(import.meta.url);
async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid`, environment: "staging", planTier: "free" } });
  const events: { name: string; props: Record<string, unknown> }[] = [];
  const saved = new Map<string, NodeModule | undefined>();
  const stub = (id: string, exports: unknown) => { const path = require.resolve(id); saved.set(path, require.cache[path]); require.cache[path] = { id: path, filename: path, loaded: true, exports } as NodeModule; };
  let signedIn = true;
  stub("../lib/auth", { requireAuth: async () => { if (!signedIn) throw Error("UNAUTHORIZED"); return { userId: user.clerkUserId }; } });
  stub("../lib/user-context", { getOrCreateCurrentUser: async () => user });
  stub("../lib/analytics-server", { capturePostHogServerEvent: async (name: string, _id: string, props: Record<string, unknown>) => { events.push({ name, props }); } });
  stub("next/headers", { cookies: async () => ({ get: () => undefined }) });
  try {
    const { getFirstUseActivation, recordActivationResult } = await import("../lib/first-use-activation");
    const { GET, POST } = await import("../app/api/activation/route");
    const workspace = await db.workspace.create({ data: { userId: user.id, name: "Activation QA" } });
    const other = await db.workspace.create({ data: { userId: user.id, name: "Other Profile" } });
    const account = await db.account.create({ data: { workspaceId: workspace.id, name: "Cash", type: "cash", balance: 0 } });
    const get = (id = workspace.id) => GET(new Request(`https://clover.ph/api/activation?workspaceId=${id}`));
    const send = (transactionId: string, action = "view", origin = "https://clover.ph") => POST(new Request(`https://clover.ph/api/activation?workspaceId=${workspace.id}`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ action, transactionId }) }));
    assert.equal((await getFirstUseActivation(workspace.id, user.id)).state, "start", "Seeded Cash is not activation");
    const base = { workspaceId: workspace.id, accountId: account.id, date: new Date("2026-09-09"), currency: "IDR", type: "expense" as const, merchantRaw: "Synthetic lunch" };
    await db.transaction.createMany({ data: [
      { ...base, amount: 0, reviewStatus: "confirmed" },
      { ...base, amount: 500, reviewStatus: "rejected" },
      { ...base, amount: 500, reviewStatus: "duplicate_skipped" },
      { ...base, amount: 500, isExcluded: true },
      { ...base, amount: 500, deletedAt: new Date() },
    ] });
    await db.importFile.create({ data: { workspaceId: workspace.id, fileName: "failed-receipt.png", fileType: "image/png", status: "failed", storageKey: "fixture-only" } });
    assert.equal((await getFirstUseActivation(workspace.id, user.id)).state, "start", "A failed upload, zero draft, rejected, excluded or deleted row cannot count");
    const imported = await db.importFile.create({ data: { workspaceId: workspace.id, fileName: "receipt.png", fileType: "image/png", status: "done", storageKey: "fixture-only" } });
    const first = await db.transaction.create({ data: { ...base, amount: 69000, importFileId: imported.id, reviewStatus: "pending_review" } });
    const original = JSON.stringify(await db.transaction.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: "asc" } }));
    const snapshot = await getFirstUseActivation(workspace.id, user.id);
    assert.equal(snapshot.state, "result"); assert.equal(snapshot.transaction?.id, first.id);
    assert.equal(snapshot.transaction?.currency, "IDR"); assert.equal(snapshot.transaction?.amount, "69000");
    assert.equal(snapshot.transaction?.date.slice(0, 10), "2026-09-09", "Use receipt date, not ingestion date");
    assert.equal(snapshot.transaction?.needsReview, true, "Suggested results cannot claim confirmation");
    assert.equal((await getFirstUseActivation(other.id, user.id)).state, "start", "Active Profiles stay separate");
    assert.equal((await get("another-users-profile")).status, 401);
    assert.equal((await send(first.id, "view", "https://attacker.invalid")).status, 400);
    assert.equal((await send("wrong-transaction")).status, 409);
    await Promise.all([send(first.id), send(first.id), send(first.id)]);
    assert.equal(await db.auditLog.count({ where: { workspaceId: workspace.id, action: "activation.result_viewed" } }), 1);
    assert.equal(events.filter(event => event.name === "activation_first_result_rendered").length, 1);
    assert.equal(events[0].props.entry_method, "import"); assert.equal(events[0].props.first_transaction_within_24h, true);
    assert.equal((await send(first.id, "acknowledge")).status, 200);
    assert.equal((await getFirstUseActivation(workspace.id, user.id)).state, "hidden");
    assert.equal(JSON.stringify(await db.transaction.findMany({ where: { workspaceId: workspace.id }, orderBy: { id: "asc" } })), original, "Viewing and acknowledging never mutate financial records");
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).planTier, "free");
    signedIn = false; assert.equal((await get()).status, 401);
    console.log("PASS first-use activation: persisted value, pending review, date/currency, Profile isolation, authorization, origin, concurrent measurement and unchanged financial records/Free plan");
  } finally {
    for (const [path, value] of saved) { if (value) require.cache[path] = value; else delete require.cache[path]; }
    await db.user.delete({ where: { id: user.id } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

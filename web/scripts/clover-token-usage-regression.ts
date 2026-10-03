import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import {
  calculateModelCloverTokens,
  calculateUsageParts,
  creditFailedImportUsage,
  getCloverTokenUsage,
  hasImportCloudAllowance,
  IMPORT_AI_USAGE_CREDIT_ACTION,
  mayUseImportCloudAi,
  CLOVER_TOKEN_LIMITS,
  getManilaMonthWindow,
} from "@/lib/clover-token-usage";

assert.deepEqual(CLOVER_TOKEN_LIMITS.free, { monthly: 100_000, rolling24h: 30_000 });
assert.deepEqual(CLOVER_TOKEN_LIMITS.pro, { monthly: 1_000_000, rolling24h: 250_000 });

const month = getManilaMonthWindow(new Date("2026-09-30T16:30:00.000Z"));
assert.equal(month.startsAt.toISOString(), "2026-09-30T16:00:00.000Z");
assert.equal(month.resetsAt.toISOString(), "2026-10-31T16:00:00.000Z");

assert.equal(calculateModelCloverTokens({
  model: "gpt-4.1-mini",
  inputTokens: 1_000,
  cachedInputTokens: 0,
  outputTokens: 100,
  totalTokens: 1_100,
}), 747);

const startsAt = new Date("2026-09-01T00:00:00.000Z");
const parts = calculateUsageParts([
  {
    action: "import.parser_usage",
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    metadata: { localParser: { estimatedTokens: 900 } },
  },
  {
    action: "import.openai_model_call",
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    metadata: { model: "unknown", inputTokens: 100, outputTokens: 20, totalTokens: 120 },
  },
  {
    action: "adviser.model_call",
    createdAt: new Date("2026-09-02T00:00:00.000Z"),
    metadata: { model: "unknown", inputTokens: 200, outputTokens: 30, totalTokens: 230 },
  },
], startsAt);

assert.deepEqual(parts, { localParserTokens: 0, backupParserTokens: 120, adviserTokens: 230 });
const dayStart = new Date("2026-10-03T00:00:00.000Z");
assert.deepEqual(calculateUsageParts([
  { id: "old-call", action: "import.openai_model_call", createdAt: new Date("2026-10-01T12:00:00Z"), metadata: { totalTokens: 500 } },
  { id: "new-call", action: "import.openai_model_call", createdAt: new Date("2026-10-03T12:00:00Z"), metadata: { totalTokens: 800 } },
  { action: IMPORT_AI_USAGE_CREDIT_ACTION, createdAt: new Date("2026-10-03T13:00:00Z"), metadata: { sourceAuditLogId: "old-call", cloverTokens: 500 } },
  { action: IMPORT_AI_USAGE_CREDIT_ACTION, createdAt: new Date("2026-10-03T13:01:00Z"), metadata: { sourceAuditLogId: "old-call", cloverTokens: 500 } },
], dayStart), { localParserTokens: 0, backupParserTokens: 800, adviserTokens: 0 }, "old/duplicate refunds cannot subsidize a later request");

async function testFailureCreditsAndCloudBoundary() {
  const previousNodeEnv = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  const now = new Date("2026-10-04T02:00:00Z");
  const user = { id: "receipt-qa-user", clerkUserId: "receipt-qa-clerk", planTier: "free" as const };
  type Log = { id: string; workspaceId: string; actorUserId: string; entity: string; entityId: string | null; action: string; metadata: unknown; createdAt: Date };
  const logs: Log[] = [{
    id: "failed-photo-call", workspaceId: "receipt-qa-workspace", actorUserId: user.id,
    entity: "ImportFile", entityId: "failed-photo", action: "import.openai_model_call",
    createdAt: new Date("2026-10-03T22:38:30Z"),
    metadata: { model: "gpt-5.5", inputTokens: 9424, outputTokens: 1205, totalTokens: 10629 },
  }];
  const imports = [
    { id: "failed-photo", workspaceId: "receipt-qa-workspace", status: "failed", parsedRowsCount: 0, confirmedTransactionsCount: 0, actualTransactions: 0 },
    { id: "delivered-photo", workspaceId: "receipt-qa-workspace", status: "failed", parsedRowsCount: 1, confirmedTransactionsCount: 0, actualTransactions: 1 },
    { id: "processing-photo", workspaceId: "receipt-qa-workspace", status: "processing", parsedRowsCount: 0, confirmedTransactionsCount: 0, actualTransactions: 0 },
  ];
  const matchesImport = (where: Record<string, any>) => imports.filter(file =>
    (!where.id || (typeof where.id === "string" ? file.id === where.id : where.id.in.includes(file.id))) &&
    file.status === where.status && file.actualTransactions === 0 && file.confirmedTransactionsCount === where.confirmedTransactionsCount);
  const db = {
    auditLog: {
      findMany: async ({ where }: { where: Record<string, any> }) => logs.filter(log =>
        (typeof where.action === "string" ? log.action === where.action : where.action.in.includes(log.action)) &&
        (!where.createdAt || log.createdAt >= where.createdAt.gte) && (!where.entityId || log.entityId === where.entityId)),
      createMany: async ({ data, skipDuplicates }: { data: Omit<Log, "createdAt">[]; skipDuplicates: boolean }) => {
        assert.equal(skipDuplicates, true);
        for (const log of data) if (!logs.some(existing => existing.id === log.id)) logs.push({ ...log, createdAt: now });
      },
    },
    importFile: {
      findMany: async ({ where }: { where: Record<string, any> }) => matchesImport(where),
      findFirst: async ({ where }: { where: Record<string, any> }) => matchesImport(where)[0] ?? null,
    },
    user: { findUnique: async () => user },
    mobileLocalAllowance: { findMany: async () => { throw new Error("Device reservations must not be read or charged as cloud usage"); } },
  } as unknown as Prisma.TransactionClient;
  try {
    assert.equal(calculateModelCloverTokens(logs[0]!.metadata), 111027);
    const refunded = await getCloverTokenUsage(user, now, db);
    assert.equal(refunded.totalTokens, 0, "historical failed receipt is credited automatically");
    assert.equal(refunded.monthly.remaining, 100000);
    assert.equal(refunded.rolling24h.remaining, 30000);
    assert.ok(hasImportCloudAllowance(refunded));
    assert.ok(!hasImportCloudAllowance(refunded, 30000), "pending calls cannot start another provider request after spending the remaining daily budget");
    await creditFailedImportUsage("failed-photo", db);
    await creditFailedImportUsage("failed-photo", db);
    await getCloverTokenUsage(user, now, db);
    assert.equal(logs.filter(log => log.action === IMPORT_AI_USAGE_CREDIT_ACTION).length, 1, "credit is idempotent");
    assert.equal(logs.find(log => log.id === "failed-photo-call")?.metadata, logs[0]!.metadata, "provider usage remains intact");

    imports[0]!.status = "processed";
    logs.push({ ...logs[0]!, id: "successful-retry", metadata: { totalTokens: 2500, allowanceChargeable: true }, createdAt: now });
    assert.equal((await getCloverTokenUsage(user, now, db)).totalTokens, 2500, "successful retry does not reverse the failed-attempt credit");
    logs.push({ ...logs[0]!, id: "delivered-extraction", entityId: "delivered-photo", metadata: { totalTokens: 1200 }, createdAt: now });
    logs.push({ ...logs[0]!, id: "pending-extraction", entityId: "processing-photo", metadata: { totalTokens: 800 }, createdAt: now });
    assert.equal((await getCloverTokenUsage(user, now, db)).totalTokens, 4500, "delivered extraction and still-processing imports are not refunded");
    imports.push({ id: "partial-failed-photo", workspaceId: "receipt-qa-workspace", status: "failed", parsedRowsCount: 3, confirmedTransactionsCount: 0, actualTransactions: 0 });
    logs.push({ ...logs[0]!, id: "partial-failed-extraction", entityId: "partial-failed-photo", metadata: { totalTokens: 900 }, createdAt: now });
    assert.equal((await getCloverTokenUsage(user, now, db)).totalTokens, 4500, "unconfirmed intermediate parsed rows do not prevent a failed-extraction credit");
    logs.push({ ...logs[0]!, id: "invalid-model-output", entityId: "delivered-photo", metadata: { totalTokens: 700, allowanceChargeable: false }, createdAt: now });
    assert.equal((await getCloverTokenUsage(user, now, db)).totalTokens, 4500, "invalid AI output is credited even if a deterministic parser rescued the import");

    logs.push({ ...logs[0]!, id: "adviser-budget", entityId: null, action: "adviser.model_call", metadata: { totalTokens: 100000 }, createdAt: now });
    const exhausted = await getCloverTokenUsage(user, now, db);
    assert.ok(!hasImportCloudAllowance(exhausted));
    assert.equal(await mayUseImportCloudAi(user.id, 0, db, now), false, "cloud boundary blocks an exhausted monthly allowance");
    assert.equal(await mayUseImportCloudAi(null, 0, db, now), false, "missing owner cannot send an unmetered request");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
  }
}

void testFailureCreditsAndCloudBoundary().then(() => {
  console.log("[PASS] Cloud-only metering, historical/idempotent failure credits, window-safe refunds, and exhausted cloud gate.");
}).catch(error => { console.error(error); process.exitCode = 1; });

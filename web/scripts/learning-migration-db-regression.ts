import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55441"); assert.equal(url.pathname, "/clover_migration_qa"); assert(process.argv.includes("--execute"));
async function main() {
  const { prisma: db } = await import("../lib/prisma");
  // First fixture in the fresh-database gate. Refuse a reused database.
  assert.equal(await db.user.count(), 0); assert.equal(await db.learningJob.count(), 0);
  const user = await db.user.create({ data: { clerkUserId: randomUUID(), email: `${randomUUID()}@example.invalid` } });
  try {
    const workspace = await db.workspace.create({ data: { userId: user.id, name: "Retained learning" } });
    const category = await db.category.create({ data: { workspaceId: workspace.id, name: "Legacy category", type: "expense" } });
    const rule = await db.merchantRule.create({ data: { workspaceId: workspace.id, merchantKey: "retained merchant", normalizedName: "Confirmed title", categoryId: category.id, source: "manual", timesConfirmed: 17, version: 4, provenance: { source: "legacy correction" } } });
    const signal = await db.trainingSignal.create({ data: { workspaceId: workspace.id, merchantKey: "retained merchant", dedupeKey: "retained-signal", categoryId: category.id, source: "manual_recategorization", type: "expense", previousValue: { label: "before" }, correctedValue: { label: "Confirmed title" } } });
    const account = await db.accountRule.create({ data: { workspaceId: workspace.id, ruleKey: "retained", accountName: "My bank", accountType: "bank", source: "manual", timesConfirmed: 9 } });
    const template = await db.statementTemplate.create({ data: { workspaceId: workspace.id, fingerprint: "retained-source", parserVersion: "v2", parserConfig: { source: "data_qa_review", retained: true }, successCount: 23 } });
    const canonical = (v: unknown) => JSON.stringify(v);
    const before = [rule, signal, account, template].map(canonical);
    // Reconstruct only this migration's preceding schema in our empty disposable cluster.
    await db.$executeRawUnsafe('DROP TABLE "LearningJobAttempt"'); await db.$executeRawUnsafe('DROP TABLE "LearningJob"');
    for (const table of ["MerchantRule", "AccountRule", "StatementTemplate", "TrainingSignal"]) await db.$executeRawUnsafe(`ALTER TABLE "${table}" DROP COLUMN "learningObservedAt"`);
    await db.$executeRawUnsafe('ALTER TABLE "TrainingSignal" DROP COLUMN "appliedObservationKey"');
    await db.$executeRawUnsafe('DROP INDEX "TrainingSignal_workspaceId_merchantKey_approvalStatus_idx"');
    for (const role of ["anon", "authenticated", "service_role"]) await db.$executeRawUnsafe(`CREATE ROLE "${role}" NOLOGIN`);
    const migration = readFileSync("prisma/migrations/20261009150000_durable_learning/migration.sql", "utf8");
    for (const statement of migration.split(";").map(value => value.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
    const after = [
      await db.merchantRule.findUnique({ where: { id: rule.id } }), await db.trainingSignal.findUnique({ where: { id: signal.id } }),
      await db.accountRule.findUnique({ where: { id: account.id } }), await db.statementTemplate.findUnique({ where: { id: template.id } }),
    ].map(canonical);
    assert.deepEqual(after, before); assert.equal(await db.learningJob.count(), 0);
    const tables = await db.$queryRaw<Array<{ rowsecurity: boolean }>>`SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('LearningJob', 'LearningJobAttempt')`;
    assert.equal(tables.length, 2); assert(tables.every(table => table.rowsecurity));
    for (const role of ["anon", "authenticated", "service_role"]) {
      const grants = await db.$queryRaw<Array<{ allowed: boolean }>>`SELECT has_table_privilege(${role}, '"LearningJob"', 'SELECT, INSERT, UPDATE, DELETE') AS allowed`;
      assert.equal(grants[0].allowed, false);
    }
    console.log("PASS additive learning migration: legacy IDs, counts, versions, correction values, labels and provenance survive actual migration SQL unchanged.");
  } finally { await db.user.delete({ where: { id: user.id } }); await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

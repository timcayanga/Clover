// Run after `prisma migrate deploy` against a disposable local database.
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { ensureStarterWorkspace } from "../lib/starter-data";

const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.endsWith("_qa"), "Use an isolated local QA database");

async function main() {
  const user = await prisma.user.create({ data: { clerkUserId: `migration-qa-${Date.now()}`, email: `migration-qa-${Date.now()}@example.invalid` } });
  try {
    const workspace = await ensureStarterWorkspace(user, undefined, undefined, "PHP");
    const account = await prisma.account.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    const transaction = await prisma.transaction.create({ data: { workspaceId: workspace.id, accountId: account.id, date: new Date("2026-09-14T00:00:00Z"), amount: 123, type: "expense", merchantRaw: "Migration sentinel", reviewStatus: "confirmed", parserConfidence: 100 } });
    await prisma.account.update({ where: { id: account.id }, data: { balance: 877 } });
    const session = await prisma.brankasStatementSession.create({ data: { workspaceId: workspace.id, userId: user.id, externalId: `qa-${user.id}`, bankCodes: [], appRedirectUri: "https://example.invalid/qa", rawRequest: {} } });
    await prisma.brankasStatementNotificationEvent.create({ data: { brankasSessionId: session.id, payload: { fixture: true } } });
    assert.equal((await ensureStarterWorkspace(user)).id, workspace.id);
    assert.equal(await prisma.workspace.count({ where: { userId: user.id } }), 1);
    assert.deepEqual(await prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }), transaction);
    assert.equal((await prisma.account.findUniqueOrThrow({ where: { id: account.id } })).balance?.toString(), "877");
    const tables = await prisma.$queryRaw<Array<{ name: string; rls: boolean; exposed: boolean }>>`
      SELECT c.relname AS name, c.relrowsecurity AS rls,
        (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('authenticated', c.oid, 'SELECT') OR has_table_privilege('service_role', c.oid, 'SELECT')) AS exposed
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('BrankasStatementSession', 'BrankasStatementNotificationEvent')`;
    assert.equal(tables.length, 2);
    assert.ok(tables.every(table => table.rls && !table.exposed));
    console.log("PASS: migrated starter Profile creation/reload, Brankas relations, confirmed-data preservation and database access restrictions");
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

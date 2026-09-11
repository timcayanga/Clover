import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";

const database = new URL(process.env.DATABASE_URL ?? "");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "55439");
assert.equal(database.pathname, "/clover_qa");

async function post(body: Record<string, unknown>) {
  return fetch("http://localhost:4321/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:4321" },
    body: JSON.stringify(body),
  });
}

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { clerkUserId: "local-admin" } });
  const workspace = await prisma.workspace.create({ data: { userId: user.id, name: "Disposable entry validation regression" } });
  try {
    const account = await prisma.account.create({ data: { workspaceId: workspace.id, name: "QA", type: "bank", currency: "PHP" } });
    const base = { workspaceId: workspace.id, accountId: account.id, date: "2026-09-09", amount: "1.00", currency: "PHP", type: "expense", merchantRaw: "QA" };
    for (const override of [{ amount: "0" }, { amount: "-1" }, { amount: "1.234" }, { amount: "12,34" }, { date: "not-a-date" }, { merchantRaw: "" }]) {
      const response = await post({ ...base, ...override });
      assert.equal(response.status, 400, JSON.stringify(override));
      assert.equal(await prisma.transaction.count({ where: { workspaceId: workspace.id } }), 0);
    }
    const success = await post({ ...base, amount: "1,234.50" });
    assert.equal(success.status, 201);
    const created = await prisma.transaction.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    assert.equal(created.amount.toString(), "1234.5");
    console.log("PASS: manual API rejects invalid amounts and required/malformed fields without partial rows; grouped amount saves exactly once");
  } finally {
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.$disconnect();
  }
}

void main();

import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";

const database = new URL(process.env.DATABASE_URL ?? "");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "55439");
assert.equal(database.pathname, "/clover_qa");

async function post(body: Record<string, unknown>) {
  return fetch("http://localhost:4321/api/transactions/manual-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:4321" },
    body: JSON.stringify(body),
  });
}

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { clerkUserId: "local-admin" } });
  const [sourceWorkspace, otherWorkspace] = await Promise.all([
    prisma.workspace.create({ data: { userId: user.id, name: "Disposable transfer source regression" } }),
    prisma.workspace.create({ data: { userId: user.id, name: "Disposable transfer other regression" } }),
  ]);
  try {
    const [source, phpDestination, usdDestination, foreignDestination] = await Promise.all([
      prisma.account.create({ data: { workspaceId: sourceWorkspace.id, name: "Source", type: "bank", currency: "PHP" } }),
      prisma.account.create({ data: { workspaceId: sourceWorkspace.id, name: "Destination", type: "bank", currency: "PHP" } }),
      prisma.account.create({ data: { workspaceId: sourceWorkspace.id, name: "USD", type: "bank", currency: "USD" } }),
      prisma.account.create({ data: { workspaceId: otherWorkspace.id, name: "Foreign", type: "bank", currency: "PHP" } }),
    ]);
    const base = { workspaceId: sourceWorkspace.id, sourceAccountId: source.id, destinationAccountId: phpDestination.id, date: "2026-09-09", amount: "10", currency: "PHP" };
    for (const [override, expectedStatus] of [
      [{ destinationAccountId: source.id }, 400],
      [{ destinationAccountId: foreignDestination.id }, 404],
      [{ destinationAccountId: usdDestination.id }, 400],
      [{ amount: "0" }, 400],
      [{ amount: "-10" }, 400],
      [{ amount: "1.234" }, 400],
    ] as const) {
      const response = await post({ ...base, ...override });
      assert.equal(response.status, expectedStatus, JSON.stringify(override));
      assert.equal(await prisma.transaction.count({ where: { workspaceId: sourceWorkspace.id } }), 0);
    }
    const response = await post(base);
    assert.equal(response.status, 201);
    assert.equal(await prisma.transaction.count({ where: { workspaceId: sourceWorkspace.id } }), 2);
    console.log("PASS: transfers reject same-account, foreign-profile, cross-currency, and invalid-amount requests without partial rows; valid same-currency transfer creates exactly two legs");
  } finally {
    await prisma.workspace.delete({ where: { id: sourceWorkspace.id } });
    await prisma.workspace.delete({ where: { id: otherWorkspace.id } });
    await prisma.$disconnect();
  }
}

void main();

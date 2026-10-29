import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { withMobileRequestContext } from "../lib/mobile-request-context";
import { POST as resource } from "../app/api/circles/[circleId]/resources/route";
import { GET as related } from "../app/api/transactions/[transactionId]/related/route";
import { loadCirclesWorkspaceData } from "../lib/circle-loaders";
const db = new URL(process.env.DATABASE_URL ?? "");
assert.equal(db.hostname, "127.0.0.1");
assert.equal(db.port, "56567");
assert.equal(db.pathname, "/clover_circle_experience_qa");
globalThis.fetch = async () => {
  throw new Error("External requests forbidden in isolated Circle QA");
};
async function main() {
  const user = await prisma.user.create({
    data: {
      id: "owner",
      clerkUserId: "local-admin",
      email: "owner@example.invalid",
      environment: "local",
      planTier: "pro",
      signupTrialEvaluatedAt: new Date(),
    },
  });
  await prisma.user.create({
    data: {
      id: "stranger",
      clerkUserId: "qa-stranger",
      email: "stranger@example.invalid",
      environment: "local",
      signupTrialEvaluatedAt: new Date(),
    },
  });
  await prisma.workspace.createMany({
    data: [
      { id: "personal", name: "Personal", userId: user.id },
      { id: "other", name: "Other Profile", userId: "stranger" },
    ],
  });
  await prisma.circle.create({
    data: {
      id: "circle",
      ownerUserId: user.id,
      name: "Trip",
      currency: "PHP",
      memberships: {
        create: [
          { id: "me", userId: user.id, displayName: "Me", role: "organizer" },
          { id: "mia", displayName: "Mia", role: "member" },
        ],
      },
    },
  });
  await prisma.circle.create({
    data: {
      id: "foreign-circle",
      ownerUserId: "stranger",
      name: "Private",
      memberships: {
        create: { id: "foreign-person", displayName: "Private Member" },
      },
    },
  });
  await prisma.account.create({
    data: {
      id: "cash",
      workspaceId: "personal",
      name: "Cash",
      type: "cash",
      currency: "PHP",
    },
  });
  await prisma.category.create({
    data: {
      id: "food",
      workspaceId: "personal",
      name: "Food & Dining",
      type: "expense",
    },
  });
  const transaction = await prisma.transaction.create({
    data: {
      id: "meal",
      workspaceId: "personal",
      accountId: "cash",
      merchantRaw: "Lunch",
      categoryId: "food",
      amount: 1200,
      currency: "PHP",
      date: new Date(),
      type: "expense",
      reviewStatus: "confirmed",
      normalizedPayload: {
        receiptLineItems: [
          { description: "Pasta", amount: "450" },
          { description: "Chicken", amount: "450" },
          { description: "Coffee", amount: "300" },
        ],
      },
      rawPayload: { originalReceipt: "retained" },
    },
  });
  await prisma.transaction.create({
    data: {
      id: "idr",
      workspaceId: "personal",
      accountId: "cash",
      merchantRaw: "Indonesian Receipt",
      amount: 75440,
      currency: "IDR",
      date: new Date(),
      type: "expense",
      reviewStatus: "confirmed",
    },
  });
  const call = async (
    body: unknown,
    who = "local-admin",
    circleId = "circle",
  ) => {
    const req = new Request(
      "https://clover.test/api/circles/" + circleId + "/resources",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://clover.test",
        },
        body: JSON.stringify(body),
      },
    );
    const response = await withMobileRequestContext(who, req, () =>
      resource(req, { params: Promise.resolve({ circleId }) }),
    );
    return { status: response.status, body: await response.json() };
  };
  const photo =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX0sAAAAASUVORK5CYII=";
  assert.equal(
    (await call({ action: "update_member", id: "mia", avatarUrl: photo }))
      .status,
    200,
  );
  assert.equal(
    (await prisma.circleMembership.findUniqueOrThrow({ where: { id: "mia" } }))
      .avatarUrl,
    photo,
  );
  assert.equal(
    (
      await call({
        action: "update_member",
        id: "mia",
        avatarUrl: "data:image/svg+xml;base64,PHN2Zz4=",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call({
        action: "update_member",
        id: "foreign-person",
        avatarUrl: photo,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        { action: "update_member", id: "mia", avatarUrl: null },
        "qa-stranger",
      )
    ).status,
    404,
  );
  assert.equal(
    (await prisma.circleMembership.findUniqueOrThrow({ where: { id: "mia" } }))
      .avatarUrl,
    photo,
  );
  assert.equal(
    (await call({ action: "update_member", id: "mia", displayName: "Mia" }))
      .status,
    200,
  );
  assert.equal(
    (await prisma.circleMembership.findUniqueOrThrow({ where: { id: "mia" } }))
      .avatarUrl,
    photo,
    "Name-only edits retain Circle photo override",
  );
  assert.equal(
    (
      await call({
        action: "create_budget",
        name: "Trip",
        targetAmount: 50000,
        currency: "PHP",
        cadence: "once",
        startsAt: "2026-01-01T00:00:00Z",
        endsAt: "2027-01-01T00:00:00Z",
      })
    ).status,
    200,
  );
  assert.equal((await prisma.circleBudget.findFirstOrThrow()).oneTime, true);
  assert.equal(
    (
      await call({
        action: "create_budget",
        name: "Bad",
        targetAmount: 1,
        cadence: "once",
        startsAt: "2027-01-01T00:00:00Z",
        endsAt: "2026-01-01T00:00:00Z",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call({
        action: "create_commitment",
        title: "Insurance",
        amount: 100,
        currency: "USD",
        recurrence: "monthly",
        assignedMemberIds: ["me", "mia"],
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (await prisma.circleCommitment.findFirstOrThrow()).assignedMemberIds,
    ["me", "mia"],
  );
  const recurring = await prisma.circleCommitment.findFirstOrThrow();
  assert.equal(
    (
      await call({
        action: "update_commitment",
        id: recurring.id,
        assignedMemberId: "mia",
      })
    ).status,
    200,
  );
  assert.deepEqual(
    (
      await prisma.circleCommitment.findUniqueOrThrow({
        where: { id: recurring.id },
      })
    ).assignedMemberIds,
    ["mia"],
  );
  assert.equal(
    (
      await call({
        action: "create_commitment",
        title: "Private",
        assignedMemberIds: ["foreign-person"],
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call({
        action: "create_commitment",
        title: "Nobody",
        assignedMemberIds: [],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call({
        action: "share_transaction",
        transactionId: "meal",
        visibility: "item",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call({
        action: "share_transaction",
        transactionId: "idr",
        visibility: "item",
      })
    ).status,
    200,
  );
  const share = await prisma.circleSharedTransaction.findFirstOrThrow({
    where: { transactionId: "meal" },
  });
  assert.equal(
    (
      await call({
        action: "update_expense_split",
        id: share.id,
        items: [
          {
            description: "Lunch",
            amount: "1200",
            participantIds: ["me", "mia"],
          },
        ],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call({
        action: "update_expense_split",
        id: share.id,
        items: [
          {
            description: "Lunch",
            amount: "1200",
            participantIds: ["foreign-person"],
          },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        {
          action: "update_expense_split",
          id: share.id,
          items: [
            { description: "Lunch", amount: "1200", participantIds: ["me"] },
          ],
        },
        "qa-stranger",
      )
    ).status,
    404,
  );
  const data = await loadCirclesWorkspaceData(user, "circle");
  assert.equal(data.circles[0].expenseTotalThisMonth, 1200);
  assert.deepEqual(data.circles[0].expenseCurrencyTotals, {
    PHP: 1200,
    IDR: 75440,
  });
  assert.equal(data.circles[0].budgets[0].spentAmount, 1200);
  assert.equal(
    data.circles[0].expenses.find((e) => e.transactionId === "meal")?.lineItems
      ?.length,
    3,
  );
  assert.equal(data.circles[0].members.filter((m) => m.isMe).length, 1);
  await prisma.financialCommitment.create({
    data: {
      id: "linked-recurring",
      workspaceId: "personal",
      kind: "planned_payment",
      title: "Monthly Lunch",
      transactionId: "meal",
      currency: "PHP",
    },
  });
  await prisma.splitBill.create({
    data: {
      id: "linked-bill",
      userId: user.id,
      transactionId: "meal",
      title: "Lunch with Friends",
      billDate: new Date(),
      currency: "PHP",
      total: 1200,
      participants: { create: [{ name: "Me" }, { name: "Mia" }] },
    },
  });
  const req = new Request(
    "https://clover.test/api/transactions/meal/related?workspaceId=personal",
  );
  const linked = await withMobileRequestContext("local-admin", req, () =>
    related(req, { params: Promise.resolve({ transactionId: "meal" }) }),
  );
  assert.equal(linked.status, 200);
  const links = await linked.json();
  assert.equal(links.circles[0].name, "Trip");
  assert.equal(links.splitBill.id, "linked-bill");
  assert.equal(links.splitBill.people.length, 2);
  assert.equal(links.recurring[0].id, "linked-recurring");
  assert.equal(links.recurring[0].categoryName, "Food & Dining");
  const wrong = new Request(
    "https://clover.test/api/transactions/meal/related?workspaceId=other",
  );
  assert.equal(
    (
      await withMobileRequestContext("local-admin", wrong, () =>
        related(wrong, { params: Promise.resolve({ transactionId: "meal" }) }),
      )
    ).status,
    404,
  );
  assert.deepEqual(
    await prisma.transaction.findUnique({ where: { id: "meal" } }),
    transaction,
    "Collaboration changes must preserve every confirmed transaction field and raw receipt",
  );
  console.log(
    "PASS real Circle API and database: one-time budgets, multi-assignee recurring, member isolation, saved item splits, date validation, scoped links, raw receipt and confirmed-record preservation. External requests: 0.",
  );
}
main().finally(() => prisma.$disconnect());

// Opt-in disposable database integration. Use the test-only Clerk verifier preload.
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import * as mobile from "../app/api/mobile/v1/[...path]/route";
import { mobileHome } from "../lib/mobile-home";
import { mobileRecurring } from "../lib/mobile-recurring";
import { mobileHomePeriods } from "../lib/mobile-home-periods";
import { mobileGoals, loadGoalActivity } from "../lib/mobile-goals";
import {
  mobileSplitBillInput,
  mobileSplitBillPayload,
} from "../lib/mobile-together-input";
import { loadReportNetWorth } from "../lib/report-net-worth";
const db = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  !["127.0.0.1", "localhost"].includes(db.hostname) ||
  !db.pathname.endsWith("_qa")
)
  throw Error("Use an isolated local QA database");
let count = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  console.log(`PASS ${name}`);
  count++;
}
async function main() {
  const user = await prisma.user.upsert({
    where: { clerkUserId: "native-gap-fixture-user" },
    update: {},
    create: {
      clerkUserId: "native-gap-fixture-user",
      email: "native-gap-fixture@example.invalid",
    },
  });
  const w = await prisma.workspace.create({
      data: { userId: user.id, name: "Disposable native gap QA" },
    }),
    other = await prisma.workspace.create({
      data: { userId: user.id, name: "Other native QA Profile" },
    });
  const foreign = await prisma.account.create({
    data: {
      workspaceId: other.id,
      name: "Foreign",
      type: "bank",
      currency: "PHP",
      source: "manual",
      balance: "999",
    },
  });
  const call = async (
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    workspaceId = w.id,
    token = "native-fixture-token",
  ) => {
    const request = new Request(
      `https://staging.clover.ph/api/mobile/v1/${path}?workspaceId=${workspaceId}`,
      {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          cookie: "spoof=ignored",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    const response = await mobile[method](request, {
      params: Promise.resolve({ path: path.split("/") }),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    await test("Invalid bearer rejected", async () => {
      assert.equal(
        (await call("POST", "accounts", {}, w.id, "bad")).status,
        401,
      );
    });
    let accountId = "",
      recurringId = "";
    await test("Account creation persists manual source", async () => {
      const r = await call("POST", "accounts", {
        name: "Native wallet",
        institution: "",
        type: "wallet",
        currency: "PHP",
        balance: "1000",
      });
      assert.ok(r.status < 300, JSON.stringify(r));
      accountId = r.data.account.id;
      const a = await prisma.account.findUniqueOrThrow({
        where: { id: accountId },
      });
      assert.equal(a.source, "manual");
      assert.equal(a.balance?.toString(), "1000");
    });
    await test("Account rename preserves balance", async () => {
      const r = await call("PATCH", `accounts/${accountId}`, {
        name: "Renamed wallet",
      });
      assert.equal(r.status, 200, JSON.stringify(r));
      assert.equal(
        (
          await prisma.account.findUniqueOrThrow({ where: { id: accountId } })
        ).balance?.toString(),
        "1000",
      );
    });
    await test("Identifier edit returns only last four", async () => {
      const r = await call("PATCH", `accounts/${accountId}`, {
        accountNumber: "123456789",
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.account.lastFour, "6789");
      assert.ok(!JSON.stringify(r.data).includes("123456789"));
    });
    await test("Cross-Profile account read edit delete blocked", async () => {
      for (const m of ["GET", "PATCH", "DELETE"] as const)
        assert.equal(
          (
            await call(
              m,
              `accounts/${foreign.id}`,
              m === "PATCH" ? { name: "Attack" } : undefined,
            )
          ).status,
          404,
        );
    });
    const tracking = {
      version: 1,
      amountType: "fixed",
      paymentAmount: 100,
      totalPayments: 12,
      paymentsMade: 2,
      endDate: null,
      debtType: "loan",
      balanceDate: null,
      liabilityAccountId: null,
      interestRate: 0,
      reminderDays: 1,
      reference: "fixture",
      monthEnd: false,
    };
    const draft = {
      title: "Test loan",
      kind: "debt",
      amount: "1000",
      currency: "PHP",
      dueDate: "2026-09-15",
      plannedPaymentDate: "2026-09-14",
      recurrence: "monthly",
      accountId,
      tracking,
    };
    await test("Recurring create persists tracking", async () => {
      const r = await call("POST", "recurring", draft);
      assert.equal(r.status, 201, JSON.stringify(r));
      recurringId = r.data.commitment.id;
      assert.deepEqual(
        (
          await prisma.financialCommitment.findUniqueOrThrow({
            where: { id: recurringId },
          })
        ).tracking,
        tracking,
      );
    });
    await test("Recurring rename preserves schedule and tracking", async () => {
      assert.equal(
        (
          await call("PATCH", `recurring/${recurringId}`, {
            title: "Renamed loan",
          })
        ).status,
        200,
      );
      const r = await prisma.financialCommitment.findUniqueOrThrow({
        where: { id: recurringId },
      });
      assert.deepEqual(r.tracking, tracking);
      assert.equal(r.dueDate?.toISOString().slice(0, 10), "2026-09-15");
    });
    await test("Completion persists under contractual date", async () => {
      const r = await call("PATCH", `recurring/${recurringId}/completion`, {
        dueDate: "2026-09-15",
        completed: true,
      });
      assert.equal(r.status, 200, JSON.stringify(r));
      const data = await mobileRecurring(w.id, 2026, 8);
      writeFileSync("/tmp/native-recurring-fixture.json", JSON.stringify(data));
      const o = data.occurrences.find((o) => o.id === recurringId);
      assert.equal(o?.date, "2026-09-14");
      assert.equal(o?.dueDate, "2026-09-15");
      assert.equal(o?.completed, true);
    });
    await test("Completion is idempotent and undo persists", async () => {
      await call("PATCH", `recurring/${recurringId}/completion`, {
        dueDate: "2026-09-15",
        completed: true,
      });
      assert.equal(
        await prisma.financialCommitmentOccurrence.count({
          where: { commitmentId: recurringId },
        }),
        1,
      );
      await call("PATCH", `recurring/${recurringId}/completion`, {
        dueDate: "2026-09-15",
        completed: false,
      });
      assert.equal(
        await prisma.financialCommitmentOccurrence.count({
          where: { commitmentId: recurringId },
        }),
        0,
      );
    });
    await test("Cross-Profile recurring edits and account links blocked", async () => {
      assert.equal(
        (
          await call(
            "PATCH",
            `recurring/${recurringId}`,
            { title: "Attack" },
            other.id,
          )
        ).status,
        404,
      );
      assert.equal(
        (await call("POST", "recurring", { ...draft, accountId: foreign.id }))
          .status,
        400,
      );
    });
    await test("Invalid and reversed recurring dates rejected", async () => {
      assert.equal(
        (await call("POST", "recurring", { ...draft, dueDate: "2026-02-30" }))
          .status,
        400,
      );
      assert.equal(
        (
          await call("POST", "recurring", {
            ...draft,
            plannedPaymentDate: "2026-09-20",
          })
        ).status,
        400,
      );
    });
    const { day } = mobileHomePeriods();
    await prisma.transaction.createMany({
      data: [
        {
          workspaceId: w.id,
          accountId,
          merchantRaw: "Income",
          date: day,
          amount: 200,
          type: "income",
          currency: "PHP",
          reviewStatus: "confirmed",
        },
        {
          workspaceId: w.id,
          accountId,
          merchantRaw: "Expense",
          date: day,
          amount: 50,
          type: "expense",
          currency: "PHP",
          reviewStatus: "pending_review",
        },
        {
          workspaceId: w.id,
          accountId,
          merchantRaw: "Transfer",
          date: day,
          amount: 999,
          type: "transfer",
          isTransfer: true,
          currency: "PHP",
          reviewStatus: "confirmed",
        },
      ],
    });
    await prisma.budget.create({
      data: {
        workspaceId: w.id,
        name: "Fixture monthly budget",
        targetAmount: 100,
        currency: "PHP",
        cadence: "monthly",
        kind: "spend_limit",
        scope: "global",
      },
    });
    await test("Home reports use real records and exclude transfers", async () => {
      const r = await mobileHome(w.id, "PHP");
      writeFileSync("/tmp/native-home-fixture.json", JSON.stringify(r));
      assert.equal(r.month.income, 200);
      assert.equal(r.month.expense, 50);
      assert.equal(r.budgets[0]?.actualAmount, 50);
      assert.equal(r.budgets[0]?.progressPercent, 50);
      assert.equal(r.weekly.days.at(-1)?.expense, 50);
      assert.equal(r.categories[0]?.amount, 50);
      assert.ok(r.reviewCount >= 1);
      assert.equal(r.weekly.days.length, 7);
      assert.equal(r.monthly.days.length, 30);
    });
    await test("Understand endpoints enforce authentication", async () => {
      for (const path of [
        "investments",
        "reports",
        "together-options",
        "market-news",
        "market-history",
      ])
        assert.equal(
          (await call("GET", path, undefined, w.id, "bad")).status,
          401,
        );
    });
    await test("Investment portfolio stays in the selected Profile", async () => {
      const own = await prisma.account.create({
        data: {
          workspaceId: w.id,
          name: "Owned investment",
          type: "investment",
          currency: "PHP",
          balance: 500,
          source: "manual",
        },
      });
      await prisma.account.create({
        data: {
          workspaceId: other.id,
          name: "Other Profile investment",
          type: "investment",
          currency: "USD",
          balance: 9000,
          source: "manual",
        },
      });
      const result = await call("GET", "investments");
      assert.equal(result.status, 200);
      assert.deepEqual(
        result.data.accounts.map((a: { id: string }) => a.id),
        [own.id],
      );
      assert.equal(
        JSON.stringify(result.data).includes("accountNumber"),
        false,
      );
    });
    await test("Native Reports totals and missing history", async () => {
      const r = await call("GET", "reports");
      assert.equal(r.status, 200, JSON.stringify(r));
      assert.equal(r.data.month.income, 200);
      assert.equal(r.data.month.expense, 50);
      assert.deepEqual(r.data.netWorth.points, []);
    });
    await test("Goal activity uses absolute amounts and excludes transfers", async () => {
      await prisma.transaction.create({
        data: {
          workspaceId: w.id,
          accountId,
          merchantRaw: "Positive expense convention",
          date: day,
          amount: 25,
          type: "expense",
          currency: "PHP",
          reviewStatus: "confirmed",
        },
      });
      const r = await loadGoalActivity(w.id, "PHP");
      assert.equal(r.income, 200);
      assert.equal(r.spending, 75);
      assert.equal(new Date(r.start).getUTCHours(), 16);
      assert.equal((await loadGoalActivity(other.id, "PHP")).income, 0);
    });
    await test("New goals expose real progress", async () => {
      await prisma.personalGoal.create({
        data: {
          workspaceId: w.id,
          goalKey: "save_more",
          targetAmount: 250,
          currency: "PHP",
          goalPlan: {
            goalKey: "save_more",
            cadence: "monthly",
            targetMode: "amount",
            targetAmount: 250,
            targetPercent: null,
            purpose: "Fixture",
          },
        },
      });
      const result = await mobileGoals(w.id, user.id);
      const goal = result.goals.find((g) => g.name === "Fixture");
      assert.ok(goal && "progress" in goal);
      assert.equal(goal.progress.currentAmount, 125);
      assert.equal(goal.progress.progressPercent, 50);
    });
    await test("Net worth history deduplicates dates and rejects mismatched evidence", async () => {
      const base = new Date("2026-09-12T00:00:00Z");
      await prisma.accountStatementCheckpoint.createMany({
        data: [
          {
            workspaceId: w.id,
            accountId,
            statementEndDate: base,
            endingBalance: 100,
            status: "reconciled",
          },
          {
            workspaceId: w.id,
            accountId,
            statementEndDate: new Date(+base + 3600000),
            endingBalance: 200,
            status: "reconciled",
          },
          {
            workspaceId: w.id,
            accountId,
            statementEndDate: new Date(+base + 7200000),
            endingBalance: 999,
            status: "mismatch",
          },
        ],
      });
      const r = await loadReportNetWorth(
        w.id,
        "PHP",
        base,
        new Date(+base + 86400000),
        accountId,
      );
      assert.deepEqual(r.points, [{ date: "2026-09-12", balance: 200 }]);
      assert.deepEqual(
        (
          await loadReportNetWorth(
            other.id,
            "PHP",
            base,
            new Date(+base + 86400000),
            accountId,
          )
        ).points,
        [],
      );
    });
    await test("Receipt allocation retains separate source evidence", async () => {
      const input = mobileSplitBillInput.parse({
        title: "Reviewed bill",
        note: "",
        billDate: "2026-09-13",
        currency: "PHP",
        total: "100.00",
        participants: [{ name: "You" }, { name: "Friend" }],
        paidByIndex: null,
        receipt: {
          fileName: "receipt.png",
          mimeType: "image/png",
          storageKey: "split-bill-receipts/fixture/receipt.png",
          text: "Original total 99.00",
          confidence: 70,
          items: [{ description: "Original item", amount: "99.00" }],
        },
      });
      const payload = mobileSplitBillPayload(input);
      assert.equal(payload.sourceType, "receipt");
      assert.equal(payload.receiptText, "Original total 99.00");
      assert.equal(payload.items[0].amount, "100.00");
      assert.equal(payload.rawPayload?.receipt.items[0].amount, "99.00");
      assert.deepEqual(payload.payments, []);
    });
    await test("Receipt transport rejects non-file payloads", async () => {
      assert.equal(
        (await call("POST", "split-bill-receipts/preview", {})).status,
        400,
      );
    });
    await test("Recurring deletion preserves transactions", async () => {
      const n = await prisma.transaction.count({
        where: { workspaceId: w.id },
      });
      assert.equal(
        (await call("DELETE", `recurring/${recurringId}`)).status,
        200,
      );
      assert.equal(
        await prisma.financialCommitment.count({ where: { id: recurringId } }),
        0,
      );
      assert.equal(
        await prisma.transaction.count({ where: { workspaceId: w.id } }),
        n,
      );
    });
    console.log(`${count}/${count} isolated persistence checks passed.`);
  } finally {
    await prisma.workspace.deleteMany({
      where: { id: { in: [w.id, other.id] } },
    });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

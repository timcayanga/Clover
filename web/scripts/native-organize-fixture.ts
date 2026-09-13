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


    await test("Goal deletion is Profile scoped", async () => {
      const goal=await prisma.personalGoal.create({data:{workspaceId:w.id,goalKey:"save_more",currency:"PHP",targetAmount:100,goalPlan:{}}});
      assert.equal((await call("DELETE","goals",{id:goal.id},other.id)).status,404);
      assert.equal((await call("DELETE","goals",{id:goal.id})).status,200);
      assert.equal(await prisma.personalGoal.count({where:{id:goal.id}}),0);
      assert.equal(await prisma.account.count({where:{id:foreign.id}}),1);
    });
    await test("Native bill edits preserve source data and payments; preview never saves", async () => {
      const created=await call("POST","split-bills",{title:"Disposable edit QA",note:"",billDate:"2026-09-13",currency:"PHP",total:"100.00",participants:[{name:"QA One"},{name:"QA Two"}],paidByIndex:0});
      assert.ok(created.status<300,JSON.stringify(created));
      const id=created.data.bill.id;
      try {
        await prisma.splitBill.update({where:{id},data:{receiptText:"Original source total 100",rawPayload:{source:"digital_note_split_bill",originalTotal:"100.00",declaredTotal:"100.00",participantShares:[{participantName:"QA One",charged:"30.00"},{participantName:"QA Two",charged:"70.00"}]}}});
        const before=(await call("GET",`split-bills/${id}`)).data.bill;
        const descriptionOnly={title:"Renamed imported bill",items:before.items.map((i:any)=>({id:i.id,description:"Renamed item",amount:i.amount,participantIds:i.participantIds,splitMethod:i.splitMethod??"equal",allocations:i.allocations??[]}))};
        const rename = await call("PATCH",`split-bills/${id}`,descriptionOnly);
        assert.equal(rename.status,200,JSON.stringify(rename));
        assert.deepEqual(rename.data.bill.settlement.participants.map((p:any)=>p.owed).sort((a:number,b:number)=>a-b),[30,70]);
        const unchangedPreview = await call("POST",`split-bills/${id}/preview`,descriptionOnly);
        assert.equal(unchangedPreview.status,200);
        assert.deepEqual(unchangedPreview.data.settlement.participants.map((p:any)=>p.owed).sort((a:number,b:number)=>a-b),[30,70]);
        const body={title:"Edited QA bill",items:before.items.map((i:any)=>({id:i.id,description:"Edited meal",amount:"200.00",participantIds:before.participants.map((p:any)=>p.id),splitMethod:"equal",allocations:[]}))};
        const preview=await call("POST",`split-bills/${id}/preview`,body);
        assert.equal(preview.status,200,JSON.stringify(preview));
        assert.equal(preview.data.settlement.participants[0].owed,100);
        assert.equal((await prisma.splitBill.findUniqueOrThrow({where:{id}})).total?.toString(),"100");
        const saved=await call("PATCH",`split-bills/${id}`,body);
        assert.equal(saved.status,200,JSON.stringify(saved));
        assert.equal(Number(saved.data.bill.total),200);
        const record=await prisma.splitBill.findUniqueOrThrow({where:{id},include:{payments:true}});
        assert.equal(record.receiptText,"Original source total 100");
        assert.equal((record.rawPayload as any).originalTotal,"100.00");
        assert.equal(record.payments[0].amount.toString(),"100");
        const invalid=[{...body,rawPayload:{tampered:true}},{...body,items:body.items.map((i:any)=>({...i,participantIds:["foreign"]}))},{...body,items:body.items.map((i:any)=>({...i,splitMethod:"percentage",allocations:i.participantIds.map((participantId:string)=>({participantId,value:"20"}))}))}];
        for(const bad of invalid) assert.ok((await call("PATCH",`split-bills/${id}`,bad)).status>=400);
        assert.equal((await call("PATCH",`split-bills/${id}`,body,w.id,"bad")).status,401);
        const paymentCount = await prisma.splitBillPayment.count({where:{billId:id}});
        const transferCount = await prisma.splitBillTransferSettlement.count({where:{billId:id}});
        const { withMobileRequestContext } = await import("../lib/mobile-request-context");
        const webBillRoute = await import("../app/api/split-bills/[billId]/route");
        const billContext = {params:Promise.resolve({billId:id})};
        const readRequest = new Request(`https://staging.clover.ph/api/split-bills/${id}`);
        const fullBefore = await withMobileRequestContext(user.clerkUserId!,readRequest,()=>webBillRoute.GET(readRequest,billContext));
        const staleBill = (await fullBefore.json()).bill;
        const shareToken = `disposable-${id}`;
        await prisma.splitBillPaymentRequest.create({data:{billId:id,recipientParticipantId:before.participants[1].id,payeeParticipantId:before.participants[0].id,recipientName:"QA Two",payeeName:"QA One",amount:100,currency:"PHP",shareToken}});
        const resolved = await call("POST",`split-bills/${id}/resolution`);
        assert.equal(resolved.status,200,JSON.stringify(resolved));
        assert.equal(resolved.data.bill.resolved,true);
        assert.equal(await prisma.splitBillPayment.count({where:{billId:id}}),paymentCount);
        assert.equal(await prisma.splitBillTransferSettlement.count({where:{billId:id}}),transferCount);
        assert.equal(Number(resolved.data.bill.total),200);
        const publicRoute = await import("../app/api/split-bill-requests/[token]/route");
        const publicContext = {params:Promise.resolve({token:shareToken})};
        const publicRequest = new Request(`https://staging.clover.ph/api/split-bill-requests/${shareToken}`);
        const publicRead = await publicRoute.GET(publicRequest,publicContext);
        const publicData = await publicRead.json();
        assert.equal(publicData.request.status,"resolved");
        assert.equal(publicData.request.bill.rawPayload,undefined);
        assert.equal((await publicRoute.POST(publicRequest,publicContext)).status,409);
        const staleRequest = new Request(readRequest.url,{method:"PATCH",headers:{"content-type":"application/json",origin:"https://staging.clover.ph"},body:JSON.stringify({...staleBill,receiptText:null})});
        const staleSave = await withMobileRequestContext(user.clerkUserId!,staleRequest,()=>webBillRoute.PATCH(staleRequest,billContext));
        assert.equal(staleSave.status,200,await staleSave.clone().text());
        const finalBill = await prisma.splitBill.findUniqueOrThrow({where:{id}});
        assert.equal(finalBill.receiptText,"Original source total 100");
        assert.ok((finalBill.rawPayload as any).billResolvedAt);
        assert.ok((finalBill.rawPayload as any).splitBillActivity.some((event:any)=>event.message.includes("Bill resolved")));


      } finally { await call("DELETE",`split-bills/${id}`); }
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

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
globalThis.fetch = async () => {
  throw Error("External network disabled for direct bill QA");
};
const require = createRequire(import.meta.url);
async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const id = require.resolve("../lib/split-bill-access");
  const saved = require.cache[id];
  let user: any;
  require.cache[id] = {
    id,
    filename: id,
    loaded: true,
    exports: { getSplitBillCurrentUser: async () => user },
  } as NodeModule;
  const { POST } = await import("../app/api/split-bills/route");
  user = await db.user.create({
    data: {
      clerkUserId: "split-" + randomUUID(),
      email: randomUUID() + "@example.invalid",
      verified: true,
      environment: "staging",
    },
  });
  const other = await db.user.create({
    data: {
      clerkUserId: "split-" + randomUUID(),
      email: randomUUID() + "@example.invalid",
      verified: true,
      environment: "staging",
    },
  });
  const workspace = await db.workspace.create({
      data: { userId: user.id, name: "Direct split QA" },
    }),
    foreign = await db.workspace.create({
      data: { userId: other.id, name: "Foreign QA" },
    });
  const account = await db.account.create({
    data: {
      workspaceId: workspace.id,
      name: "Confirmed bank",
      type: "bank",
      currency: "PHP",
      balance: "9876.54",
    },
  });
  const category = await db.category.create({
    data: { workspaceId: workspace.id, name: "Food & Dining", type: "expense" },
  });
  const original = await db.transaction.create({
    data: {
      workspaceId: workspace.id,
      accountId: account.id,
      date: new Date("2026-11-01"),
      amount: "123.45",
      currency: "PHP",
      type: "expense",
      merchantRaw: "Preserved",
      reviewStatus: "confirmed",
    },
  });
  const group = await db.splitBillGroup.create({
    data: {
      userId: user.id,
      name: "Dinner group",
      members: { create: [{ name: "Alex" }, { name: "Bea" }] },
    },
  });
  const snapshot = async () =>
    JSON.stringify({
      account: await db.account.findUnique({ where: { id: account.id } }),
      original: await db.transaction.findUnique({ where: { id: original.id } }),
    });
  const before = await snapshot();
  const body = () => {
    const me = randomUUID(),
      friend = randomUUID();
    return {
      title: "Dinner",
      note: "Shared meal",
      billDate: "2026-11-20",
      currency: "PHP",
      total: "100.00",
      groupId: group.id,
      participants: [
        { id: me, name: "Alex" },
        { id: friend, name: "Bea" },
      ],
      items: [
        {
          description: "Dinner",
          amount: "100.00",
          participantIds: [me, friend],
        },
      ],
      payments: [{ participantId: me, amount: "100.00" }],
      expense: {
        workspaceId: workspace.id,
        accountId: account.id,
        categoryId: category.id,
        attemptId: randomUUID(),
      },
    };
  };
  const post = (body: unknown) =>
    POST(
      new Request("https://staging.clover.ph/api/split-bills", {
        method: "POST",
        headers: {
          origin: "https://staging.clover.ph",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
  try {
    const request = body();
    const [a, b] = await Promise.all([post(request), post(request)]);
    assert.equal(a.status, 201, JSON.stringify(await a.clone().json()));
    assert.equal(b.status, 201, JSON.stringify(await b.clone().json()));
    const first = (await a.json()).bill,
      second = (await b.json()).bill;
    assert.equal(first.id, second.id);
    assert.equal(first.group.id, group.id);
    const savedPeople = () => db.splitBillPerson.findMany({ where: { userId: user.id }, orderBy: { name: "asc" }, select: { name: true } });
    assert.deepEqual(await savedPeople(), [{ name: "Alex" }, { name: "Bea" }]);
    const { POST: createGroup } = await import("../app/api/split-bill-groups/route");
    const savedGroup = await createGroup(new Request("https://staging.clover.ph/api/split-bill-groups", {
      method: "POST", headers: { origin: "https://staging.clover.ph", "content-type": "application/json" },
      body: JSON.stringify({ name: "Weekend", members: [{ name: "bea" }, { name: "Carlo" }] }),
    }));
    assert.equal(savedGroup.status, 201);
    assert.deepEqual(await savedPeople(), [{ name: "Alex" }, { name: "Bea" }, { name: "Carlo" }]);

    const {PATCH: editPerson} = await import("../app/api/split-bill-people/[personId]/route");
    const {POST: addContact} = await import("../app/api/split-bill-people/route");
    const bea = await db.splitBillPerson.findFirstOrThrow({where:{userId:user.id,name:"Bea"}});
    const edit = (name:string,email:string|null,phone:string|null) => editPerson(new Request("https://staging.clover.ph/api/split-bill-people/"+bea.id,{
      method:"PATCH",body:JSON.stringify({name,email,phone})
    }),{params:Promise.resolve({personId:bea.id})});
    assert.equal((await edit("Beatrice","bea@example.test","5550101")).status,200);
    assert.equal((await edit("Carlo",null,null)).status,409);
    const picked = await addContact(new Request("https://staging.clover.ph/api/split-bill-people",{
      method:"POST",body:JSON.stringify({name:"Beatrice",fromContacts:true})
    }));
    const contact = (await picked.json()).person;
    assert.equal(contact.id,bea.id);
    assert.equal(contact.fromContacts,true);
    assert.equal(contact.phone,"5550101");
    assert.equal((await edit("Beatrice",null,null)).status,200);
    const updated = await db.splitBillPerson.findUniqueOrThrow({where:{id:bea.id}});
    assert.equal(updated.name,"Bea");
    assert.equal(updated.displayName,"Beatrice");
    assert.equal(updated.email,null);
    assert.equal(updated.phone,null);
    assert.equal(await db.splitBill.count({ where: { userId: user.id } }), 1);
    assert.equal(
      await db.transaction.count({ where: { workspaceId: workspace.id } }),
      2,
    );
    const bill = await db.splitBill.findUniqueOrThrow({
      where: { id: first.id },
    });
    assert(bill.transactionId);
    const row = await db.transaction.findUniqueOrThrow({
      where: { id: bill.transactionId! },
    });
    assert.equal(row.amount.toFixed(2), "100.00");
    assert.equal(row.categoryId, category.id);
    assert.equal(row.accountId, account.id);
    assert.equal(row.reviewStatus, "confirmed");
    assert.equal(row.description, "Shared meal");
    const rejected = body();
    rejected.expense.workspaceId = foreign.id;
    assert.equal((await post(rejected)).status, 400);
    const foreignGroup = await db.splitBillGroup.create({
      data: { userId: other.id, name: "Private group" },
    });
    const crossGroup = body();
    crossGroup.groupId = foreignGroup.id;
    assert.equal((await post(crossGroup)).status, 400);
    const wrongAccount = body();
    wrongAccount.expense.accountId = "missing";
    assert.equal((await post(wrongAccount)).status, 400);
    const wrongTotal = body();
    wrongTotal.total = "101";
    assert.equal((await post(wrongTotal)).status, 400);
    assert.equal(await db.splitBill.count({ where: { userId: user.id } }), 1);
    const cash = {
      ...body(),
      expense: { workspaceId: workspace.id, attemptId: randomUUID() },
      sourceType: "receipt",
      receiptFileName: "receipt.jpg",
      receiptText: "Dinner TOTAL PHP 100",
      receiptConfidence: 55,
    };
    assert.equal((await post(cash)).status, 201);
    const cashRow = await db.transaction.findFirstOrThrow({
      where: { workspaceId: workspace.id, account: { type: "cash" } },
    });
    assert.equal(cashRow.amount.toFixed(2), "100.00");
    assert.equal(
      (cashRow.rawPayload as any).receiptLineItems[0].description,
      "Dinner",
    );
    assert.equal(
      (await db.account.findUniqueOrThrow({ where: { id: cashRow.accountId } }))
        .balance,
      null,
    );
    const { expense, ...legacy } = body();
    assert.equal((await post(legacy)).status, 201);
    assert.equal(
      await db.transaction.count({ where: { workspaceId: workspace.id } }),
      3,
      "Legacy callers do not silently create transactions",
    );
    const circle = await db.circle.create({data: {ownerUserId:user.id, name:"Circle QA", memberships:{create:[
      {userId:user.id,displayName:"Alex",role:"organizer",status:"active"},
      {displayName:"Bea",role:"member",status:"invited"},
    ]}}});
    await db.splitBillGroup.update({where:{id:group.id},data:{circleId:circle.id}});
    const {mobileSplitBillInput, mobileSplitBillPayload} = await import("../lib/mobile-together-input");
    const initialCount = await db.transaction.count({where:{workspaceId:workspace.id}});
    let standaloneId = "";
    for (const total of ["1470.54", ""]) {
      const standalone = mobileSplitBillInput.parse({
        expense:{workspaceId:workspace.id,attemptId:randomUUID(),splitOnly:true,categoryId:category.id},
        title:"Cafe", total, note:"", currency:"PHP", billDate:"2026-11-19",
        participants:[{name:"Alex"}], paidByIndex:total ? 0 : null,
      });
      const create = () => post(mobileSplitBillPayload(standalone));
      const response = await create();
      assert.equal(response.status,201,JSON.stringify(await response.clone().json()));
      const {bill} = await response.json();
      assert.equal((await (await create()).json()).bill.id,bill.id);
      const record = await db.splitBill.findUniqueOrThrow({where:{id:bill.id}});
      if (total) standaloneId = bill.id;
      assert.equal(record.transactionId,null);
      assert.equal(record.total?.toFixed(2) ?? "",total);
      assert.equal((record.rawPayload as Record<string,unknown>).categoryName,category.name);
      if (!total) {
        const {mergeMobileBillEdit} = await import("../lib/mobile-split-bill-edit");
        const participantIds = bill.participants.map((person:{id:string})=>person.id);
        const corrected = mergeMobileBillEdit(bill,{title:"Cafe",billDate:"2026-11-19",missingTotal:"1470.54",
          items:[{id:bill.id+"-total",description:"Cafe",amount:"1470.54",participantIds,splitMethod:"equal",allocations:[]}]});
        assert.equal(corrected.total,"1470.54");
        assert.equal(corrected.billDate,"2026-11-19");
      }
    }
    assert.equal(await db.transaction.count({where:{workspaceId:workspace.id}}),initialCount);
    // Reopen the group ledger after a real receipt save. The mobile projection
    // must preserve every purchase and the separate service charge.
    {
      const {encodeLocalReceiptOcr} = await import("../lib/local-receipt-ocr-envelope");
      const {parseReceiptPhotoText} = await import("../lib/split-bill");
      const {canSaveReceiptForReview} = await import("../lib/receipt-progressive.server");
      const {mobileApiResponse} = await import("../lib/mobile-api-response");
      const {withMobileRequestContext} = await import("../lib/mobile-request-context");
      const {GET} = await import("../app/api/split-bills/route");
      const source = process.env.CLOVER_QA_OPTICAL_TRANSCRIPT
        ? require("node:fs").readFileSync(process.env.CLOVER_QA_OPTICAL_TRANSCRIPT, "utf8")
        : encodeLocalReceiptOcr({text:["THE SPIRITS LIBRARY INC.", "MAKATI", "11/19/26 10:12 PM",
          "Qty Item Description Amount", "1 Mocktail 350.00", "1 Cavinti Fizz 480.00", "1 Punch from the Past 520.00",
          "Sub-total: 1350.00", "Service Charge: 120.54", "3 Item(s) Total Amount 1470.54", "Total Amount 1470.54"].join("\n")});
      const preview = parseReceiptPhotoText(source, "PHP");
      assert(canSaveReceiptForReview(preview), "A reconciled optical receipt can persist as a reviewable group bill");
      assert(!canSaveReceiptForReview({...preview,total:"1480.54"}));
      const input = mobileSplitBillInput.parse({expense:{workspaceId:workspace.id,attemptId:randomUUID(),splitOnly:true},
        title:preview.merchantName, total:preview.total, note:"", currency:"PHP",billDate:"2026-11-19",groupId:group.id,
        participants:[{name:"Alex"},{name:"Bea"}],paidByIndex:0,receipt:{storageKey:"split-bill-receipts/"+user.id+"/qa.jpg",
          fileName:"test.jpg",mimeType:"image/jpeg",text:source,confidence:preview.confidence,needsReview:true,
          items:preview.items.map(item=>({...item, quantity:1, wrapped:false}))}});
      assert.deepEqual(Object.keys(input.receipt!.items[0]).sort(), ["amount","description"]);
      const saved = await post(mobileSplitBillPayload(input));
      assert.equal(saved.status,201,JSON.stringify(await saved.clone().json()));
      const id = (await saved.json()).bill.id;
      assert.equal((await (await post(mobileSplitBillPayload(input))).json()).bill.id,id);
      for (const query of ["?view=ledger&groupId="+group.id,"?page=1"]) {
        const request = new Request("https://staging.clover.ph/api/split-bills"+query);
        const response = await withMobileRequestContext(user.clerkUserId,request,()=>GET(request));
        const payload = mobileApiResponse("split-bills",await response.json()) as {bills:{id:string;group:{id:string};items:{amount:string}[];rawPayload?:{receiptNeedsReview?:boolean}}[]};
        const bill = payload.bills.find(row=>row.id===id);
        assert.equal(bill?.group.id,group.id);
        assert.deepEqual(bill.items.map(row=>Number(row.amount)),[350,480,520,120.54]);
        assert.equal(bill.rawPayload?.receiptNeedsReview,true);
      }
    }
    const {linkStandaloneBillExpense} = await import("../lib/split-bill-direct-expense");
    const link = () => db.$transaction(tx => linkStandaloneBillExpense(tx,user.id,standaloneId,workspace.id));
    await Promise.all([link(),link()]);
    assert.equal(await db.transaction.count({where:{workspaceId:workspace.id}}),initialCount + 1);
    const draft = {expense:body().expense, circleId:circle.id, groupId:group.id, title:"Taxi", total:"80.00", note:"",
      currency:"PHP", billDate:"2026-11-20", participants:[{name:"Alex"}], paidByIndex:0};
    assert.equal(mobileSplitBillInput.safeParse({...draft,circleId:undefined}).success,false);
    const saveCircle = (value: typeof draft) => post(mobileSplitBillPayload(mobileSplitBillInput.parse(value)));
    const outside = await saveCircle({...draft, participants:[{name:"Outside Circle"}]});
    assert.equal(outside.status,400);
    const circleResponse = await saveCircle(draft);
    assert.equal(circleResponse.status,201,JSON.stringify(await circleResponse.clone().json()));
    const savedExpense = (await circleResponse.json()).bill;
    assert.deepEqual(savedExpense.participants.map((person:{name:string})=>person.name),["Alex"]);
    assert.equal(savedExpense.group.id,group.id);
    assert.equal(
      await snapshot(),
      before,
      "Confirmed transaction and balance must stay unchanged",
    );
    console.log(
      "PASS direct Split Bill atomic create, repeat request, group retention, ownership, optional Cash/category, receipt evidence, rollback and confirmed-data preservation",
    );
  } finally {
    await db.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    if (saved) require.cache[id] = saved;
    else delete require.cache[id];
    await db.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

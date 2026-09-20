import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import {
  positionInput,
  saveInvestmentPosition,
  savePositionTrade,
  listInvestmentPositions,
  investmentPositionHistory,
} from "../lib/investment-position-store";
import {
  listInvestmentTrades,
  saveInvestmentTrade,
} from "../lib/investment-trade-store";
import {
  nativeUploadRequest,
  cleanupExpiredNativeUploads,
} from "../lib/native-upload-store";
import { validateImportFile } from "../lib/import-file-validation";
import { withCompletedNativeUpload } from "../lib/native-upload-validation";
import { NATIVE_UPLOAD_PART_SIZE } from "../../shared/native-upload";
const database = new URL(process.env.DATABASE_URL ?? "");
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.port, "56545");
assert.equal(database.pathname, "/clover_native_expansion");
async function main() {
  await prisma.$executeRaw`INSERT INTO "Account" (id,"workspaceId",name,institution,type,currency) VALUES ('broker-a','profile','Broker A','Example','investment','PHP'),('broker-b','profile','Broker B','Example','investment','PHP'),('foreign','other-profile','Other','Example','investment','PHP')`;
  await prisma.$executeRaw`INSERT INTO "InvestmentHolding" (id,"workspaceId","accountId","assetName","rawPayload") VALUES ('source','profile','broker-a','Example Stock','{"original":true}'::jsonb)`;
  const make = (quantity: string, name = "Example Stock", symbol = "EXM") =>
    positionInput.parse({
      id: randomUUID(),
      revision: 0,
      assetName: name,
      symbol,
      subtype: "stock",
      currency: "PHP",
      openingDate: "2026-09-01",
      openingQuantity: quantity,
      openingCostBasis: String(Number(quantity) * 100),
      value: null,
      valueDate: null,
      sourceHoldingId: null,
    });
  const a = { ...make("10"), sourceHoldingId: "source" },
    b = make("0"),
    other = make("4", "Other Asset", "OTH");
  await saveInvestmentPosition("profile", "broker-a", "owner", a);
  await saveInvestmentPosition("profile", "broker-b", "owner", b);
  await saveInvestmentPosition("profile", "broker-a", "owner", other);
  await saveInvestmentPosition("profile", "broker-a", "owner", {...a,openingQuantity:"10.000",openingCostBasis:"1000.00"}); // lost response replay with equivalent decimals
  assert.equal((await listInvestmentPositions("profile")).length, 3);
  await assert.rejects(
    saveInvestmentPosition("other-profile", "broker-a", "owner", make("1")),
    /Profile/,
  );
  await assert.rejects(
    saveInvestmentPosition("profile", "broker-a", "owner", make("1")),
    /already tracked/,
  );
  const trade = {
    id: randomUUID(),
    revision: 0,
    positionId: a.id,
    assetName: a.assetName,
    date: "2026-09-10",
    kind: "buy" as const,
    quantity: "2",
    amount: "230",
    costBasis: "210",
    note: "Fictional QA",
  };
  await savePositionTrade("profile", "broker-a", "owner", trade);
  await savePositionTrade("profile", "broker-a", "owner", trade);
  const positions = () => listInvestmentPositions("profile");
  const units = async (id: string) =>
    (await positions()).find((p) => p.id === id)!.quantity;
  assert.equal(await units(a.id), "12");
  assert.equal(await units(other.id), "4");
  await assert.rejects(
    saveInvestmentTrade("profile", "broker-a", "owner", {
      ...trade,
      revision: 1,
    }),
    /asset’s trading history|multiple/,
  );
  const transfer = {
    ...trade,
    id: randomUUID(),
    kind: "transfer_out" as const,
    quantity: "3",
    amount: "0",
    costBasis: "300",
    counterpartPositionId: b.id,
  };
  await savePositionTrade("profile", "broker-a", "owner", transfer);
  await savePositionTrade("profile", "broker-a", "owner", transfer);
  assert.equal(await units(a.id), "9");
  assert.equal(await units(b.id), "3");
  const destination = (await listInvestmentTrades("broker-b", 1)).items[0];
  assert.equal(destination.kind, "transfer_in");
  await assert.rejects(
    savePositionTrade("profile", "broker-a", "owner", {
      ...transfer,
      id: randomUUID(),
      quantity: "99",
    }),
    /exceed/,
  );
  assert.equal(await units(a.id), "9");
  assert.equal(await units(b.id), "3");
  await assert.rejects(
    savePositionTrade("profile", "broker-a", "owner", {
      ...transfer,
      id: randomUUID(),
      counterpartPositionId: other.id,
    }),
    /same asset/,
  );
  await assert.rejects(
    savePositionTrade("profile", "broker-a", "owner", {
      ...trade,
      id: randomUUID(),
      date: "2026-08-01",
    }),
    /opening date/,
  );
  await savePositionTrade(
    "profile",
    "broker-b",
    "owner",
    {
      ...transfer,
      id: destination.id,
      revision: 1,
      positionId: b.id,
      kind: "transfer_in",
      counterpartPositionId: undefined,
    },
    true,
  );
  assert.equal(await units(a.id), "12");
  assert.equal(await units(b.id), "0");
  const current = (await positions()).find((p) => p.id === a.id)!;
  await assert.rejects(
    saveInvestmentPosition("profile", "broker-a", "owner", {
      ...a,
      revision: current.revision,
      openingQuantity: "99",
    }),
    /opening values/,
  );
  await saveInvestmentPosition("profile", "broker-a", "owner", {
    ...a,
    revision: current.revision,
    value: "1500",
    valueDate: "2026-09-20",
  });
  assert.equal(
    (await investmentPositionHistory("profile", a.id)).history.at(-1)?.value,
    1500,
  );
  await assert.rejects(
    investmentPositionHistory("other-profile", a.id),
    /Profile/,
  );
  const raw = await prisma.$queryRaw<
    { rawPayload: unknown }[]
  >`SELECT "rawPayload" FROM "InvestmentHolding" WHERE id='source'`;
  assert.deepEqual(raw[0].rawPayload, { original: true });
  console.log(
    "PASS multi-asset positions, linked transfer atomicity/reversal, stale values, idempotency, ownership, immutable imported source",
  );
  const id = randomUUID(),
    name = "qa.csv",
    size = NATIVE_UPLOAD_PART_SIZE + 5;
  const request = (body: unknown) =>
    new Request("https://staging.clover.ph/api/mobile/v1/uploads/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const call = (
    action: string,
    body: unknown = {},
    user = "owner",
    profile = "profile",
  ) => nativeUploadRequest(request(body), id, user, profile, action);
  await call("start", { name, mimeType: "text/csv", size });
  const part = Buffer.alloc(NATIVE_UPLOAD_PART_SIZE, 65).toString("base64");
  await call("part", { index: 0, base64: part });
  await call("part", { index: 0, base64: part });
  const resumed = await (
    await call("start", { name, mimeType: "text/csv", size })
  ).json();
  assert.deepEqual(resumed.parts, [0]);
  await assert.rejects(
    call("part", { index: 1, base64: Buffer.alloc(4).toString("base64") }),
    /size/,
  );
  await assert.rejects(
    call("part", {
      index: 0,
      base64: Buffer.alloc(NATIVE_UPLOAD_PART_SIZE, 66).toString("base64"),
    }),
    /differs/,
  );
  await assert.rejects(
    call("part", { index: 1, base64: "AAAAAAA=" }, "other"),
    /expired/,
  );
  await call("cancel");
  await assert.rejects(
    call("part", { index: 1, base64: "AAAAAAA=" }),
    /no longer/,
  );
  await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "expiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE "id"=${id}`;
  assert.equal(await cleanupExpiredNativeUploads(), 1);
  const leasedId = randomUUID();
  await nativeUploadRequest(
    request({ name, mimeType: "text/csv", size: 5 }),
    leasedId,
    "owner",
    "profile",
    "start",
  );
  await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "expiresAt"=CURRENT_TIMESTAMP-INTERVAL '1 minute',"state"='finalizing',"leaseUntil"=CURRENT_TIMESTAMP+INTERVAL '1 minute' WHERE "id"=${leasedId}`;
  assert.equal(
    await cleanupExpiredNativeUploads(),
    0,
    "Cleanup must not delete an active finalization",
  );
  await prisma.$executeRaw`UPDATE "NativeUploadSession" SET "leaseUntil"=CURRENT_TIMESTAMP-INTERVAL '1 minute' WHERE "id"=${leasedId}`;
  assert.equal(await cleanupExpiredNativeUploads(), 1);
  assert.match(
    validateImportFile({ fileName: name, fileSize: 5 * 1024 * 1024 })!,
    /4 MB/,
  );
  assert.equal(
    withCompletedNativeUpload(() =>
      validateImportFile({ fileName: name, fileSize: 5 * 1024 * 1024 }),
    ),
    null,
  );
  assert.match(
    validateImportFile({ fileName: name, fileSize: 5 * 1024 * 1024 })!,
    /4 MB/,
  );
  console.log(
    "PASS resumable upload parts, duplicate detection, ownership, cancel, expiration cleanup and scoped size cap",
  );

  const fullId = randomUUID(),
    bytes = Buffer.alloc(NATIVE_UPLOAD_PART_SIZE * 3 + 7, 65);
  let handoffs = 0;
  const processor = async (req: Request) => {
    handoffs++;
    const form = await req.formData(),
      file = form.get("file") as File;
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
    assert.equal(form.get("workspaceId"), "profile");
    assert.equal(
      validateImportFile({ fileName: "large.csv", fileSize: file.size }),
      null,
    );
    return Response.json({ ok: true, canonicalImportFileId: "saved-id" });
  };
  const completeCall = (action: string, body: unknown = {}) =>
    nativeUploadRequest(
      request(body),
      fullId,
      "owner",
      "profile",
      action,
      processor,
    );
  await completeCall("start", {
    name: "large.csv",
    mimeType: "text/csv",
    size: bytes.length,
  });
  for (let i = 0; i < Math.ceil(bytes.length / NATIVE_UPLOAD_PART_SIZE); i++)
    await completeCall("part", {
      index: i,
      base64: bytes
        .subarray(
          i * NATIVE_UPLOAD_PART_SIZE,
          (i + 1) * NATIVE_UPLOAD_PART_SIZE,
        )
        .toString("base64"),
    });
  assert.equal(
    (await (await completeCall("complete")).json()).canonicalImportFileId,
    "saved-id",
  );
  assert.equal(
    (await (await completeCall("complete")).json()).canonicalImportFileId,
    "saved-id",
  );
  assert.equal(
    handoffs,
    1,
    "A repeated completion reuses the durable acknowledgement",
  );
  await assert.rejects(completeCall("cancel"), /already received/);
  console.log(
    "PASS >4 MB exact assembly, trusted parser handoff, cached canonical acknowledgement, post-handoff cancellation protection",
  );
}
main().finally(() => prisma.$disconnect());

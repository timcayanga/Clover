import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { supportMessageSummary } from "../lib/support-message-display";
import { mailFailure, mailFailureText } from "../lib/mail-delivery";
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, process.env.CLOVER_QA_PARSER_PORT ?? "55441");
assert.equal(url.pathname, "/clover_migration_qa");
assert(process.argv.includes("--execute"));
const require = createRequire(import.meta.url);
process.env.ZOHO_SMTP_PASSWORD = "isolated-fixture-only";
let environment = "production",
  permission = "support",
  failure: unknown = null,
  sends = 0;
let identityUnavailable = false, identitySlow = false, identityCalls = 0;
const outbound: Array<{ to: string; body: string; messageId: string }> = [];
const staff: Array<{
  email: string;
  message: string;
  recipient?: string;
  messageId?: string;
  attachment?: unknown;
}> = [];
let releaseSend: (() => void) | null = null,
  pause = false;
const saved = new Map<string, NodeModule | undefined>();
const callbacks: Array<() => Promise<void>> = [];
const mocks: Record<string, unknown> = {
  "@clerk/nextjs/server": { clerkClient: async () => ({ users: { getUserList: async ({userId}: {userId:string[]}) => {
    identityCalls++;
    if (identitySlow) return new Promise<never>(()=>{});
    if (identityUnavailable) throw Error("Fixture identity service unavailable");
    return { data: userId.map(id => ({ id, firstName: "Tim", lastName: "Tester", primaryEmailAddressId: "primary",
      emailAddresses: [{id:"primary",emailAddress:"staff@example.invalid"}] })) };
  } } }) },
  "../lib/admin": {
    getAdminDataEnvironment: () => environment,
    requireAdminAuth: async () => {
      if (permission !== "support") throw Error("FORBIDDEN");
      return { userId: "support-qa", role: "owner" };
    },
  },
  "../lib/deployment-environment": {
    getDeploymentEnvironment: () => environment,
  },
  "../lib/notification-mail.server": {
    sendNotificationMail: async (
      to: string,
      _subject: string,
      body: string,
      _html: unknown,
      options: { messageId: string },
    ) => {
      sends++;
      if (failure) throw failure;
      outbound.push({ to, body, messageId: options.messageId });
      if (pause)
        await new Promise<void>((r) => {
          releaseSend = r;
        });
    },
  },
  "../lib/contact-email": {
    sendContactInquiryEmail: async (input: (typeof staff)[number]) => {
      sends++;
      if (failure) throw failure;
      staff.push(input);
    },
  },
  "next/server": {
    NextResponse: { json: Response.json.bind(Response) },
    after: (callback: () => Promise<void>) => callbacks.push(callback),
  },
  "../lib/analytics-server": { capturePostHogServerEvent: async () => {} },
};
for (const [path, exports] of Object.entries(mocks)) {
  const id = require.resolve(path);
  saved.set(id, require.cache[id]);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
}
let network = 0;
globalThis.fetch = async () => {
  network++;
  throw Error("Support QA forbids remote calls");
};
async function main() {
  const { prisma: db } = await import("../lib/prisma");
  const { addSupportMessage } = await import("../lib/admin-support-messages");
  const { getSupportStaffLabels } = await import("../lib/support-staff.server");
  const { createContactInquiry } = await import("../lib/contact-inquiries");
  const { deliverContactNotification, dispatchContactNotifications } =
    await import("../lib/contact-notification.server");
  const notificationRoute = await import(
    "../app/api/admin/inquiries/[inquiryId]/notification/route"
  );
  const contactRoute = await import("../app/api/contact-us/route");
  const replyRoute = await import(
    "../app/api/admin/inquiries/[inquiryId]/messages/route"
  );
  const ids: string[] = [];
  const create = async (extra: Record<string, unknown> = {}) => {
    const r = await db.contactInquiry.create({
      data: {
        name: "QA only",
        email: "customer@example.invalid",
        message: "Preserved inquiry source",
        environment: "production",
        ...extra,
      },
    });
    ids.push(r.id);
    return r;
  };
  const messageInput = (extra: Record<string, unknown> = {}) => ({
    kind: "reply",
    subject: "Fixture reply",
    body: randomUUID() + " reply",
    idempotencyKey: randomUUID(),
    ...extra,
  });
  const request = (body: unknown) =>
    new Request("https://clover.ph/api/admin/fixture", {
      method: "POST",
      headers: {
        origin: "https://clover.ph",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  try {
    // Run the actual additive migration on a legacy support-only table. Original
    // IDs, content and timestamps survive, and deleted numbers are not reused.
    await db.$transaction(async tx => {
      const schema = "support_number_" + randomUUID().replaceAll("-", "");
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(`CREATE TABLE "ContactInquiry" (id TEXT PRIMARY KEY, message TEXT, "createdAt" TIMESTAMP)`);
      await tx.$executeRawUnsafe(`INSERT INTO "ContactInquiry" VALUES ('old-a','Retain this message','2026-10-01'),('old-b','Retain this too','2026-10-02')`);
      const before = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "ContactInquiry" ORDER BY id`);
      const migration = readFileSync("prisma/migrations/20261028090000_support_case_numbers/migration.sql", "utf8");
      for (const statement of migration.split(";").filter(value=>value.trim())) await tx.$executeRawUnsafe(statement);
      const after = await tx.$queryRawUnsafe<any[]>(`SELECT * FROM "ContactInquiry" ORDER BY id`);
      assert.deepEqual(after.map(({caseNumber,...row})=>row), before);
      assert.equal(new Set(after.map(row=>row.caseNumber)).size, 2);
      await tx.$executeRawUnsafe(`DELETE FROM "ContactInquiry" WHERE id='old-b'`);
      const inserted = await tx.$queryRawUnsafe<any[]>(`INSERT INTO "ContactInquiry" (id,message) VALUES ('new','New case') RETURNING "caseNumber"`);
      assert(inserted[0].caseNumber > Math.max(...after.map(row=>row.caseNumber)));
      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
    const staffId = "user_fixture_" + randomUUID();
    const names = await getSupportStaffLabels([staffId,staffId]);
    assert.equal(names[staffId].displayName, "Tim Tester");
    const calls = identityCalls;
    await getSupportStaffLabels([staffId]);
    assert.equal(identityCalls,calls,"Staff identity cache avoids repeated provider requests");
    identityUnavailable = true;
    const unknownStaff = "user_unknown_" + randomUUID();
    assert.equal((await getSupportStaffLabels([unknownStaff]))[unknownStaff].displayName,"Team member");
    identitySlow = true;
    const timeoutId = "user_slow_" + randomUUID();
    const lookupStarted = Date.now();
    assert.equal((await getSupportStaffLabels([timeoutId]))[timeoutId].displayName,"Team member");
    assert(Date.now()-lookupStarted<3000,"A stalled identity provider cannot stall the support queue");
    identitySlow = false;
    const fallbackId = "user_local_" + randomUUID();
    const local = await db.user.create({data:{clerkUserId:fallbackId,email:"staff-fallback@example.invalid",environment:"staging"}});
    try {
      assert.equal((await getSupportStaffLabels([fallbackId]))[fallbackId].displayName,"Team member","Foreign-environment account identity is not exposed");
      environment="staging";
      assert.equal((await getSupportStaffLabels([fallbackId]))[fallbackId].displayName,"staff-fallback@example.invalid","Same-environment email is the fallback; caches remain scoped");
    } finally { environment="production"; identityUnavailable=false; await db.user.delete({where:{id:local.id}}); }
    const assignment={kind:"assignment",body:`Assignment: ${staffId}; priority: normal; snoozed until: Not snoozed`,idempotencyKey:randomUUID()};
    const raw = assignment.body;
    assert.equal(supportMessageSummary(assignment,names),"Assigned to Tim Tester.");
    assert.equal(assignment.body,raw,"Display summaries do not rewrite stored audit text");
    assert.equal(supportMessageSummary({...assignment,body:"Assignment: retired-identity; priority: normal; snoozed until: Not snoozed"},{}),"Assigned to a team member.");
    assert(supportMessageSummary({...assignment,body:`Assignment: ${staffId}; priority: high; snoozed until: 2026-10-29T00:00:00Z`},names).includes("8:00 AM PHT"));
    const numbered = await create();
    assert(Number.isInteger(numbered.caseNumber) && numbered.caseNumber>0);
    const found = await (await import("../lib/contact-inquiries")).getAdminContactInquiries({query:`#${numbered.caseNumber}`});
    assert.deepEqual(found.items.map(item=>item.id),[numbered.id]);
    assert.deepEqual((await (await import("../lib/contact-inquiries")).getAdminContactInquiries({query:`Case #${numbered.caseNumber}`})).items.map(item=>item.id),[numbered.id]);
    for (const code of [535, 554])
      assert.deepEqual(
        mailFailure({
          code: "EAUTH",
          command: "AUTH PLAIN",
          responseCode: code,
        }),
        { outcome: "not_sent", code: "authentication_failed" },
      );
    assert.equal(
      mailFailure({ code: "ETIMEDOUT", command: "CONN" }).outcome,
      "unknown",
    );
    assert.equal(
      mailFailure({ code: "EDNS", command: "CONN" }).outcome,
      "not_sent",
    );
    for (const error of [
      { code: "ETIMEDOUT", command: "DATA" },
      { code: "ESOCKET", command: "DATA" },
      { command: "QUIT", responseCode: 554 },
      new Error("No evidence"),
    ])
      assert.equal(mailFailure(error).outcome, "unknown");
    assert.equal(
      mailFailure({ command: "DATA", responseCode: 450 }).outcome,
      "not_sent",
    );
    assert(!mailFailureText("authentication_failed").includes("uncertain"));
    const row = await create(),
      input = messageInput();
    failure = { code: "EAUTH", command: "AUTH PLAIN", responseCode: 535 };
    const failed = await addSupportMessage(row.id, "support-qa", input);
    assert.equal(failed.status, "failed");
    assert.equal(failed.deliveryErrorCode, "authentication_failed");
    assert(failed.mailMessageId);
    assert.equal(
      (await db.contactInquiry.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
      "open",
    );
    const attempts = sends;
    await addSupportMessage(row.id, "support-qa", input);
    assert.equal(sends, attempts, "Failed messages require an explicit retry");
    failure = null;
    const retried = await addSupportMessage(row.id, "support-qa", {
      ...input,
      retry: true,
    });
    assert.equal(retried.status, "sent");
    assert.equal(retried.id, failed.id);
    assert.equal(outbound.at(-1)?.messageId, failed.mailMessageId);
    await addSupportMessage(row.id, "support-qa", { ...input, retry: true });
    assert.equal(sends, attempts + 1);
    const note = await addSupportMessage(row.id, "support-qa", {
      kind: "note",
      body: "Internal only",
      idempotencyKey: randomUUID(),
    });
    assert.equal(note.status, "internal");
    assert.equal(sends, attempts + 1);
    failure = { code: "ETIMEDOUT", command: "DATA" };
    const ambiguousInput = messageInput();
    const unknown = await addSupportMessage(
      row.id,
      "support-qa",
      ambiguousInput,
    );
    assert.equal(unknown.status, "unknown");
    const before = sends;
    await addSupportMessage(row.id, "support-qa", {
      ...ambiguousInput,
      retry: true,
    });
    const otherKey = await addSupportMessage(row.id, "support-qa", {
      ...ambiguousInput,
      idempotencyKey: randomUUID(),
    });
    assert.equal(otherKey.id, unknown.id);
    assert.equal(
      sends,
      before,
      "Unknown deliveries cannot be retried by a new UUID",
    );
    failure = null;
    await assert.rejects(
      addSupportMessage(row.id, "support-qa", {
        ...ambiguousInput,
        retry: true,
        confirmedNotSent: true,
        resolutionNote: "short",
      }),
    );
    assert.equal(sends, before);
    const resolved = await addSupportMessage(row.id, "support-qa", {
      ...ambiguousInput,
      retry: true,
      confirmedNotSent: true,
      resolutionNote:
        "Operator checked the isolated provider fixture and confirmed rejection.",
    });
    assert.equal(resolved.status, "sent");
    assert.equal(sends, before + 1);
    assert.equal(
      await db.adminSupportMessage.count({
        where: {
          inquiryId: row.id,
          kind: "note",
          body: { contains: "Verified not sent:" },
        },
      }),
      1,
    );
    await assert.rejects(
      addSupportMessage(row.id, "other-actor", ambiguousInput),
      /different message/,
    );
    // An operator may explicitly accept duplicate risk without falsely asserting
    // provider verification. The consent is tied to exactly one saved attempt.
    failure = { code: "ETIMEDOUT", command: "DATA" };
    const riskInput = messageInput();
    const riskUnknown = await addSupportMessage(row.id, "support-qa", riskInput);
    const riskCount = sends;
    const consent = { ...riskInput, retry: true, acknowledgeDuplicateRisk: true,
      retryVersion: riskUnknown.updatedAt.toISOString() };
    const missingVersion = await replyRoute.POST(request({ ...consent, retryVersion: undefined }),
      { params: Promise.resolve({ inquiryId: row.id }) });
    assert.equal(missingVersion.status, 400);
    const conflictingIntent = await replyRoute.POST(request({ ...consent, confirmedNotSent: true,
      resolutionNote: "This is not provider verification." }),
      { params: Promise.resolve({ inquiryId: row.id }) });
    assert.equal(conflictingIntent.status, 400);
    await addSupportMessage(row.id, "support-qa", { ...riskInput, retry: true });
    await addSupportMessage(row.id, "support-qa", { ...consent, retryVersion: new Date(0).toISOString() });
    assert.equal(sends, riskCount, "No acknowledgement or stale acknowledgement cannot send");
    const riskResponse = await replyRoute.POST(request(consent),
      { params: Promise.resolve({ inquiryId: row.id }) });
    assert.equal(riskResponse.status, 200);
    const riskAgain = (await riskResponse.json()).message;
    assert.equal(riskAgain.status, "unknown");
    assert.equal(sends, riskCount + 1);
    await addSupportMessage(row.id, "support-qa", consent);
    assert.equal(sends, riskCount + 1, "Replaying old consent after another uncertain result cannot resend");
    const audit = await db.adminSupportMessage.findMany({ where: {
      inquiryId: row.id, kind: "note", body: { contains: `possible duplicate delivery: ${riskUnknown.id}` },
    } });
    assert.equal(audit.length, 1);
    assert(audit[0].body.includes("was not verified"));
    assert(!audit[0].body.includes("Verified not sent:"));
    assert.equal(audit[0].actorId, "support-qa");
    await assert.rejects(addSupportMessage(row.id, "other-actor", consent), /different message/);
    failure = null;
    await Promise.all(Array.from({ length: 6 }, () => addSupportMessage(row.id, "support-qa", {
      ...consent, retryVersion: riskAgain.updatedAt,
    })));
    assert.equal(sends, riskCount + 2, "Concurrent explicit retries claim one send");
    await addSupportMessage(row.id, "support-qa", { ...consent, retryVersion: riskAgain.updatedAt });
    assert.equal(sends, riskCount + 2, "Accepted mail cannot be replayed");
    const activeInput = messageInput();
    failure = { code: "ETIMEDOUT", command: "DATA" };
    const activeUnknown = await addSupportMessage(row.id, "support-qa", activeInput);
    const active = await db.adminSupportMessage.update({ where: { id: activeUnknown.id },
      data: { status: "sending" } });
    const activeCount = sends;
    await addSupportMessage(row.id, "support-qa", { ...activeInput, retry: true,
      acknowledgeDuplicateRisk: true, retryVersion: active.updatedAt.toISOString() });
    assert.equal(sends, activeCount, "Consent cannot interrupt an active send");
    const stale = await db.adminSupportMessage.update({ where: { id: active.id },
      data: { updatedAt: new Date(Date.now() - 6 * 60_000) } });
    failure = null;
    await addSupportMessage(row.id, "support-qa", { ...activeInput, retry: true,
      acknowledgeDuplicateRisk: true, retryVersion: stale.updatedAt.toISOString() });
    assert.equal(sends, activeCount + 1, "Stale interrupted sending can be retried with current consent");
    failure = { code: "ETIMEDOUT", command: "DATA" };
    const rejectionInput = messageInput();
    const rejectionUnknown = await addSupportMessage(row.id, "support-qa", rejectionInput);
    failure = { code: "EAUTH" };
    const rejectionConsent = { ...rejectionInput, retry: true, acknowledgeDuplicateRisk: true,
      retryVersion: rejectionUnknown.updatedAt.toISOString(), resolutionNote: "OK" };
    assert.equal((await addSupportMessage(row.id, "support-qa", rejectionConsent)).status, "failed");
    const rejectedCount = sends;
    await addSupportMessage(row.id, "support-qa", rejectionConsent);
    assert.equal(sends, rejectedCount, "Old consent cannot retry a newer definite failure");
    failure = null;
    const concurrent = messageInput();
    pause = true;
    const first = addSupportMessage(row.id, "support-qa", concurrent);
    for (let n = 0; n < 100 && !releaseSend; n++)
      await new Promise((r) => setTimeout(r, 10));
    assert(releaseSend);
    const second = await addSupportMessage(row.id, "support-qa", concurrent);
    assert.equal(second.status, "sending");
    releaseSend!();
    await first;
    pause = false;
    const raceInput = messageInput(),
      raceCount = sends;
    const races = await Promise.all([
      addSupportMessage(row.id, "support-qa", raceInput),
      addSupportMessage(row.id, "support-qa", raceInput),
    ]);
    assert.equal(races[0].id, races[1].id);
    assert.equal(
      sends,
      raceCount + 1,
      "Simultaneous creation of one request key sends once",
    );
    const ackInput = messageInput();
    const tx = db.$transaction.bind(db);
    let transactionCalls = 0;
    const beforeAcknowledgement = sends;
    (db as any).$transaction = async (work: any) => {
      if (++transactionCalls === 2) throw Error("Fixture DB acknowledgement failed");
      return tx(work);
    };
    await assert.rejects(
      addSupportMessage(row.id, "support-qa", ackInput),
      /acknowledgement/,
    );
    (db as any).$transaction = tx;
    assert.equal(sends, beforeAcknowledgement + 1, "Acknowledgement failure occurs after SMTP accepted the message");
    const ackCount = sends;
    assert.equal(
      (await addSupportMessage(row.id, "support-qa", ackInput)).status,
      "sending",
    );
    assert.equal(sends, ackCount);
    const legacy = await create();
    assert.equal(legacy.notificationStatus, "untracked");
    await dispatchContactNotifications();
    assert.equal(sends, ackCount, "Historical mail has no automatic backfill");
    const publicResponse = await contactRoute.POST(
      new Request("https://clover.ph/api/contact-us", {
        method: "POST",
        headers: {
          origin: "https://clover.ph",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "QA contact",
          email: "source@example.invalid",
          message: "Please retain this exact support message.",
        }),
      }),
    );
    assert.equal(publicResponse.status, 200);
    const publicBody = await publicResponse.json();
    ids.push(publicBody.inquiry.id);
    assert.equal(callbacks.length, 1);
    assert.equal(
      (
        await db.contactInquiry.findUniqueOrThrow({
          where: { id: publicBody.inquiry.id },
        })
      ).notificationStatus,
      "pending",
    );
    // The response callback is deliberately not run. Cron must recover the persisted outbox.
    await dispatchContactNotifications();
    const delivered = await db.contactInquiry.findUniqueOrThrow({
      where: { id: publicBody.inquiry.id },
    });
    assert.equal(delivered.notificationStatus, "sent");
    assert.equal(staff.at(-1)?.recipient, "hello@clover.ph");
    assert.equal(staff.at(-1)?.message, publicBody.inquiry.message);
    const staffCount = sends;
    await callbacks[0]();
    assert.equal(sends, staffCount);
    const attachment = {
      name: "proof.png",
      type: "image/png",
      size: 3,
      dataUrl: "data:image/png;base64,YWJj",
    };
    const pending = await createContactInquiry({
      name: "QA attachment",
      email: "qa@example.invalid",
      message: "Unchanged receipt context",
      attachment,
    });
    ids.push(pending.id);
    failure = { code: "EAUTH", command: "AUTH PLAIN", responseCode: 535 };
    const nf = await deliverContactNotification(pending.id);
    assert.equal(nf.notificationStatus, "failed");
    assert.equal(nf.notificationErrorCode, "authentication_failed");
    await db.contactInquiry.update({
      where: { id: pending.id },
      data: { notificationAttemptedAt: new Date(Date.now() - 2 * 60 * 60_000) },
    });
    failure = null;
    await dispatchContactNotifications();
    assert.deepEqual(staff.at(-1)?.attachment, attachment);
    const sent = await db.contactInquiry.findUniqueOrThrow({
      where: { id: pending.id },
    });
    assert.equal(sent.notificationStatus, "sent");
    assert.equal(sent.notificationAttempts, 2);
    const concurrentNotification = await create({
        notificationStatus: "pending",
      }),
      notificationCount = sends;
    await Promise.all([
      deliverContactNotification(concurrentNotification.id),
      deliverContactNotification(concurrentNotification.id),
    ]);
    assert.equal(
      sends,
      notificationCount + 1,
      "Concurrent notification claims send one copy",
    );
    const uncertain = await create({ notificationStatus: "pending" });
    failure = { code: "ETIMEDOUT", command: "DATA" };
    await deliverContactNotification(uncertain.id);
    failure = null;
    const unknownCount = sends;
    await dispatchContactNotifications();
    await deliverContactNotification(uncertain.id, true);
    assert.equal(sends, unknownCount);
    permission = "read_only";
    assert.equal(
      (
        await notificationRoute.POST(request({ retry: true }), {
          params: Promise.resolve({ inquiryId: legacy.id }),
        })
      ).status,
      403,
    );
    permission = "support";
    const deniedOrigin = await notificationRoute.POST(
      new Request("https://clover.ph/api/admin/fixture", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ retry: true }),
      }),
      { params: Promise.resolve({ inquiryId: legacy.id }) },
    );
    assert.equal(deniedOrigin.status, 400);
    permission = "read_only";
    assert.equal(
      (
        await replyRoute.POST(request(messageInput()), {
          params: Promise.resolve({ inquiryId: row.id }),
        })
      ).status,
      403,
    );
    permission = "support";
    const replyResponse = await replyRoute.POST(request(messageInput()), {
      params: Promise.resolve({ inquiryId: row.id }),
    });
    assert.equal(replyResponse.status, 200);
    assert.equal((await replyResponse.json()).message.status, "sent");
    const assignmentRecord = await db.adminSupportMessage.create({data:{
      inquiryId:row.id, actorId:"support-qa", kind:"assignment", status:"internal", idempotencyKey:randomUUID(),
      body:"Assignment: user_QAOtherStaff; priority: normal; snoozed until: Not snoozed",
    }});
    const historyResponse = await replyRoute.GET(new Request("https://clover.ph/api/admin/fixture/messages"),
      {params:Promise.resolve({inquiryId:row.id})});
    assert.equal(historyResponse.status,200);
    const history = (await historyResponse.json()).messages;
    assert(history.every((message:any)=>message.actorName==="Tim Tester"));
    assert.equal(history.find((message:any)=>message.id===assignmentRecord.id).displayBody,"Assigned to Tim Tester.");
    assert.equal((await db.adminSupportMessage.findUniqueOrThrow({where:{id:assignmentRecord.id}})).body,assignmentRecord.body);
    assert(history.some((message:any)=>message.idempotencyKey.startsWith("delivery-risk-retry:")&&message.displayBody==="Retry authorized; possible duplicate delivery acknowledged."));
    const queueRoute = await import("../app/api/admin/work-queue/route");
    const queueResponse = await queueRoute.GET(new Request(`https://clover.ph/api/admin/work-queue?query=%23${row.caseNumber}`));
    assert.equal(queueResponse.status,200);
    const queue = await queueResponse.json();
    assert.deepEqual(queue.items.map((item:any)=>item.id),[row.id]);
    assert.equal(queue.members.find((member:any)=>member.clerkUserId==="support-qa").displayName,"Tim Tester");
    const manual = await notificationRoute.POST(request({ retry: true }), {
      params: Promise.resolve({ inquiryId: legacy.id }),
    });
    assert.equal(manual.status, 200);
    assert.equal((await manual.json()).inquiry.notificationStatus, "sent");
    environment = "staging";
    const preview = await create({
      environment: "staging",
      notificationStatus: "pending",
    });
    const previewCount = sends;
    delete process.env.SUPPORT_MAIL_TEST_RECIPIENT;
    await deliverContactNotification(preview.id, true);
    assert.equal(sends, previewCount);
    process.env.SUPPORT_MAIL_TEST_RECIPIENT = "qa-inbox@example.invalid";
    await deliverContactNotification(preview.id);
    assert.equal(staff.at(-1)?.recipient, "qa-inbox@example.invalid");
    await assert.rejects(deliverContactNotification(row.id, true));
    assert.equal(
      (await db.contactInquiry.findUniqueOrThrow({ where: { id: row.id } }))
        .message,
      row.message,
    );
    assert.equal(network, 0);
    console.log(
      "PASS support delivery: actual public contact/Admin routes, SMTP rejection vs DATA uncertainty, explicit safe retry, same-key concurrency, new-key ambiguity guard, operator verification audit, post-accept DB failure, durable callback recovery, no legacy backfill, attachments, role/origin/environment controls and zero external mail.",
    );
  } finally {
    releaseSend?.();
    delete process.env.SUPPORT_MAIL_TEST_RECIPIENT;
    await db.contactInquiry.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
    for (const [id, entry] of saved) {
      if (entry) require.cache[id] = entry;
      else delete require.cache[id];
    }
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

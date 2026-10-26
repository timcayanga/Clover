import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
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
  "../lib/admin": {
    getAdminDataEnvironment: () => environment,
    requireAdminAuth: async () => {
      if (permission !== "support") throw Error("FORBIDDEN");
      return { userId: "support-qa" };
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
    (db as any).$transaction = async () => {
      throw Error("Fixture DB acknowledgement failed");
    };
    await assert.rejects(
      addSupportMessage(row.id, "support-qa", ackInput),
      /acknowledgement/,
    );
    (db as any).$transaction = tx;
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

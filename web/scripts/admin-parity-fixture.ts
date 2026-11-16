import * as plan from "../app/api/admin/users/[userId]/plan/route";
import * as conversation from "../app/api/admin/inquiries/[inquiryId]/messages/route";
import { getProAccess, refreshProAccess } from "../lib/pro-access";
import {
  previewAdminRetry,
  executeAdminRetry,
  claimAdminRetry,
} from "../lib/admin-import-retry";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { requireAdminAuth } from "../lib/admin";
import { setAdminMember } from "../lib/admin-members";
import {
  createApproval,
  reviewApproval,
  claimApproval,
  finishApproval,
} from "../lib/admin-approvals";
import * as notes from "../app/api/admin/support/[userId]/notes/route";
import * as wipe from "../app/api/admin/support/[userId]/wipe-data/route";
import { addSupportMessage } from "../lib/admin-support-messages";
import { getAdminContactInquiries } from "../lib/contact-inquiries";
import * as inquiryRoute from "../app/api/admin/inquiries/[inquiryId]/route";
import { randomUUID } from "node:crypto";
import * as restore from "../app/api/admin/support/[userId]/restore/route";
import * as users from "../app/api/admin/users/[userId]/route";
import * as approvals from "../app/api/admin/approvals/route";
const db = new URL(process.env.DATABASE_URL!);
if (
  !["127.0.0.1", "localhost"].includes(db.hostname) ||
  !db.pathname.endsWith("_qa")
)
  throw Error("Isolated local QA database required");
const identities = [
  "user_qaOwnerOne",
  "user_qaOwnerTwo",
  "user_qaAdmin",
  "user_qaSupport",
  "user_qaReadOnly",
];
const actor = (id: string) => {
  (globalThis as any).__adminFixtureIdentity = id;
};
const request = (method: string, body: unknown) =>
  new Request("https://staging.clover.ph/api/admin/fixture", {
    method,
    headers: {
      origin: "https://staging.clover.ph",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
let count = 0;
async function test(label: string, run: () => Promise<void>) {
  await run();
  console.log(`PASS ${label}`);
  count++;
}
async function main() {
  const target = await prisma.user.create({
    data: {
      clerkUserId: `admin-parity-target-${Date.now()}`,
      email: "admin-parity@example.invalid",
      environment: "production",
    },
  });
  const inquiry = await prisma.contactInquiry.create({
    data: {
      name: "Support fixture",
      email: "support-parity@example.invalid",
      message: "Isolated inquiry",
      environment: "production",
    },
  });
  const context = { params: Promise.resolve({ userId: target.id }) };
  const input = {
    action: "wipe",
    targetUserId: target.id,
    reason: "Isolated QA approval fixture",
    parameters: { reseedStarterWorkspace: false },
  };
  try {
    for (const [index, role] of [
      "owner",
      "owner",
      "admin",
      "support",
      "read_only",
    ].entries())
      await prisma.adminMember.upsert({
        where: { clerkUserId: identities[index] },
        create: { clerkUserId: identities[index], role },
        update: { role, active: true },
      });
    await test("Temporary Pro grants expire and revoke without changing billing", async () => {
      actor(identities[2]);
      const subscriptionBefore = await prisma.billingSubscription.findUnique({ where: { userId: target.id } });
      const startsAt = new Date(Date.now() - 60000).toISOString();
      const endsAt = new Date(Date.now() + 86400000).toISOString();
      const granted = await plan.POST(request("POST", { action: "grant", startsAt, endsAt, reason: "QA temporary entitlement" }), context);
      assert.equal(granted.status, 200);
      assert.equal((await getProAccess(target.id)).planTier, "pro");
      const grant = await prisma.proAccessGrant.findFirstOrThrow({ where: { userId: target.id } });
      await prisma.proAccessGrant.update({ where: { id: grant.id }, data: { startsAt: new Date(Date.now() - 120000), endsAt: new Date(Date.now() - 60000) } });
      await refreshProAccess(target.id);
      assert.equal((await getProAccess(target.id)).planTier, "free");
      await prisma.proAccessGrant.update({ where: { id: grant.id }, data: { endsAt: new Date(endsAt) } });
      const revoked = await plan.POST(request("POST", { action: "revoke", grantId: grant.id, reason: "QA revoke temporary access" }), context);
      assert.equal(revoked.status, 200);
      assert.equal((await getProAccess(target.id)).planTier, "free");
      assert.deepEqual(await prisma.billingSubscription.findUnique({ where: { userId: target.id } }), subscriptionBefore);
    });
    await test("Conversation shows newest messages and pages older history without gaps", async () => {
      actor(identities[4]);
      await prisma.adminSupportMessage.createMany({ data: Array.from({ length: 205 }, (_, i) => ({ inquiryId: inquiry.id, actorId: identities[3], kind: "note", body: `History ${i}`, status: "internal", idempotencyKey: randomUUID(), createdAt: new Date(1700000000000 + i) })) });
      const ctx = { params: Promise.resolve({ inquiryId: inquiry.id }) };
      const first = await conversation.GET(new Request("https://staging.clover.ph/api/admin/inquiries/fixture/messages"), ctx);
      assert.equal(first.status, 200);
      const newest = await first.json();
      assert.equal(newest.messages.length, 200);
      assert.equal(newest.messages.at(-1).body, "History 204");
      const older = await (await conversation.GET(new Request(`https://staging.clover.ph/api/admin/inquiries/fixture/messages?before=${newest.nextCursor}`), ctx)).json();
      assert.equal(older.messages.length, 5);
      assert.equal(older.nextCursor, null);
      assert.equal(new Set([...older.messages, ...newest.messages].map((m) => m.id)).size, 205);
      await prisma.adminSupportMessage.deleteMany({ where: { inquiryId: inquiry.id } });
    });
    await test("Read-only can read but cannot edit users or add support notes", async () => {
      actor(identities[4]);
      assert.equal((await requireAdminAuth()).role, "read_only");
      assert.equal(
        (await users.PATCH(request("PATCH", { firstName: "Denied" }), context))
          .status,
        403,
      );
      assert.equal(
        (await notes.POST(request("POST", { body: "Denied note" }), context))
          .status,
        403,
      );
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: target.id } }))
          .firstName,
        null,
      );
    });
    await test("Support can add notes but cannot manage grants or staff", async () => {
      actor(identities[3]);
      assert.equal(
        (
          await notes.POST(
            request("POST", { body: "Isolated QA internal note" }),
            context,
          )
        ).status,
        200,
      );
      await assert.rejects(requireAdminAuth("entitlements"), /FORBIDDEN/);
      await assert.rejects(requireAdminAuth("manage_staff"), /FORBIDDEN/);
    });
    await test("Admin cannot execute or approve destructive actions", async () => {
      actor(identities[2]);
      assert.equal(
        (await wipe.POST(request("POST", { confirmation: "WIPE" }), context))
          .status,
        403,
      );
      assert.equal((await approvals.POST(request("POST", input))).status, 403);
    });
    await test("Owner cannot bypass approval through legacy wipe endpoint", async () => {
      actor(identities[0]);
      const r = await wipe.POST(
        request("POST", { confirmation: "WIPE" }),
        context,
      );
      assert.equal(r.status, 400);
      assert.match((await r.json()).error, /different Owner/);
      assert.ok(await prisma.user.findUnique({ where: { id: target.id } }));
    });
    await test("Owner cannot change their own role", async () => {
      await assert.rejects(
        setAdminMember(identities[0], identities[0], "read_only", false),
        /another Owner/,
      );
    });
    await test("Self-approval, different target, parameter changes and reuse are rejected", async () => {
      const item = await createApproval(identities[0], input);
      await assert.rejects(
        reviewApproval(item.id, identities[0], true),
        /different Owner/,
      );
      await reviewApproval(item.id, identities[1], true);
      await assert.rejects(
        claimApproval(
          item.id,
          identities[0],
          "foreign",
          "wipe",
          input.parameters,
        ),
        /unavailable/,
      );
      await assert.rejects(
        claimApproval(item.id, identities[0], target.id, "wipe", {
          reseedStarterWorkspace: true,
        }),
        /parameters/,
      );
      await claimApproval(
        item.id,
        identities[0],
        target.id,
        "wipe",
        input.parameters,
      );
      await assert.rejects(
        claimApproval(
          item.id,
          identities[0],
          target.id,
          "wipe",
          input.parameters,
        ),
        /unavailable/,
      );
      await finishApproval(item.id, true, { fixtureOnly: true });
    });
    await test("Changed data invalidates the approved preview", async () => {
      const item = await createApproval(identities[0], input);
      await reviewApproval(item.id, identities[1], true);
      await prisma.workspace.create({
        data: { userId: target.id, name: "New data", type: "personal" },
      });
      await assert.rejects(
        claimApproval(
          item.id,
          identities[0],
          target.id,
          "wipe",
          input.parameters,
        ),
        /data changed/,
      );
    });
    await test("Expired approvals and revoked reviewers cannot execute", async () => {
      const expired = await createApproval(identities[0], input);
      await prisma.adminApproval.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(0) },
      });
      await assert.rejects(
        reviewApproval(expired.id, identities[1], true),
        /unexpired/,
      );
      const item = await createApproval(identities[0], input);
      await reviewApproval(item.id, identities[1], true);
      await prisma.adminMember.update({
        where: { clerkUserId: identities[1] },
        data: { active: false },
      });
      await assert.rejects(
        claimApproval(
          item.id,
          identities[0],
          target.id,
          "wipe",
          input.parameters,
        ),
        /no longer/,
      );
    });
    await test("Approved wipe and restore execute once and record recovery snapshots", async () => {
      await prisma.adminMember.update({
        where: { clerkUserId: identities[1] },
        data: { active: true },
      });
      actor(identities[0]);
      const item = await createApproval(identities[0], input);
      await reviewApproval(item.id, identities[1], true);
      const wiped = await wipe.POST(
        request("POST", {
          confirmation: "WIPE",
          reseedStarterWorkspace: false,
          approvalId: item.id,
        }),
        context,
      );
      assert.equal(
        wiped.status,
        200,
        JSON.stringify(await wiped.clone().json()),
      );
      const snapshotId = (await wiped.json()).snapshotId;
      assert.equal(
        await prisma.workspace.count({ where: { userId: target.id } }),
        0,
      );
      assert.equal(
        (
          await prisma.adminApproval.findUniqueOrThrow({
            where: { id: item.id },
          })
        ).status,
        "completed",
      );
      const recovery = await createApproval(identities[0], {
        action: "restore",
        targetUserId: target.id,
        reason: "Restore isolated fixture data",
        parameters: { snapshotId },
      });
      await reviewApproval(recovery.id, identities[1], true);
      const restored = await restore.POST(
        request("POST", {
          confirmation: "RESTORE",
          snapshotId,
          approvalId: recovery.id,
        }),
        context,
      );
      assert.equal(
        restored.status,
        200,
        JSON.stringify(await restored.clone().json()),
      );
      assert.equal(
        await prisma.workspace.count({ where: { userId: target.id } }),
        1,
      );
      const replay = await restore.POST(
        request("POST", {
          confirmation: "RESTORE",
          snapshotId,
          approvalId: recovery.id,
        }),
        context,
      );
      assert.equal(replay.status, 409);
    });
    await test("Saving reply drafts does not mark an inquiry as responded", async () => {
      actor(identities[3]);
      const r = await inquiryRoute.PATCH(
        request("PATCH", {
          adminReplySubject: "Draft",
          adminReplyBody: "Not sent",
        }),
        { params: Promise.resolve({ inquiryId: inquiry.id }) },
      );
      assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
      const saved = await prisma.contactInquiry.findUniqueOrThrow({
        where: { id: inquiry.id },
      });
      assert.equal(saved.status, "open");
      assert.equal(saved.adminReplyAt, null);
    });
    await test("Assignment, priority and snooze persist and affect work queue", async () => {
      actor(identities[3]);
      const r = await inquiryRoute.PATCH(
        request("PATCH", {
          assignedTo: identities[3],
          priority: "high",
          snoozedUntil: new Date(Date.now() + 86400000).toISOString(),
        }),
        { params: Promise.resolve({ inquiryId: inquiry.id }) },
      );
      assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
      const mine = await getAdminContactInquiries({
        queue: "mine",
        actorId: identities[3],
        query: "support-parity@example.invalid",
      });
      assert.equal(mine.items[0].priority, "high");
      assert.equal(
        (
          await getAdminContactInquiries({
            queue: "open",
            query: "support-parity@example.invalid",
          })
        ).total,
        0,
      );
      const denied = await inquiryRoute.PATCH(
        request("PATCH", { assignedTo: identities[4] }),
        { params: Promise.resolve({ inquiryId: inquiry.id }) },
      );
      assert.equal(denied.status, 400);
    });
    await test("Internal notes never send mail; replies send once per request key", async () => {
      const note = await addSupportMessage(inquiry.id, identities[3], {
        kind: "note",
        body: "Private fixture note",
        idempotencyKey: randomUUID(),
      });
      assert.equal(note.status, "internal");
      assert.equal((globalThis as any).__fixtureMailCount, 0);
      const input = {
        kind: "reply",
        subject: "Fixture reply",
        body: "Explicit fixture reply",
        idempotencyKey: randomUUID(),
      };
      const first = await addSupportMessage(inquiry.id, identities[3], input);
      const second = await addSupportMessage(inquiry.id, identities[3], input);
      assert.equal(first.id, second.id);
      assert.equal(first.status, "sent");
      assert.equal((globalThis as any).__fixtureMailCount, 1);
      await assert.rejects(
        addSupportMessage(inquiry.id, identities[3], {
          ...input,
          body: "Different",
        }),
        /different message/,
      );
    });
    await test("SMTP uncertainty is retained and never automatically resent", async () => {
      (globalThis as any).__fixtureMailFails = true;
      const input = {
        kind: "reply",
        subject: "Timeout fixture",
        body: "Uncertain fixture reply",
        idempotencyKey: randomUUID(),
      };
      const result = await addSupportMessage(inquiry.id, identities[3], input);
      assert.equal(result.status, "unknown");
      await addSupportMessage(inquiry.id, identities[3], input);
      assert.equal((globalThis as any).__fixtureMailCount, 2);
    });
    await test("Bulk retry preview skips confirmed files; execution is actor-bound and one-use", async () => {
      const workspace = await prisma.workspace.findFirstOrThrow({
        where: { userId: target.id },
      });
      const files = await Promise.all(
        [0, 1].map((i) =>
          prisma.importFile.create({
            data: {
              workspaceId: workspace.id,
              fileName: `retry-${i}.csv`,
              fileType: "text/csv",
              storageKey: "fixture-never-read",
              status: "failed",
              confirmedTransactionsCount: i,
            },
          }),
        ),
      );
      const preview = await previewAdminRetry(identities[0], {
        ids: files.map((f) => f.id),
        reason: "Isolated safe retry fixture",
      });
      assert.equal(preview.items[0].problem, null);
      assert.match(preview.items[1].problem!, /Financial records/);
      let queued = 0;
      const queue = {
        getWorkers: async () => [{}],
        getJob: async () => null,
        add: async () => {
          queued++;
        },
      };
      await assert.rejects(
        executeAdminRetry(
          identities[1],
          preview.previewId,
          (() => queue) as any,
        ),
        /expired/,
      );
      const result = await executeAdminRetry(
        identities[0],
        preview.previewId,
        (() => queue) as any,
      );
      assert.deepEqual(
        result.results.map((r) => r.status),
        ["queued", "skipped"],
      );
      assert.equal(queued, 1);
      await assert.rejects(
        executeAdminRetry(
          identities[0],
          preview.previewId,
          (() => queue) as any,
        ),
        /used/,
      );
      assert.equal(
        await claimAdminRetry(files[1].id, files[1].updatedAt.toISOString()),
        false,
      );
      assert.equal(
        await claimAdminRetry(files[0].id, files[0].updatedAt.toISOString()),
        true,
      );
      assert.equal(
        await claimAdminRetry(files[0].id, files[0].updatedAt.toISOString()),
        false,
      );
    });
    await test("Bulk retry rejects stale previews, offline workers and files changed after preview", async () => {
      const workspace = await prisma.workspace.findFirstOrThrow({
        where: { userId: target.id },
      });
      const file = await prisma.importFile.create({
        data: {
          workspaceId: workspace.id,
          fileName: "offline.csv",
          fileType: "text/csv",
          storageKey: "fixture-never-read",
          status: "failed",
        },
      });
      const input = {
        ids: [file.id],
        reason: "Isolated retry failure fixture",
      };
      const offline = await previewAdminRetry(identities[0], input);
      const result = await executeAdminRetry(
        identities[0],
        offline.previewId,
        (() => ({ getWorkers: async () => [] })) as any,
      );
      assert.equal(result.results[0].status, "failed");
      assert.match(result.results[0].detail, /offline/);
      assert.equal(
        (await prisma.importFile.findUniqueOrThrow({ where: { id: file.id } }))
          .status,
        "failed",
      );
      const changed = await previewAdminRetry(identities[0], input);
      await prisma.importFile.update({
        where: { id: file.id },
        data: { status: "done" },
      });
      const conflict = await executeAdminRetry(
        identities[0],
        changed.previewId,
        (() => {
          throw Error("Must not queue");
        }) as any,
      );
      assert.equal(conflict.results[0].status, "skipped");
      const expired = await previewAdminRetry(identities[0], input);
      await prisma.adminSupportAction.update({
        where: { id: expired.previewId },
        data: { createdAt: new Date(0) },
      });
      await assert.rejects(
        executeAdminRetry(identities[0], expired.previewId),
        /expired/,
      );
    });
    console.log(
      `${count}/${count} Admin permission and approval checks passed.`,
    );
  } finally {
    await prisma.contactInquiry.delete({ where: { id: inquiry.id } });
    await prisma.adminApproval.deleteMany({
      where: { targetUserId: target.id },
    });
    await prisma.adminPermissionAudit.deleteMany({
      where: { actorId: { in: identities } },
    });
    await prisma.adminMember.deleteMany({
      where: { clerkUserId: { in: identities } },
    });
    await prisma.adminSupportAction.deleteMany({
      where: {
        actorUserId: { in: identities },
        action: { startsWith: "bulk_retry_" },
      },
    });
    await prisma.user.delete({ where: { id: target.id } });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

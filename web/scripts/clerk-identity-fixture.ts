import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../lib/prisma";
import {
  syncClerkIdentity,
  deleteClerkIdentity,
  reconcileClerkUsers,
  assertClerkIdentityEnvironment,
} from "../lib/clerk-identity-lifecycle";
import { getOrCreateCurrentUser } from "../lib/user-context";
import { createApproval, reviewApproval } from "../lib/admin-approvals";
import { POST as createUser } from "../app/api/admin/users/route";
import { DELETE as deleteUser } from "../app/api/admin/users/[userId]/identity/route";
import { POST as webhook } from "../app/api/webhooks/clerk/route";
const g = globalThis as any;
let passed = 0;
const pass = (label: string) => {
  passed++;
  console.log(`PASS ${passed}: ${label}`);
};
const id = "user_qaIdentitySync";
const source = {
  id,
  firstName: "Before",
  lastName: "Fixture",
  primaryEmailAddressId: "primary",
  emailAddresses: [
    {
      id: "secondary",
      emailAddress: "qa-identity-secondary@example.invalid",
      verification: { status: "verified" },
    },
    {
      id: "primary",
      emailAddress: "qa-identity-primary@example.invalid",
      verification: { status: "unverified" },
    },
  ],
};
const req = (body: unknown) =>
  new Request("https://staging.clover.ph/api/admin/users", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://staging.clover.ph",
    },
    body: JSON.stringify(body),
  });
async function signed(type: string, data: unknown) {
  const body = JSON.stringify({
    type,
    data,
    object: "event",
    timestamp: Date.now(),
  });
  const stamp = String(Math.floor(Date.now() / 1000));
  const msg = "msg_fixture";
  const secret = Buffer.from("disposable-webhook-fixture-key");
  process.env.CLERK_WEBHOOK_SIGNING_SECRET =
    "whsec_" + secret.toString("base64");
  const sig = createHmac("sha256", secret)
    .update(`${msg}.${stamp}.${body}`)
    .digest("base64");
  return webhook(
    new NextRequest("https://staging.clover.ph/api/webhooks/clerk", {
      method: "POST",
      body,
      headers: {
        "svix-id": msg,
        "svix-timestamp": stamp,
        "svix-signature": `v1,${sig}`,
      },
    }),
  );
}
const ids = [id, "user_qaIdentityCreated", "user_qaIdentityConflict"];
async function main() {
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "CloverDeploymentEnvironment" (id TEXT PRIMARY KEY, environment TEXT NOT NULL, "updatedAt" TIMESTAMP NOT NULL)',
  );
  const previous = await prisma.$queryRaw<
    { environment: string }[]
  >`SELECT environment FROM "CloverDeploymentEnvironment" WHERE id='primary'`;
  try {
    await prisma.$executeRaw`INSERT INTO "CloverDeploymentEnvironment" (id,environment,"updatedAt") VALUES ('primary','staging',CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET environment='staging'`;
    for (const member of ["user_qaIdentityOwner", "user_qaIdentityReviewer"])
      await prisma.adminMember.upsert({
        where: { clerkUserId: member },
        update: { role: "owner", active: true },
        create: { clerkUserId: member, role: "owner", active: true },
      });
    g.__identityUsers.set(id, source);
    const u = (await syncClerkIdentity(id))!;
    assert.equal(u.environment, "staging");
    assert.equal(u.planTier, "free");
    assert.equal(u.onboardingCompletedAt, null);
    pass("Clerk-only user is available before first login with Free defaults");
    assert.equal(u.email, source.emailAddresses[1].emailAddress);
    assert.equal(u.verified, false);
    pass("Primary email and its verification status are authoritative");
    assert.equal((await syncClerkIdentity(id))?.id, u.id);
    pass("Repeated sync does not duplicate the user");
    await prisma.user.update({
      where: { id: u.id },
      data: { planTier: "pro", planTierLocked: true },
    });
    source.firstName = "After";
    assert.equal((await syncClerkIdentity(id))?.firstName, "After");
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).planTier,
      "pro",
    );
    pass("Profile sync preserves entitlement overrides");
    assert.equal(
      (await signed("user.updated", { ...source, first_name: "Stale" })).status,
      200,
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).firstName,
      "After",
    );
    pass("Delayed webhook reads fresh provider state");
    assert.equal(
      (
        await webhook(
          new NextRequest("https://staging.clover.ph/api/webhooks/clerk", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
      400,
    );
    pass("Unsigned webhook rejected");
    assert.equal((await signed("user.deleted", { id })).status, 503);
    assert.ok(await prisma.user.findUnique({ where: { id: u.id } }));
    pass("Wrong/stale deletion cannot erase a provider user that still exists");
    process.env.CLERK_SECRET_KEY = "sk_live_wrong";
    await assert.rejects(assertClerkIdentityEnvironment);
    process.env.CLERK_SECRET_KEY = "sk_test_disposable_fixture";
    pass("Production credentials rejected on staging");
    await prisma.user.update({
      where: { id: u.id },
      data: { environment: "production" },
    });
    await assert.rejects(() => syncClerkIdentity(id));
    await assert.rejects(() => deleteClerkIdentity(id));
    await prisma.user.update({
      where: { id: u.id },
      data: { environment: "staging" },
    });
    pass("Cross-environment synchronization and deletion fail closed");
    g.__identityUsers.set("user_qaIdentityConflict", {
      ...source,
      id: "user_qaIdentityConflict",
    });
    await assert.rejects(() => syncClerkIdentity("user_qaIdentityConflict"));
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: u.id } }))
        .clerkUserId,
      id,
    );
    g.__identityUsers.delete("user_qaIdentityConflict");
    pass("Duplicate email never reassigns financial identity");
    const create = {
      email: "qa-identity-created@example.invalid",
      firstName: "Created",
      lastName: "Fixture",
      requestId: "5331fbdc-8277-4a10-8564-34d07c7e3e87",
    };
    assert.equal((await createUser(req(create))).status, 201);
    assert.equal((await createUser(req(create))).status, 201);
    assert.equal(g.__identityCreateCount, 1);
    pass("Admin creation synchronizes both systems and retries idempotently");
    await prisma.adminMember.update({
      where: { clerkUserId: g.__identityActor },
      data: { role: "read_only" },
    });
    assert.equal((await createUser(req(create))).status, 403);
    await prisma.adminMember.update({
      where: { clerkUserId: g.__identityActor },
      data: { role: "owner" },
    });
    pass("Read-only staff cannot create users");
    const workspace = await prisma.workspace.create({
      data: { userId: u.id, name: "Identity fixture" },
    });
    const account = await prisma.account.create({
      data: { workspaceId: workspace.id, name: "Fixture cash", type: "cash" },
    });
    const transaction = await prisma.transaction.create({
      data: {
        workspaceId: workspace.id,
        accountId: account.id,
        date: new Date(),
        amount: "123.45",
        type: "expense",
        merchantRaw: "Confirmed fixture",
        reviewStatus: "confirmed",
        rawPayload: { source: "raw fixture" },
      },
    });
    const before = await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
    });
    await syncClerkIdentity(id);
    assert.deepEqual(
      await prisma.transaction.findUniqueOrThrow({
        where: { id: transaction.id },
      }),
      before,
    );
    pass("Identity sync preserves confirmed financial records exactly");
    const file = await prisma.importFile.create({
      data: {
        workspaceId: workspace.id,
        fileName: "fixture.csv",
        fileType: "text/csv",
        storageKey: "identity-fixture",
        status: "failed",
      },
    });
    await prisma.importFile.create({ data: { workspaceId: workspace.id, fileName: "second.csv", fileType: "text/csv", storageKey: "identity-fixture-second", status: "failed" } });
    await prisma.adminDataSnapshot.create({
      data: {
        targetUserId: u.id,
        targetClerkUserId: id,
        payload: { financial: "fixture" },
        createdBy: "fixture",
      },
    });
    const otherUser = await prisma.user.findUniqueOrThrow({
      where: { clerkUserId: "user_qaIdentityCreated" },
    });
    const shared = await prisma.circle.create({
      data: {
        ownerUserId: u.id,
        name: "Shared deletion guard fixture",
        memberships: {
          create: { userId: otherUser.id, displayName: "Other user" },
        },
      },
    });
    await assert.rejects(() => deleteClerkIdentity(id), /Transfer ownership/);
    assert.ok(g.__identityUsers.has(id));
    assert.equal(
      await prisma.clerkIdentityDeletion.findUnique({
        where: { clerkUserId: id },
      }),
      null,
    );
    await prisma.circle.delete({ where: { id: shared.id } });
    pass(
      "Other members' shared Circle data blocks deletion before provider removal",
    );
    const otherCircle = await prisma.circle.create({
      data: {
        ownerUserId: otherUser.id,
        name: "Other user's Circle",
        memberships: {
          create: { userId: u.id, displayName: "Departing user" },
        },
      },
    });
    const contribution = await prisma.circleContribution.create({
      data: {
        circleId: otherCircle.id,
        contributedByUserId: u.id,
        sourceTransactionId: transaction.id,
        amount: "123.45",
      },
    });
    const noApproval = await deleteUser(
      req({ confirmation: "DELETE USER", approvalId: "missing" }),
      { params: Promise.resolve({ userId: u.id }) },
    );
    assert.equal(noApproval.status, 400);
    assert.ok(g.__identityUsers.has(id));
    pass("Admin deletion requires an approved request");
    const approval = await createApproval(g.__identityActor, {
      action: "delete_identity",
      targetUserId: u.id,
      reason: "Fixture permanent user deletion",
      parameters: {},
    });
    await assert.rejects(() =>
      reviewApproval(approval.id, g.__identityActor, true),
    );
    await reviewApproval(approval.id, "user_qaIdentityReviewer", true);
    pass("A different Owner must approve identity erasure");
    g.__identityStorageFails = true;
    const failed = await deleteUser(
      req({ confirmation: "DELETE USER", approvalId: approval.id }),
      { params: Promise.resolve({ userId: u.id }) },
    );
    assert.equal(failed.status, 400);
    assert.ok(
      await prisma.clerkIdentityDeletion.findUnique({
        where: { clerkUserId: id },
      }),
    );
    assert.ok(await prisma.user.findUnique({ where: { id: u.id } }));
    pass(
      "Storage failure retains a resumable deletion tombstone and local records",
    );
    g.__identityUsers.set(id, source);
    assert.equal(await syncClerkIdentity(id), null);
    await assert.rejects(() => getOrCreateCurrentUser(id));
    g.__identityUsers.delete(id);
    pass("A stale event or cached login cannot resurrect a pending deletion");
    g.__identityStorageFails = false;
    assert.equal((await signed("user.deleted", { id })).status, 200);
    assert.equal(await prisma.user.findUnique({ where: { id: u.id } }), null);
    assert.equal(
      await prisma.importFile.findUnique({ where: { id: file.id } }),
      null,
    );
    assert.equal(
      await prisma.adminDataSnapshot.count({
        where: { targetClerkUserId: id },
      }),
      0,
    );
    assert.ok(g.__identityFiles.includes("identity-fixture"));
    assert.equal(g.__identityFiles.filter((key: string) => key === "identity-fixture").length, 1);
    assert.ok(g.__identityFiles.includes("identity-fixture-second"));
    assert.equal(
      await prisma.transaction.findUnique({ where: { id: transaction.id } }),
      null,
    );
    assert.equal(
      await prisma.account.findUnique({ where: { id: account.id } }),
      null,
    );
    assert.equal(
      await prisma.circleContribution.findUnique({
        where: { id: contribution.id },
      }),
      null,
    );
    assert.ok(
      await prisma.circle.findUnique({ where: { id: otherCircle.id } }),
    );
    pass(
      "Erasure removes the user's shared contribution without deleting another user's Circle",
    );
    pass(
      "Retry permanently removes Clover account, imported data, stored file and recovery snapshot",
    );
    assert.equal((await signed("user.deleted", { id })).status, 200);
    assert.ok(
      (
        await prisma.clerkIdentityDeletion.findUniqueOrThrow({
          where: { clerkUserId: id },
        })
      ).completedAt,
    );
    pass("Duplicate deletion deliveries are harmless");
    const result = await reconcileClerkUsers();
    assert.equal(result.errors.length, 0);
    pass("Manual backfill completes without duplicate users");
    const created = await prisma.user.findUniqueOrThrow({
      where: { clerkUserId: "user_qaIdentityCreated" },
    });
    const approved = await createApproval(g.__identityActor, {
      action: "delete_identity",
      targetUserId: created.id,
      reason: "Approved fixture permanent deletion",
      parameters: {},
    });
    await reviewApproval(approved.id, "user_qaIdentityReviewer", true);
    assert.equal(
      (
        await deleteUser(
          req({ confirmation: "DELETE USER", approvalId: approved.id }),
          { params: Promise.resolve({ userId: created.id }) },
        )
      ).status,
      200,
    );
    assert.equal(g.__identityUsers.has(created.clerkUserId), false);
    assert.equal(
      await prisma.user.findUnique({ where: { id: created.id } }),
      null,
    );
    pass("Approved Admin deletion completes in both Clerk and Clover");
    console.log(`${passed} identity lifecycle checks passed.`);
  } finally {
    await prisma.adminApproval.deleteMany({
      where: { requesterId: "user_qaIdentityOwner" },
    });
    await prisma.adminSupportAction.deleteMany({
      where: { actorUserId: "user_qaIdentityOwner" },
    });
    await prisma.adminDataSnapshot.deleteMany({
      where: { targetClerkUserId: { in: ids } },
    });
    await prisma.user.deleteMany({ where: { clerkUserId: { in: ids } } });
    await prisma.clerkIdentityDeletion.deleteMany({
      where: { clerkUserId: { in: ids } },
    });
    await prisma.adminMember.deleteMany({
      where: {
        clerkUserId: {
          in: ["user_qaIdentityOwner", "user_qaIdentityReviewer"],
        },
      },
    });
    if (previous[0])
      await prisma.$executeRaw`UPDATE "CloverDeploymentEnvironment" SET environment=${previous[0].environment} WHERE id='primary'`;
    else
      await prisma.$executeRaw`DELETE FROM "CloverDeploymentEnvironment" WHERE id='primary'`;
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

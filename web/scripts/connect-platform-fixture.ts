import { notificationAllowed } from "../../shared/app-preferences";
import { canLearnFromWorkspace } from "../lib/app-preferences";
import { parseSnapshotCsv, snapshotHtml } from "../../mobile/src/snapshot-html";
import { notificationDestination } from "../../mobile/src/notification-destination";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import * as mobile from "../app/api/mobile/v1/[...path]/route";
const db = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  !["127.0.0.1", "localhost"].includes(db.hostname) ||
  !db.pathname.endsWith("_qa")
)
  throw Error("Use an isolated local QA database");
let count = 0;
async function test(name: string, run: () => Promise<void>) {
  await run();
  count++;
  console.log(`PASS ${name}`);
}
const call = async (
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  workspaceId = "",
  token = "connect-fixture-token",
) => {
  const response = await mobile[method](
    new Request(
      `https://staging.clover.ph/api/mobile/v1/${path}?workspaceId=${workspaceId}`,
      {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    ),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
  return { status: response.status, data: await response.json() };
};
async function main() {
  await prisma.user.deleteMany({
    where: { clerkUserId: "connect-fixture-user" },
  });
  try {
    await test("Unauthenticated setup and Settings are rejected", async () => {
      for (const path of ["bootstrap", "settings/account", "settings/regional"])
        assert.equal(
          (await call("GET", path, undefined, "", "bad")).status,
          401,
        );
    });
    await test("New verified session receives onboarding without financial data", async () => {
      const r = await call("GET", "bootstrap");
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.needsOnboarding, true);
      assert.deepEqual(r.data.profiles, []);
      assert.ok(
        r.data.currencyChoices.some(
          (c: any) => c.code === "PHP" && c.name === "Philippine Peso",
        ),
      );
    });
    await test("Invalid setup currency rejected before account creation", async () => {
      assert.equal(
        (
          await call("POST", "onboarding", {
            experience: "beginner",
            currency: "XXX",
          })
        ).status,
        400,
      );
      assert.equal(
        await prisma.user.count({
          where: { clerkUserId: "connect-fixture-user" },
        }),
        0,
      );
    });
    await test("Native setup creates starter Profile with chosen currency", async () => {
      const r = await call("POST", "onboarding", {
        experience: "beginner",
        currency: "USD",
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.deepEqual(r.data, { completed: true });
      const user = await prisma.user.findUniqueOrThrow({
        where: { clerkUserId: "connect-fixture-user" },
        include: { workspaces: { include: { accounts: true } } },
      });
      assert.ok(user.onboardingCompletedAt);
      assert.equal(user.workspaces.length, 1);
      assert.equal(user.workspaces[0].accounts[0].currency, "USD");
    });
    const bootstrap = await call("GET", "bootstrap"),
      w = bootstrap.data.profiles[0].id;
    await test("Completed setup replay preserves starter currency", async () => {
      assert.equal(
        (
          await call("POST", "onboarding", {
            experience: "advanced",
            currency: "PHP",
          })
        ).status,
        200,
      );
      assert.equal(
        (await prisma.account.findFirstOrThrow({ where: { workspaceId: w } }))
          .currency,
        "USD",
      );
    });
    await test("Settings response omits internal identity and billing fields", async () => {
      const r = await call("GET", "settings/account");
      assert.equal(r.status, 200);
      assert.deepEqual(Object.keys(r.data).sort(), [
        "email",
        "firstName",
        "lastName",
      ]);
    });
    await test("Profile edits reject plan, email and foreign user injection", async () => {
      for (const extra of [
        { planTier: "pro" },
        { email: "attacker@example.invalid" },
        { id: "foreign" },
      ])
        assert.equal(
          (
            await call("PATCH", "settings/account", {
              firstName: "Connect",
              lastName: "QA",
              ...extra,
            })
          ).status,
          400,
        );
    });
    await test("Account name saves to authenticated identity only", async () => {
      const r = await call("PATCH", "settings/account", {
        firstName: "Updated",
        lastName: "Fixture",
      });
      assert.equal(r.status, 200);
      assert.equal(r.data.firstName, "Updated");
      const fresh = await call("GET", "settings/account");
      assert.equal(
        fresh.data.firstName,
        "Updated",
        "A later identity sync must preserve the edited name",
      );
    });
    await test("Regional preferences save without changing account currency", async () => {
      const result = await call("PATCH", "settings/regional", {
        baseCurrency: "PHP",
        dateFormat: "DD/MM/YYYY",
        numberFormat: "1,234.56",
        timeZone: "Asia/Manila",
        locale: "en-PH",
        countryCode: "PH",
      });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      const fresh = await call("GET", "settings/regional");
      assert.deepEqual(Object.keys(fresh.data), ["regionalPreferences"]);
      assert.equal(fresh.data.regionalPreferences.baseCurrency, "PHP");
      assert.equal(fresh.data.regionalPreferences.dateFormat, "DD/MM/YYYY");
      assert.equal(
        (await prisma.account.findFirstOrThrow({ where: { workspaceId: w } }))
          .currency,
        "USD",
      );
      assert.equal(
        (await call("GET", "settings/account")).data.firstName,
        "Updated",
      );
    });
    await test("Native Profiles list marks original Personal as required", async () => {
      const r = await call("GET", "settings/profiles");
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.profiles[0].required, true);
      assert.deepEqual(Object.keys(r.data.profiles[0]).sort(), ["id", "name", "required"]);
    });
    await test("Original Personal Profile cannot be deleted", async () => {
      assert.notEqual((await call("DELETE", `settings/profiles/${w}`)).status, 200);
      assert.ok(await prisma.workspace.findUnique({ where: { id: w } }));
    });
    await test("Native Profile creates, renames and safely deletes an empty Profile", async () => {
      const r = await call("POST", "settings/profiles", { name: "Travel QA" });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const id = r.data.profile.id;
      assert.deepEqual(Object.keys(r.data.profile).sort(), ["id", "name"]);
      const renamed = await call("PATCH", `settings/profiles/${id}`, { name: "Travel renamed" });
      assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
      assert.equal((await prisma.workspace.findUniqueOrThrow({ where: { id } })).name, "Travel renamed");
      const deleted = await call("DELETE", `settings/profiles/${id}`);
      assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
      assert.equal(await prisma.workspace.findUnique({ where: { id } }), null);
    });
    await test("Empty Profile removal protects cash balances and planning data", async () => {
      const created = await call("POST", "settings/profiles", { name: "Protected QA" });
      assert.equal(created.status, 200); const id = created.data.profile.id;
      await prisma.account.updateMany({ where: { workspaceId: id }, data: { balance: 125 } });
      assert.equal((await call("DELETE", `settings/profiles/${id}`)).status, 400);
      assert.equal(Number((await prisma.account.findFirstOrThrow({ where: { workspaceId: id } })).balance), 125);
      await prisma.account.updateMany({ where: { workspaceId: id }, data: { balance: 0 } });
      await prisma.budgetPlan.create({ data: { workspaceId: id, name: "Protected plan" } });
      assert.equal((await call("DELETE", `settings/profiles/${id}`)).status, 400);
      await prisma.workspace.delete({ where: { id } });
    });
    await test("Preferences persist partially and reject foreign Profiles and disabling review", async () => {
      const read = await call("GET", "settings/preferences"); assert.equal(read.status, 200);
      assert.equal(read.data.preferences.review.reviewLowConfidence, true);
      assert.equal((await call("PATCH", "settings/preferences", { review: { reviewLowConfidence: false } })).status, 400);
      assert.notEqual((await call("PATCH", "settings/preferences", { defaults: { defaultImportProfileId: "foreign-profile" } })).status, 200);
      assert.equal((await call("PATCH", "settings/preferences", { defaults: { defaultLandingPage: "transactions", defaultImportProfileId: w }, notifications: { importComplete: false } })).status, 200);
      const changed = await call("GET", "settings/preferences"); assert.equal(changed.data.preferences.defaults.defaultImportProfileId, w); assert.equal(changed.data.preferences.notifications.importComplete, false); assert.equal(changed.data.preferences.review.reviewLowConfidence, true);
    });
    await test("Notification preferences filter events and channels without deleting notifications", async () => {
      const data = (await call("GET", "settings/preferences")).data.preferences;
      assert.equal(notificationAllowed("import:fixture:done", data.notifications, "inApp"), false);
      assert.equal(notificationAllowed("import:fixture:failed", data.notifications, "inApp"), true);
      assert.equal(notificationAllowed("review:fixture:1", data.notifications, "email"), false);
      assert.equal(notificationAllowed("review:fixture:1", { ...data.notifications, inApp: false }, "inApp"), false);
    });
    await test("Learning and Adviser privacy switches are enforced on the server", async () => {
      assert.equal((await call("PATCH", "settings/preferences", { privacy: { improveSuggestions: false, adviserUsesContext: false } })).status, 200);
      assert.equal(await canLearnFromWorkspace(w), false);
      const { upsertMerchantRule } = await import("../lib/data-engine");
      assert.equal(await upsertMerchantRule({ workspaceId: w, merchantText: "Private fixture", normalizedName: "Private fixture", categoryId: "never-used", source: "manual" }), null);
      const response = await call("POST", "adviser/chat", { messages: [{ role: "user", content: "Show my balance" }] }, w);
      assert.equal(response.status, 403, JSON.stringify(response.data));
      assert.equal((await call("PATCH", "settings/preferences", { privacy: { improveSuggestions: true, adviserUsesContext: true } })).status, 200);
    });
    await test("Native category create, rename, archive and restore preserve identity", async () => {
      const r = await call("POST", "settings/categories", { name: "QA custom", type: "expense" }, w);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      const id = r.data.category.id;
      const renamed = await call("PATCH", "settings/categories", { id, name: "QA renamed" }, w);
      assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
      const archived = await call("DELETE", "settings/categories", { id }, w);
      assert.equal(archived.status, 200, JSON.stringify(archived.data));
      assert.equal(archived.data.category.isArchived, true);
      const restored = await call("PATCH", "settings/categories", { id, isArchived: false }, w);
      assert.equal(restored.status, 200, JSON.stringify(restored.data));
      assert.equal(restored.data.category.isArchived, false);
      assert.equal(restored.data.category.id, id);
    });
    await test("Native settings reject foreign Profile access and payload ownership injection", async () => {
      assert.notEqual((await call("PATCH", "settings/profiles/foreign", { name: "No" })).status, 200);
      assert.notEqual((await call("GET", "settings/categories", undefined, "foreign")).status, 200);
      assert.equal((await call("POST", "settings/profiles", { name: "No", userId: "foreign" })).status, 400);
      assert.equal((await call("POST", "settings/categories", { name: "No", type: "expense", workspaceId: "foreign" }, w)).status, 400);
      assert.equal((await call("PATCH", "settings/categories", { id: "foreign", name: "No" }, w)).status, 404);
    });
    const file = await prisma.importFile.create({
      data: {
        workspaceId: w,
        fileName: "QA failed import.pdf",
        fileType: "application/pdf",
        storageKey: "qa-only-not-a-file",
        status: "failed",
      },
    });
    let notificationId = "";
    await test("Notification marks read while retaining All-feed item", async () => {
      const before = await call("GET", "notifications", undefined, w);
      notificationId = before.data.notifications.find((n: any) =>
        n.id.includes(file.id),
      )?.id;
      assert.ok(notificationId, JSON.stringify(before.data));
      const r = await call(
        "PATCH",
        "notifications",
        { ids: [notificationId], action: "read" },
        w,
      );
      assert.equal(r.status, 200);
      assert.ok(r.data.readIds.includes(notificationId));
      assert.ok(r.data.notifications.some((n: any) => n.id === notificationId));
    });
    await test("Dismiss removes feed item without deleting source", async () => {
      const r = await call(
        "PATCH",
        "notifications",
        { ids: [notificationId], action: "dismiss" },
        w,
      );
      assert.equal(r.status, 200);
      assert.ok(
        !r.data.notifications.some((n: any) => n.id === notificationId),
      );
      assert.ok(await prisma.importFile.findUnique({ where: { id: file.id } }));
    });
    await test("Unknown notification keys rejected", async () => {
      assert.equal(
        (
          await call(
            "PATCH",
            "notifications",
            { ids: ["foreign"], action: "dismiss" },
            w,
          )
        ).status,
        400,
      );
    });
    await test("Native exports require the authenticated Profile and return private CSV", async () => {
      for (const kind of ["transactions", "account-balances"]) {
        const path = ["settings", "export", kind];
        const response = await mobile.GET(new Request(`https://staging.clover.ph/api/mobile/v1/${path.join("/")}?workspaceId=${w}`, { headers: { authorization: "Bearer connect-fixture-token" } }), { params: Promise.resolve({ path }) });
        assert.equal(response.status, 200, await response.clone().text());
        assert.match(response.headers.get("cache-control") ?? "", /no-store/);
        assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
        assert.ok(parseSnapshotCsv(await response.text())[0].length > 3);
        const denied = await mobile.GET(new Request(`https://staging.clover.ph/api/mobile/v1/${path.join("/")}?workspaceId=foreign`, { headers: { authorization: "Bearer connect-fixture-token" } }), { params: Promise.resolve({ path }) });
        assert.notEqual(denied.status, 200);
      }
    });
    await test("Native deletion rejects missing confirmation and Profile mismatch", async () => {
      const before = await prisma.account.count({ where: { workspaceId: w } });
      assert.equal((await call("DELETE", "settings/data", { workspaceId: w, beforeDate: "2026-01-01T00:00:00.000Z", scope: "accounts" }, w)).status, 400);
      assert.equal((await call("DELETE", "settings/data", { workspaceId: "foreign", beforeDate: "2026-01-01T00:00:00.000Z", scope: "accounts", confirmation: "DELETE" }, w)).status, 400);
      assert.equal((await call("POST", "settings/delete-account", { confirmation: "DELETE" })).status, 400);
      assert.equal((await call("POST", "settings/wipe-data", { confirmation: "DELETE" })).status, 400);
      assert.equal(await prisma.account.count({ where: { workspaceId: w } }), before);
    });
    await test("Native date deletion removes only older transactions", async () => {
      const account = await prisma.account.findFirstOrThrow({ where: { workspaceId: w } });
      const older = await prisma.transaction.create({ data: { workspaceId: w, accountId: account.id, date: new Date("2025-01-01"), amount: 12, currency: "USD", type: "expense", merchantRaw: "Older QA", reviewStatus: "confirmed" } });
      const newer = await prisma.transaction.create({ data: { workspaceId: w, accountId: account.id, date: new Date("2026-02-01"), amount: 20, currency: "USD", type: "expense", merchantRaw: "Newer QA", reviewStatus: "confirmed" } });
      const result = await call("DELETE", "settings/data", { workspaceId: w, beforeDate: "2026-01-01T00:00:00.000Z", scope: "transactions", confirmation: "DELETE" }, w);
      assert.equal(result.status, 200, JSON.stringify(result.data));
      const old = await prisma.transaction.findUnique({ where: { id: older.id } });
      assert.ok(!old || old.deletedAt);
      const fresh = await prisma.transaction.findUniqueOrThrow({ where: { id: newer.id } });
      assert.equal(fresh.deletedAt, null); assert.equal(fresh.amount.toString(), "20");
    });
    await test("Snapshot rendering preserves quoted rows and escapes HTML", async () => {
      const csv = '"Name","Note"\r\n"A, B","Line 1\nLine 2"\r\n"<script>alert(1)</script>","Say ""hello"""';
      const rows = parseSnapshotCsv(csv);
      assert.equal(rows.length, 3); assert.equal(rows[1][1], "Line 1\nLine 2"); assert.equal(rows[2][1], 'Say "hello"');
      const html = snapshotHtml(csv, "Transactions", "<Profile>");
      assert.ok(!html.includes("<script>")); assert.ok(html.includes("&lt;Profile&gt;")); assert.ok(html.includes("2 records"));
    });
    await test("Notification details route inside native without discarding invitation tokens", async () => {
      assert.equal(notificationDestination("/review"), "/(tabs)/transactions?review=pending_review");
      assert.equal(notificationDestination("/split-bill/bill_123"), "/split-bills?billId=bill_123");
      assert.equal(notificationDestination("/transactions"), "/(tabs)/transactions");
      assert.equal(notificationDestination("/circles?token=invite"), null);
      assert.equal(notificationDestination("//evil.example/path"), null);
      assert.equal(notificationDestination("/\\evil.example/path"), null);
    });
    console.log(
      `${count}/${count} Connect & Platform persistence checks passed.`,
    );
  } finally {
    await prisma.user.deleteMany({
      where: { clerkUserId: "connect-fixture-user" },
    });
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

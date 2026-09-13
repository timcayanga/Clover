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
  method: "GET" | "POST" | "PATCH",
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

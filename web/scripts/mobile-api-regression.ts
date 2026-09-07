import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mobileOperation,
  mobileResponseHeaders,
  mobileSessionUser,
} from "../lib/mobile-api-policy";
import { mobileApiResponse } from "../lib/mobile-api-response";
import { mobileEditSchema, mobileCreateSchema, mobileAccountCreateSchema } from "../lib/mobile-edit-schema";
import { mobileGoalInput } from "../lib/mobile-goal-input";
import { mobileBudgetInput } from "../lib/mobile-budget-input";
import {
  getMobileRequestContext,
  withMobileRequestContext,
} from "../lib/mobile-request-context";
import { assertTrustedRequestOrigin } from "../lib/request-security";
import { getSessionContext, isLocalDevHost } from "../lib/auth";

async function main() {
  const routeSource = readFileSync(new URL("../app/api/mobile/v1/[...path]/route.ts", import.meta.url), "utf8");
  const localGuard = routeSource.indexOf('getCurrentUserEnvironment() === "local"');
  assert.ok(localGuard > 0 && localGuard < routeSource.indexOf("const claims = await verifyToken"),
    "Local fixture guard must run before authentication and account access, not after a return.");
  assert.equal(
    mobileSessionUser({ sub: "user", sid: "session", sts: "active" }),
    "user",
  );
  assert.equal(
    mobileSessionUser({ sub: "user", sid: "session", sts: "pending" }),
    null,
  );
  assert.equal(mobileSessionUser({ sub: "user" }), null);
  assert.equal(mobileOperation("GET", ["bootstrap"]), "bootstrap");
  assert.equal(mobileOperation("GET", ["budgets"]), "budgets");
  assert.equal(mobileOperation("POST", ["budgets"]), "budgets");
  assert.equal(mobileOperation("GET", ["budgets", "options"]), "budget-options");
  assert.equal(mobileOperation("PATCH", ["budgets", "options"]), null);
  assert.equal(mobileOperation("PATCH", ["budgets", "owned"]), "budget");
  assert.equal(mobileOperation("DELETE", ["budgets", "owned"]), "budget");
  assert.equal(mobileOperation("POST", ["budget-plans"]), null);
  const budgetInput = { name: "Groceries", kind: "spend_limit", scope: "global", cadence: "monthly", targetAmount: 5000, currency: "PHP", accountId: null, categoryId: null };
  assert.equal(mobileBudgetInput.safeParse(budgetInput).success, true);
  for (const extra of [{ workspaceId: "other" }, { actualAmount: 10 }, { targetAmount: -1 }, { targetAmount: "100" }, { currency: "bad" }, { scope: "account" }, { scope: "category" }, { kind: "savings_target", scope: "category", categoryId: "x" }]) assert.equal(mobileBudgetInput.safeParse({ ...budgetInput, ...extra }).success, false);
  assert.deepEqual(mobileApiResponse("budgets", { budget: { id: "budget", workspaceId: "private", rawPayload: "secret" }, accounts: [] }), { budget: { id: "budget" } });
  const budgetContext = readFileSync(new URL("../lib/budgeting-context.ts", import.meta.url), "utf8");
  assert.ok(budgetContext.indexOf("if (mobile)") < budgetContext.indexOf("await cookies()"));
  assert.ok(budgetContext.includes("await assertWorkspaceAccess(mobile.userId, workspaceId)"));
  assert.ok(budgetContext.includes('if (!workspaceId) throw new Error("WORKSPACE_NOT_FOUND")'));
  assert.ok(routeSource.indexOf('if (operation === "budgets" && request.method === "GET")') > routeSource.indexOf('await assertWorkspaceAccess(userId, workspaceId)'));
  assert.equal(mobileOperation("GET", ["goals"]), "goals");
  assert.equal(mobileOperation("POST", ["goals"]), "goals");
  assert.equal(mobileOperation("DELETE", ["goals"]), null);
  const goalInput = { goal: "save_more", targetAmount: 2000, currency: "PHP", goalPlan: { cadence: "monthly", purpose: "Travel" } };
  assert.equal(mobileGoalInput.safeParse(goalInput).success, true);
  for (const extra of [{ workspaceId: "other" }, { userId: "other" }, { targetAmount: -1 }, { goalPlan: { ...goalInput.goalPlan, workspaceId: "other" } }]) assert.equal(mobileGoalInput.safeParse({ ...goalInput, ...extra }).success, false);
  const goalSource = readFileSync(new URL("../lib/mobile-goals.ts", import.meta.url), "utf8");
  assert.ok(goalSource.includes("where: { id, workspaceId }"));
  assert.ok(!goalSource.includes("prisma.user.update"), "Native goal edits must not overwrite the legacy account goal");
  assert.ok(routeSource.indexOf('if (operation === "goals")') > routeSource.indexOf('await assertWorkspaceAccess(userId, workspaceId)'));
  assert.equal(
    mobileOperation("PATCH", ["transactions", "abc"]),
    "transaction",
  );
  assert.equal(mobileOperation("DELETE", ["transactions", "abc"]), "transaction");
  assert.equal(mobileOperation("POST", ["transactions"]), "transaction-create");
  assert.equal(mobileOperation("POST", ["accounts"]), "account-create");
  const newAccount = { name: "Travel", institution: "BPI", type: "bank", currency: "PHP", balance: "100.00" };
  assert.equal(mobileAccountCreateSchema.safeParse(newAccount).success, true);
  for (const extra of [{ workspaceId: "other" }, { accountNumber: "change-existing" }, { balance: "NaN" }, { type: "investment" }, { name: "" }, { rawPayload: {} }]) {
    assert.equal(mobileAccountCreateSchema.safeParse({ ...newAccount, ...extra }).success, false);
  }
  assert.deepEqual(mobileApiResponse("account-create", { account: { id: "a", name: "Travel", rawPayload: { secret: true } } }), { account: { id: "a", name: "Travel" } });
  assert.equal(mobileOperation("GET", ["home"]), "home");
  assert.equal(mobileOperation("GET", ["notifications"]), "notifications");
  assert.equal(mobileOperation("PATCH", ["notifications"]), "notifications");
  assert.equal(mobileOperation("DELETE", ["notifications"]), null);
  assert.ok(routeSource.includes('body.ids.some(id => !allowed.has(id))'));
  assert.equal(mobileOperation("GET", ["options"]), "options");
  assert.equal(mobileOperation("DELETE", ["accounts", "abc"]), null);
  for (const input of [{rawPayload:{tampered:true}}, {workspaceId:"other"}, {amount:"NaN"}, {date:"2026-02-30"}, {date:"2026-1-1"}, {amount:"1e6"}, {userNote:"x".repeat(2001)}]) assert.equal(mobileEditSchema.safeParse(input).success, false);
  assert.equal(mobileEditSchema.safeParse({amount:"-123.45",date:"2026-09-07",type:"expense",accountId:"owned",categoryId:null,userNote:"User note",tags:["Work"]}).success,true);
  assert.equal(mobileCreateSchema.safeParse({accountId:"owned",categoryId:null,merchantRaw:"Sample",date:"2026-09-07",amount:"-20.00",currency:"PHP",type:"expense"}).success,true);
  assert.ok(routeSource.includes('where: { id: body.accountId, workspaceId'));
  assert.ok(routeSource.includes('where: { id: body.categoryId, workspaceId'));
  assert.equal(mobileOperation("POST", ["billing", "checkout"]), null);
  assert.equal(mobileOperation("GET", ["admin", "users"]), null);
  assert.equal(mobileOperation("POST", ["imports", "abc", "confirm"]), null);
  const request = new Request(
    "https://staging.clover.ph/api/mobile/v1/transactions/abc",
    { method: "PATCH" },
  );
  assert.throws(() => assertTrustedRequestOrigin(request));
  const spoofed = new Request(request.url, {
    headers: { "X-Mobile-User-Id": "victim", Authorization: "Bearer fake" },
  });
  assert.throws(() => assertTrustedRequestOrigin(spoofed));
  await Promise.all(
    ["first", "second"].map(async (userId) =>
      withMobileRequestContext(userId, request, async () => {
        await Promise.resolve();
        assert.equal(getMobileRequestContext()?.userId, userId);
        assert.deepEqual(await getSessionContext(), { userId, isGuest: false });
        assert.equal(await isLocalDevHost(), false);
        assert.doesNotThrow(() => assertTrustedRequestOrigin(request));
        assert.throws(() =>
          assertTrustedRequestOrigin(new Request(request.url)),
        );
      }),
    ),
  );
  assert.equal(getMobileRequestContext(), undefined);
  assert.throws(() => assertTrustedRequestOrigin(request));
  assert.doesNotThrow(() =>
    assertTrustedRequestOrigin(
      new Request("https://clover.ph/api/test", {
        headers: { Origin: "https://clover.ph" },
      }),
    ),
  );
  assert.throws(() =>
    assertTrustedRequestOrigin(
      new Request("https://clover.ph/api/test", {
        headers: { Origin: "https://attacker.invalid" },
      }),
    ),
  );
  assert.match(mobileResponseHeaders["Cache-Control"], /no-store/);
  const result = mobileApiResponse("transactions", {
    transactions: [
      {
        id: "t",
        amount: "500.00",
        rawPayload: { secret: "raw" },
        normalizedPayload: { secret: "normalized" },
      },
    ],
    page: 1,
    totalCount: 1,
  });
  assert.deepEqual(result, {
    transactions: [{ id: "t", amount: "500.00" }],
    page: 1,
    totalCount: 1,
  });
  assert.deepEqual(
    mobileApiResponse("imports", {
      importFiles: [{ id: "i", fileName: "test.pdf", storageKey: "secret" }],
    }),
    { importFiles: [{ id: "i", fileName: "test.pdf" }] },
  );
  assert.deepEqual(
    mobileApiResponse("import-process", {
      error: "Invalid file",
      rawPayload: "private",
    }),
    { error: "Invalid file" },
  );
  console.log(
    "PASS mobile API allowlist, response minimization, exact-request origin exemption, async principal isolation, and browser CSRF preservation",
  );
}
void main();

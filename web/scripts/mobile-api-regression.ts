import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mobileOperation,
  mobileResponseHeaders,
  mobileSessionUser,
} from "../lib/mobile-api-policy";
import { mobileApiResponse } from "../lib/mobile-api-response";
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
  assert.equal(
    mobileOperation("PATCH", ["transactions", "abc"]),
    "transaction",
  );
  assert.equal(mobileOperation("DELETE", ["transactions", "abc"]), null);
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

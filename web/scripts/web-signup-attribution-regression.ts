import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as attribution from "../../shared/web-signup-attribution";
import { namedAnalyticsAction } from "../../shared/analytics-measurement";

const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const clientCode = compile("../lib/web-signup-attribution-client.ts");
const serverCode = compile("../lib/user-context.ts");

async function main() {
  for (const [provider, page, placement] of [
    ["email", "/", "hero"], ["google", "/features/manage-money", "final_cta"], ["apple", "/pricing", "pricing"],
  ] as const) {
    const session = new Map<string, string>();
    const document = { cookie: "" };
    const loadBrowser = () => {
      const exports = {} as typeof import("../lib/web-signup-attribution-client");
      vm.runInNewContext(clientCode, {
        exports, document, location: { protocol: "https:" },
        sessionStorage: {
          getItem: (key: string) => session.get(key),
          setItem: (key: string, value: string) => session.set(key, value),
          removeItem: (key: string) => session.delete(key),
        },
        require: (id: string) => id.endsWith("/analytics") ? { newTelemetryId: () => "fixture-journey" } : attribution,
      });
      return exports;
    };
    const clicked = loadBrowser().startSignupAttribution(page, placement);
    const form = loadBrowser();
    const viewed = form.getSignupAttribution();
    assert.equal(viewed.id, clicked.id);
    const submitted = form.submitSignupAttribution(viewed, provider);
    assert.match(document.cookie, /SameSite=Lax; Secure$/);
    const rawCookie = document.cookie.split(";")[0].split("=")[1];
    assert.equal(attribution.parseSignupAttribution(decodeURIComponent(rawCookie))?.provider, provider);

    const captures: { event: string; properties: Record<string, unknown> }[] = [];
    const clerkUser = { clerkUserId: "user_fixture", email: "private@example.test", verified: true, authoritative: true,
      accountCreatedAt: new Date(submitted.startedAt + 1) };
    const server = {} as typeof import("../lib/user-context");
    let row: Record<string, unknown> | null = null;
    const user = {
      findUnique: async () => row,
      create: async ({ data }: { data: Record<string, unknown> }) => row = { ...data, id: "fixture", createdAt: clerkUser.accountCreatedAt, signupTrialEvaluatedAt: true },
    };
    const tx = { user, clerkIdentityDeletion: { findUnique: async () => null }, $executeRaw: async () => {} };

    vm.runInNewContext(serverCode, { exports: server, decodeURIComponent, require(id: string) {
      if (id.endsWith("/web-signup-attribution")) return attribution;
      if (id === "next/headers") return {
        headers: async () => new Headers(),
        cookies: async () => ({ get: () => ({ value: rawCookie }) }),
      };
      if (id.endsWith("/prisma")) return { prisma: { user, $transaction: (run: (value: typeof tx) => unknown) => run(tx) } };
      if (id.endsWith("/clerk")) return { syncClerkUser: async () => clerkUser };
      if (id.endsWith("/pro-access")) return { refreshProAccess: async () => "free" };
      if (id.endsWith("/user-environment")) return { getCurrentUserEnvironment: () => "staging", resolvePersistedUserEnvironment: () => "staging" };
      if (id.endsWith("/analytics-server")) return {
        capturePostHogServerEvent: (event: string, _identity: string, properties: Record<string, unknown>) => captures.push({ event, properties }),
      };
      return {};
    } });
    // The webhook can provision the account before the authenticated browser arrives.
    await user.create({ data: { clerkUserId: clerkUser.clerkUserId, email: clerkUser.email, verified: true, environment: "staging", planTier: "free" } });
    await server.getOrCreateCurrentUser(clerkUser.clerkUserId);
    const signup = captures.filter(({ event }) => event.startsWith("web_signup"));
    assert.deepEqual(signup.map(({ event }) => event), ["web_signup_verified", "web_signup_account_created"]);
    for (const { properties } of signup) {
      assert.equal(properties.signup_journey_id, clicked.id);
      assert.equal(properties.signup_provider, provider);
      assert.equal(properties.origin_page, page);
      assert.equal(properties.cta_placement, placement);
      assert.doesNotMatch(JSON.stringify(properties), /private@example.test|user_fixture/);
    }
    assert.equal(attribution.matchesNewSignup(submitted, new Date(submitted.startedAt - 86400000)), false, "Existing Clerk account cannot become a CTA conversion");
    assert.equal(attribution.parseSignupAttribution(JSON.stringify(submitted), submitted.startedAt + 1800001), null);
    console.log(`PASS ${provider}: CTA to form, submit, redirect cookie, verification and webhook-first account creation`);
  }
  const origin = "https://clover.ph";
  assert.equal(namedAnalyticsAction({ origin, href: "/sign-in" }), "login");
  assert.equal(namedAnalyticsAction({ origin, href: "https://apps.apple.com/ph/app/clover-personal-finance/id6811711508" }), "download_ios");
  assert.equal(namedAnalyticsAction({ origin, href: "https://play.google.com/store/apps/details?id=ph.clover.app" }), "download_android");
  assert.equal(attribution.signupOrigin("/features/private-identifier", "private text").page, "/features/:id");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as analytics from "../../shared/analytics";
import * as splitBillRead from "../../shared/split-bill-read";
import { PageCache, isPageRead } from "../../mobile/src/page-cache";
import { homePendingSplitBills } from "../../shared/home-split-bills";
import { mobileApiResponse } from "../lib/mobile-api-response";
import * as mobilePolicy from "../lib/mobile-api-policy";
import * as mobileContext from "../lib/mobile-request-context";

function load<T>(file: string, dependencies: Record<string, unknown> = {}, globals: Record<string, unknown> = {}): T {
  const exports = {};
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  runInNewContext(outputText, {
    exports, Error, URL, URLSearchParams, Request, Response, Headers, AbortController,
    process: { env: { CLOVER_MOBILE_API_ENABLED: "true" } },
    require: (id: string) => dependencies[id] ?? {},
    ...globals,
  }, { filename: file });
  return exports as T;
}

async function main() {
  const calls: string[] = [];
  const warnings: unknown[] = [];
  const recordLog = (_message: string, data: unknown) => warnings.push(data);
  const logs = { warn: recordLog, info: recordLog };
  let fault = "";
  let ownsProfile = true;
  const bill = { id: "bill", title: "Fixture lunch", currency: "PHP", settlement: { transfers: [{ amount: 125 }] } };
  const prisma = {
    user: { findUnique: async () => ({ id: "owner" }) },
    workspace: { findFirst: async ({ where }: { where: { userId: string } }) => {
      assert.equal(where.userId, "owner");
      calls.push("legacy-profile");
      return ownsProfile ? { id: "profile" } : null;
    } },
    splitBill: { findMany: async ({ skip, take }: { skip: number; take: number }) => {
      calls.push(`list:${skip}:${take}`);
      if (fault === "list") throw new Error("private query");
      return [bill];
    } },
  };
  const route = load<{ GET(request: Request): Promise<Response> }>("../app/api/split-bills/route.ts", {
    "../../../../shared/home-split-bills": { homePendingSplitBills },
    "../../../../shared/split-bill-read": splitBillRead,
    "next/server": { NextResponse: Response },
    zod: { z },
    "@/lib/prisma": { prisma },
    "@/lib/mobile-request-context": mobileContext,
    "@/lib/split-bill-access": { getSplitBillCurrentUser: async () => {
      assert.equal(mobileContext.getMobileRequestContext()?.userId, "clerk-user");
      if (fault === "auth") throw new Error("UNAUTHORIZED");
      return { id: "owner" };
    } },
    "@/lib/split-bill-loaders": { loadSplitBillWorkspaceData: async () => {
      calls.push("summary");
      if (fault === "summary") throw new Error("private query");
      return { bills: [bill] };
    } },
    "@/lib/split-bill-balance-summary": { splitBillBalanceSummary: () => ({ youOwe: "₱125.00", owedToYou: "₱0.00" }) },
    "@/lib/user-display-name": { getUserDisplayName: () => "Fixture" },
    "@/lib/split-bill": { serializeSplitBillRecord: (row: unknown) => row },
    "@/lib/split-bill-transfer-settlements": { loadSplitBillTransferSettlementsForBills: async () => {
      if (fault === "settlement") throw new Error("private settlement");
      return new Map();
    } },
  }, { console: logs });
  const gateway = load<Record<"GET" | "POST", (request: Request, context: { params: Promise<{ path: string[] }> }) => Promise<Response>>>(
    "../app/api/mobile/v1/[...path]/route.ts", {
      "../../../../../../shared/split-bill-read": splitBillRead,
      "@clerk/nextjs/server": { verifyToken: async () => ({ sub: "clerk-user", sid: "fixture-session" }) },
      "@/lib/prisma": { prisma },
      "@/lib/admin-access": { isAdminOnlyUserId: () => false, isConfiguredAdminEmail: () => false, isAssignedAdmin: () => false },
      "@/lib/workspace-access": { assertWorkspaceAccess: async (user: string, profile: string) => {
        assert.equal(user, "clerk-user");
        if (profile !== "profile") throw new Error("WORKSPACE_NOT_FOUND");
      } },
      "@/lib/mobile-request-context": mobileContext,
      "@/lib/mobile-api-policy": mobilePolicy,
      "@/lib/mobile-api-response": { mobileApiResponse },
      "@/lib/user-environment": { getCurrentUserEnvironment: () => "staging" },
      "@/lib/plan-quota": { PlanQuotaError: class extends Error {} },
      "@/lib/native-input-error": { NativeInputError: class extends Error {} },
      "@/app/api/split-bills/route": route,
      zod: { z },
    }, { console: logs },
  );
  const fetchGateway = (url: string, options: RequestInit) => gateway.GET(new Request(url, options),
    { params: Promise.resolve({ path: ["split-bills"] }) });
  const lifecycle = load("../../mobile/src/request-lifecycle.ts", {}, { setTimeout, clearTimeout });
  const api = load<typeof import("../../mobile/src/api")>("../../mobile/src/api.ts", {
    "./request-lifecycle": lifecycle,
    "./api-base": { apiBase: () => "https://fixture.test" },
    "../../shared/analytics": analytics,
    "../../shared/split-bill-read": splitBillRead,
  }, { fetch: fetchGateway });
  const events: { event: string; properties: analytics.TelemetryProperties }[] = [];
  analytics.setTelemetrySink((event, properties) => events.push({ event, properties }));
  const request = <T,>(query: string) => api.apiRequest<T>("fixture-token", `split-bills?${query}`);
  const home = "homeSummary=true&workspaceId=profile";
  const list = "page=2&workspaceId=profile";

  assert.equal((await request<{ pending: { count: number } }>(home)).pending.count, 1);
  assert.equal((await request<{ pending: { count: number } }>("homeSummary=true")).pending.count, 1,
    "Existing apps get a Home summary through an owned Profile");
  const listData = await request<{ page: number; bills: unknown[] }>(list);
  assert.equal(listData.page, 2);
  assert.equal(listData.bills.length, 1);
  assert.deepEqual(calls, ["summary", "legacy-profile", "summary", "list:30:31"]);
  assert.equal((await request<{ page: number }>("page=2&workspaceId=")).page, 2);
  assert.equal((await request<{ page: number }>("page=2")).page, 2);
  assert.equal((await request<{ summary: { youOwe: string } }>("summaryOnly=true&workspaceId=")).summary.youOwe, "₱125.00");
  assert.equal((await request<{ summary: { youOwe: string } }>("summaryOnly=true&workspaceId=profile")).summary.youOwe, "₱125.00");
  for (const [phase, query, status, surface, code] of [
    ["summary", home, 500, "home_split_bills_summary", "split_bills_summary_load_failed"],
    ["list", list, 500, "split_bills_list", "split_bills_list_query_failed"],
    ["settlement", list, 500, "split_bills_list", "split_bills_settlement_load_failed"],
    ["auth", list, 401, "split_bills_list", "split_bills_unauthorized"],
    ["", "page=2&workspaceId=other", 404, "split_bills_list", "split_bills_profile_unavailable"],
  ] as const) {
    fault = phase;
    await assert.rejects(request(query), error => error instanceof api.ApiError && error.status === status);
    const { event, properties } = events.at(-1)!;
    assert.equal(event, "data_load_failed");
    assert.equal(properties.read_surface, surface);
    assert.equal(properties.error_code, code);
    assert.equal(properties.status, status);
    fault = "";
    await request(status === 404 ? list : query);
    assert.equal(events.at(-1)?.properties.read_surface, surface);
    assert.equal(events.at(-1)?.event, "data_ready");
  }
  // Focus and pull-to-refresh can overlap. Share one request without caching
  // failures or letting the optional card retry itself in the background.
  const cache = new PageCache();
  const cachedHome = () => cache.read(`split-bills?${home}`, () => request(home));
  assert.equal(isPageRead(`split-bills?${home}`), true);
  fault = "summary";
  const beforeOverlap = calls.length;
  const overlapping = await Promise.allSettled([cachedHome(), cachedHome()]);
  assert.deepEqual(overlapping.map(result => result.status), ["rejected", "rejected"]);
  assert.deepEqual(calls.slice(beforeOverlap), ["summary"]);
  assert.equal(cache.peek(`split-bills?${home}`), null);
  fault = "";
  await cachedHome();
  assert.deepEqual(calls.slice(beforeOverlap), ["summary", "summary"]);

  assert.ok(warnings.some(entry => (entry as { surface?: string; legacyProfileFallback?: boolean }).surface === "split_bills_list" &&
    (entry as { legacyProfileFallback?: boolean }).legacyProfileFallback));
  assert.equal(splitBillRead.splitBillReadRequiresAction(409), true);
  assert.equal(splitBillRead.splitBillReadRequiresAction(503), false);
  assert.equal(splitBillRead.splitBillReadRequiresAction(429), false);
  const beforeMutation = calls.length;
  const mutation = await gateway.POST(new Request("https://fixture.test/api/mobile/v1/split-bills", {
    method: "POST", headers: { authorization: "Bearer fixture-token" },
  }), { params: Promise.resolve({ path: ["split-bills"] }) });
  assert.equal(mutation.status, 400);
  assert.equal(calls.length, beforeMutation, "A write must never look up a fallback Profile");
  ownsProfile = false;
  await assert.rejects(request("page=2&workspaceId="), error => error instanceof api.ApiError && error.status === 400);
  await assert.rejects(request("homeSummary=true"), error => error instanceof api.ApiError && error.status === 400);
  await assert.rejects(request("homeSummary=true&workspaceId=other"), error => error instanceof api.ApiError && error.status === 404);
  const unauthorized = await fetchGateway("https://fixture.test/api/mobile/v1/split-bills?homeSummary=true", {});
  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).code, "split_bills_unauthorized");
  assert.equal(analytics.requestTelemetry("split-bills?person=Private%20Name")?.read_surface, "split_bills_filtered_list");
  assert.equal(analytics.requestTelemetry("split-bills?homeSummary=true", "POST")?.read_surface, undefined);
  assert.doesNotMatch(JSON.stringify({ events, warnings }), /Private|private|workspaceId|clerk-user|fixture-token|Fixture lunch/);
  console.log("PASS mobile Split Bills gateway, Home summary, list pagination, separate telemetry, privacy and retry");
}

void main().catch(error => { console.error(error); process.exitCode = 1; });

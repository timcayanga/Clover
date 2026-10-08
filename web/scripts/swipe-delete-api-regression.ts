import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { mobileOperation } from "@/lib/mobile-api-policy";
export async function runSwipeDeleteApi() {
  const state = { origin: true, paired: false, writes: [] as string[], access: [] as string[] };
  const tx = {
    async $queryRaw(sql: TemplateStringsArray, ...values: any[]) {
      if (sql.join("").includes('COUNT(*)')) return [{ count: state.paired ? 1n : 0n }];
      assert(sql.join("").includes('a."workspaceId"='), "Position lookup must be scoped");
      return values[0] === "position" && values[1] === "owned" ? [{ id: "position", assetName: "Stock", sourceHoldingId: "source" }] : [];
    },
    async $executeRaw(sql: TemplateStringsArray, ...values: any[]) { assert.equal(values[0], "position"); state.writes.push("position"); },
    investmentHolding: { async deleteMany(args: any) { assert.equal(args.where.id, "source"); assert.equal(args.where.workspaceId, "owned"); state.writes.push("source"); } },
  };
  const prisma = {
    $transaction: async (fn: any) => fn(tx),
    investmentHolding: {
      findUnique: async ({ where }: any) => where.id === "holding" ? { id: "holding", workspaceId: "owned", assetName: "Imported stock" } : where.id === "foreign" ? { id: "foreign", workspaceId: "foreign", assetName: "Other owner" } : null,
      delete: async ({ where }: any) => { state.writes.push(where.id); },
    },
  };
  const deps: Record<string, unknown> = {
    "@/lib/investment-position-store": {}, "../../../../../shared/investment-position-view": {},
    "@/lib/request-security": { assertTrustedRequestOrigin() { if (!state.origin) throw new Error("Untrusted origin"); } },
    "next/server": { NextResponse: { json: (body: any, options?: any) => ({ body, status: options?.status ?? 200 }) } }, zod: { z },
    "@/lib/auth": { isLocalDevHost: async () => false, requireAuth: async () => ({ userId: "owner" }) },
    "@/lib/prisma": { prisma },
    "@/lib/workspace-access": { async assertWorkspaceAccess(user: string, workspace: string) { state.access.push(workspace); assert.equal(user, "owner"); if (workspace !== "owned") throw new Error("Forbidden"); } },
    "@/lib/investments": { INVESTMENT_SUBTYPES: ["stock"] },
    "@/lib/workspace-summary-cache": { invalidateWorkspaceSummaryCache(workspace: string) { assert.equal(workspace, "owned"); } },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("app/api/investment-holdings/[holdingId]/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Error, require(name: string) { assert(name in deps, name); return deps[name]; } });
  const remove = (holdingId: string, workspaceId = "owned") => exports.DELETE({ json: async () => ({ workspaceId }) }, { params: Promise.resolve({ holdingId }) });
  assert.equal((await remove("foreign", "foreign")).status, 400); assert.equal(state.writes.length, 0);
  assert.equal((await remove("foreign")).status, 404); assert.equal(state.writes.length, 0);
  state.origin = false; assert.equal((await remove("position")).status, 400); assert.equal(state.writes.length, 0); state.origin = true;
  state.paired = true; const paired = await remove("position"); assert.equal(paired.status, 400); assert.match(paired.body.error, /linked transfers/); assert.equal(state.writes.length, 0); state.paired = false;
  const position = await remove("position"); assert.equal(position.status, 200, position.body.error); assert.deepEqual(state.writes, ["source", "position"]);
  assert.equal((await remove("holding")).status, 200); assert.deepEqual(state.writes, ["source", "position", "holding"]);
  assert.equal(mobileOperation("DELETE", ["investment-holdings", "holding"]), "investment-holding-delete");
  for (const method of ["POST", "GET", "PATCH"]) assert.equal(mobileOperation(method, ["investment-holdings", "holding"]), null);
  assert.equal(mobileOperation("DELETE", ["investment-holdings"]), null);
  console.log("PASS investment deletion ownership, origin, transfer protection, exact asset targeting and native route policy");
}

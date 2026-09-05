import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { personalGoalInput } from "../lib/personal-goal-input";

async function main() {
  const payload = { goal: "save_more", targetAmount: "25000", currency: "PHP", goalPlan: { cadence: "annual", purpose: "Travel" } };
  for (const targetAmount of [0, 0.001, -1, "NaN", "Infinity", "", 1e18]) assert.equal(personalGoalInput.safeParse({ ...payload, targetAmount }).success, false);
  const directory = await mkdtemp(path.join(tmpdir(), "clover-goal-test-"));
  try {
    const outfile = path.join(directory, "route.mjs");
    await build({ entryPoints: ["app/api/personal-goals/route.ts"], outfile, bundle: true, platform: "node", format: "esm", plugins: [{ name: "isolated-goal-storage", setup(builder) {
      const mocks: Record<string, string> = {
        "@/lib/auth": 'export async function requireAuth(){if(globalThis.goalTest.denied)throw Error("UNAUTHORIZED");return {userId:"test"}}',
        "@/lib/budgeting-context": 'export async function resolveBudgetingWorkspace(){return {workspaceId:globalThis.goalTest.workspace}}',
        "@/lib/request-security": 'export function assertTrustedRequestOrigin(request){if(request.headers.get("origin")!=="http://localhost")throw Error("Untrusted request origin.")}',
        "@/lib/workspace-summary-cache": 'export function invalidateWorkspaceSummaryCache(){}',
        "next/server": 'export const NextResponse={json:(body,init)=>new Response(JSON.stringify(body),{status:init?.status??200})}',
        "@/lib/prisma": `export const prisma={personalGoal:{
          async create({data}){const row={...data,id:String(globalThis.goalTest.rows.length+1)};globalThis.goalTest.rows.push(row);return row},
          async updateMany({where,data}){const row=globalThis.goalTest.rows.find(row=>row.id===where.id&&row.workspaceId===where.workspaceId);if(!row)return {count:0};Object.assign(row,data);return {count:1}}
        }};`,
      };
      builder.onResolve({ filter: /^(next\/server|@\/lib\/)/ }, (args) => args.path in mocks ? { path: args.path, namespace: "mock" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
    const state = { workspace: "profile-a", rows: [] as Array<{id:string;workspaceId:string;targetAmount:number}>, denied: false };
    (globalThis as typeof globalThis & { goalTest: typeof state }).goalTest = state;
    const { POST } = await import(pathToFileURL(outfile).href);
    const save = (body: unknown, origin = "http://localhost") => POST(new Request("http://localhost/api/personal-goals", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }));
    assert.equal((await save(payload)).status, 201);
    assert.equal((await save({ ...payload, targetAmount: "40000" })).status, 201);
    assert.equal(state.rows.length, 2, "Two goals of the same kind must remain independent.");
    assert.equal((await save({ ...payload, id: "1", targetAmount: "30000" })).status, 200);
    assert.equal(state.rows[0].targetAmount, 30000);
    assert.equal(state.rows[1].targetAmount, 40000, "Editing one goal must preserve another.");
    state.workspace = "profile-b";
    assert.equal((await save({ ...payload, id: "1" })).status, 404);
    assert.equal(state.rows[0].targetAmount, 30000, "Another Profile cannot edit this goal.");
    assert.equal((await save(payload, "https://untrusted.example")).status, 400);
    state.denied = true;
    assert.equal((await save(payload)).status, 400);
    assert.equal(state.rows.length, 2);
    console.log("Personal goals: independent creation, scoped editing, validation, auth and origin checks passed.");
  } finally { await rm(directory, { recursive: true, force: true }); }
}
void main();

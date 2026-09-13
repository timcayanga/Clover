import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { prisma } from "../lib/prisma";
import { fetchImportFileStatusCompat } from "../lib/data-engine";

async function main() {
  // Exercise the real compatibility query with an isolated database boundary.
  const originalColumns = prisma.$queryRaw;
  const originalRead = prisma.$queryRawUnsafe;
  const fields = ["id", "workspaceId", "status", "processingPhase", "processingMessage", "processingAttempt", "processingTargetScore", "processingCurrentScore", "parsedRowsCount", "confirmedTransactionsCount", "accountId", "updatedAt"];
  const snapshot = Object.fromEntries(fields.map(field => [field, field]));
  let query = "";
  prisma.$queryRaw = (async () => [...fields, "fileName", "storageKey", "sourceFingerprint"].map(column_name => ({ column_name }))) as typeof originalColumns;
  prisma.$queryRawUnsafe = (async (sql: string, id: string) => { query = sql; assert.equal(id, "test-import"); return [snapshot]; }) as typeof originalRead;
  try {
    assert.deepEqual(await fetchImportFileStatusCompat("test-import"), snapshot);
    for (const field of fields) assert.ok(query.includes(`"${field}"`));
    for (const field of ["fileName", "storageKey", "sourceFingerprint", "rawPayload"]) assert.ok(!query.includes(`"${field}"`));
    assert.ok(query.includes('WHERE "id" = $1 LIMIT 1'));
  } finally { prisma.$queryRaw = originalColumns; prisma.$queryRawUnsafe = originalRead; }

  // Execute the real route with isolated auth and database dependencies.
  const routeSource = readFileSync(new URL("../app/api/imports/[importId]/progress/route.ts", import.meta.url), "utf8");
  let local = false, missing = false, denied = false, accessChecks = 0;
  const record = { ...snapshot, id: "test-import", workspaceId: "profile", parsedRowsCount: 12, confirmedTransactionsCount: 10 };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/auth": { isLocalDevHost: async () => local, requireAuth: async () => ({ userId: "owner" }) },
    "@/lib/data-engine": { fetchImportFileStatusCompat: async () => missing ? null : record },
    "@/lib/workspace-access": { assertWorkspaceAccess: async (user: string, profile: string) => { accessChecks++; assert.equal(user, "owner"); assert.equal(profile, "profile"); if (denied) throw new Error("FORBIDDEN"); } },
  };
  const exports: { GET?: (...args: any[]) => Promise<Response> } = {};
  new Function("require", "exports", ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)((name: string) => { assert.ok(name in deps, name); return deps[name]; }, exports);
  const get = () => exports.GET!(new Request("https://staging.clover.ph/api/imports/test-import/progress"), { params: Promise.resolve({ importId: "test-import" }) });
  const response = await get();
  const body = await response.json();
  assert.equal(body.parsedRowsCount, 12); assert.equal(body.confirmedTransactionsCount, 10); assert.equal(body.visibleImportComplete, true);
  assert.equal(body.importFile.processingMessage, record.processingMessage); assert.equal(body.importFile.updatedAt, record.updatedAt);
  assert.equal(accessChecks, 1);
  denied = true; await assert.rejects(get(), /FORBIDDEN/); denied = false;
  missing = true; assert.equal((await get()).status, 404); missing = false;
  local = true; await get(); assert.equal(accessChecks, 2);

  // Execute the actual React effect body with a fake clock and visibility events.
  const page = readFileSync(new URL("../app/transactions/page.tsx", import.meta.url), "utf8");
  const end = page.indexOf("  }, [activeFinalizingImportKey");
  const start = page.lastIndexOf("  useEffect(() => {", end) + "  useEffect(() => {".length;
  const effect = page.slice(start, end);
  let timer: (() => void) | undefined, listener: (() => void) | undefined;
  let requests = 0, metadata = 0, pages = 0;
  let release: (() => void) | undefined;
  const document = { visibilityState: "visible", addEventListener: (_: string, cb: () => void) => { listener = cb; }, removeEventListener: () => { listener = undefined; } };
  const window = { setInterval: (cb: () => void, ms: number) => { assert.equal(ms, 30000); timer = cb; return 1; }, clearInterval: () => { timer = undefined; } };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const cleanup = new Function("selectedWorkspaceId", "activeFinalizingImportKey", "transactionsPage", "transactionsPageSize", "fetch", "loadWorkspaceMetadata", "loadTransactionsPage", "document", "window", effect)("profile", "import-a", 2, 25,
    async () => { requests++; await new Promise<void>(resolve => { release = resolve; }); },
    async () => { metadata++; }, async (_: string, options: { summaryMode: string; pageOverride: number }) => { pages++; assert.equal(options.summaryMode, "light"); assert.equal(options.pageOverride, 2); }, document, window);
  assert.equal(requests, 1); timer!(); timer!(); assert.equal(requests, 1, "Slow enrichment requests must not overlap");
  release!(); await tick(); assert.equal(pages, 1);
  document.visibilityState = "hidden"; timer!(); release!(); await tick(); assert.equal(requests, 2, "Background processing continues"); assert.equal(metadata, 1); assert.equal(pages, 1, "Hidden tabs do not reload display data");
  document.visibilityState = "visible"; listener!(); release!(); await tick(); assert.equal(pages, 2, "Returning to the tab refreshes immediately");
  timer!(); cleanup(); release!(); await tick(); assert.equal(pages, 2, "Unmounted page cannot request another refresh"); assert.equal(timer, undefined); assert.equal(listener, undefined);
  console.log("PASS narrow import query, progress response and ownership, single-flight enrichment, hidden-tab savings, immediate resume and cleanup");
}
void main();

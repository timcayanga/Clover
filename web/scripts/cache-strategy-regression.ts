import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const transactionsSource = readSource("app/transactions/page.tsx");
assert.match(transactionsSource, /persistTransactionsWorkspaceCache as persistTransactionsWorkspaceCacheShared/);
assert.match(transactionsSource, /return persistTransactionsWorkspaceCacheShared\(workspaceId/);
assert.doesNotMatch(
  transactionsSource,
  /localStorageRef\?\.setItem\(transactionsWorkspaceCacheKey,[\s\S]{0,160}sessionStorageRef\?\.setItem\(transactionsWorkspaceCacheKey/,
  "Transactions must not duplicate the same workspace snapshot across both browser storage tiers."
);

const workspaceCacheSource = readSource("lib/workspace-cache.ts");
assert.match(workspaceCacheSource, /workspaceCacheTransactionLimits = \[500, 100, 0\]/);
assert.match(workspaceCacheSource, /workspaceCacheSnapshotLimit = 3/);
assert.match(workspaceCacheSource, /sessionStorageRef\?\.removeItem\(key\)/);

const adviserClientSource = readSource("components/adviser-chat.tsx");
const adviserRouteSource = readSource("app/api/adviser/chat/route.ts");
assert.match(adviserClientSource, /messages: nextMessages\.slice\(-6\)/);
assert.match(adviserRouteSource, /\.slice\(-6\)/);
assert.match(adviserRouteSource, /prompt_cache_key: "clover-adviser-v1"/);
const adviserWorkspaceLookup = adviserRouteSource.slice(
  adviserRouteSource.indexOf("const workspace ="),
  adviserRouteSource.indexOf("if (!workspace)")
);
assert.doesNotMatch(
  adviserWorkspaceLookup,
  /transactions:\s*\{/,
  "Adviser must not load transaction history once per account before loading its bounded analysis set."
);
assert.match(adviserRouteSource, /const transactionsByAccountId = new Map/);
assert.match(adviserRouteSource, /accountId: true/);

const importParserSource = readSource("lib/openai-import-parser.ts");
assert.match(importParserSource, /prompt_cache_key: `clover-import-\$\{params\.importMode\}-v1`/);
assert.match(importParserSource, /prompt_cache_key: `clover-import-transcription-\$\{params\.importMode\}-v1`/);

void (async () => {
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const { fetchJsonOnce, clearJsonRequestCache } = await import("@/lib/request-dedupe");
  clearJsonRequestCache();
  await fetchJsonOnce({ key: "cache-0", route: "cache-test", input: "https://clover.test/cache-0", cacheTtlMs: 60_000 });
  await fetchJsonOnce({ key: "cache-0", route: "cache-test", input: "https://clover.test/cache-0", cacheTtlMs: 60_000 });
  assert.equal(fetchCalls, 1, "A warm resolved request should be reused during its TTL.");

  for (let index = 1; index <= 64; index += 1) {
    await fetchJsonOnce({
      key: `cache-${index}`,
      route: "cache-test",
      input: `https://clover.test/cache-${index}`,
      cacheTtlMs: 60_000,
    });
  }
  await fetchJsonOnce({ key: "cache-0", route: "cache-test", input: "https://clover.test/cache-0", cacheTtlMs: 60_000 });
  assert.equal(fetchCalls, 66, "The bounded resolved-request LRU should evict its oldest entry.");

  console.log("[PASS] Clover caches stay bounded, avoid duplicate persistence, and reuse model prompt prefixes.");
})();

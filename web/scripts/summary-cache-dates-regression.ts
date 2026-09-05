import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma } from "@prisma/client";
const { Decimal } = Prisma;
import { encodeSummaryCacheValue, decodeSummaryCacheValue } from "../lib/summary-cache-codec";

const fixture = () => ({
  transactions: [
    { date: new Date("2026-08-01T00:00:00Z"), amount: new Decimal("1234.567890123456789") },
    { date: new Date("2026-09-04T00:00:00Z"), amount: new Decimal("89.12") },
  ],
  months: [{ month: new Date("2026-09-01T00:00:00Z"), total: 42 }],
  goals: [{ createdAt: new Date("2026-08-15T00:00:00Z"), targetAmount: new Decimal("50000.01") }],
  account: { updatedAt: new Date("2026-09-05T00:00:00Z") },
  count: 9007199254740993n,
  raw: { date: "2026-09-01", tag: ["date", "0"], missing: undefined, empty: null },
});

function assertUsable(value: ReturnType<typeof fixture>) {
  // These are the operations that crashed Reports and Goals on a warm cache.
  assert.equal([...value.transactions].sort((a, b) => b.date.getTime() - a.date.getTime())[0].date.toISOString(), "2026-09-04T00:00:00.000Z");
  assert.equal(value.months[0].month.getFullYear(), 2026);
  assert.equal(value.months[0].month.getMonth(), 8);
  assert.equal(value.transactions[1].date.getUTCDate(), 4);
  assert.equal(value.goals[0].createdAt.toISOString(), "2026-08-15T00:00:00.000Z");
  assert.equal(value.account.updatedAt.getUTCDate(), 5);
  assert.equal(value.transactions[0].amount.toFixed(15), "1234.567890123456789");
  assert.equal(value.goals[0].targetAmount.plus("0.01").toString(), "50000.02");
  assert.equal(value.count, 9007199254740993n);
  assert.deepEqual(value.raw, fixture().raw, "Raw JSON strings and tag-like data must not be reinterpreted.");
}

async function main() {
  const original = fixture();
  assertUsable(decodeSummaryCacheValue(JSON.parse(JSON.stringify(encodeSummaryCacheValue(original)))) as typeof original);
  assertUsable(original); // Encoding never mutates query results.
  assert.throws(() => {
    const oldCacheHit = JSON.parse(JSON.stringify({ date: original.transactions[0].date }));
    oldCacheHit.date.getTime();
  }, /getTime is not a function/, "Reproduce the previous JSON-cache failure.");

  // Exercise the installed Next.js unstable_cache implementation, including its
  // JSON.stringify/JSON.parse boundary. Only its storage backend is in-memory.
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "AsyncLocalStorage");
  const previousCache = Object.getOwnPropertyDescriptor(globalThis, "__incrementalCache");
  const entries = new Map<string, unknown>();
  const tags: string[][] = [];
  Object.assign(globalThis, {
    AsyncLocalStorage,
    __incrementalCache: {
      generateSimpleCacheKey: async (key: string) => key,
      get: async (key: string) => entries.has(key) ? { value: entries.get(key), isStale: false } : null,
      set: async (key: string, value: unknown, options: { tags?: string[] }) => {
        entries.set(key, JSON.parse(JSON.stringify(value)));
        tags.push(options.tags ?? []);
      },
    },
  });
  try {
    const { loadCachedWorkspaceSummary, loadCachedUserSummary } = await import("../lib/workspace-summary-cache");
    let loads = 0;
    const load = async () => { loads++; return fixture(); };
    for (const area of ["reports", "goals"] as const) {
      for (let call = 0; call < 2; call++) {
        assertUsable(await loadCachedWorkspaceSummary({ workspaceId: "demo-a", area, load }));
      }
    }
    assert.equal(loads, 2, "The second call per area must use the JSON-backed cache, not bypass it.");
    assertUsable(await loadCachedWorkspaceSummary({ workspaceId: "demo-b", area: "reports", load }));
    assert.equal(loads, 3, "Workspace results must remain isolated.");
    for (let call = 0; call < 2; call++) {
      assertUsable(await loadCachedUserSummary({ userId: "demo-user", area: "circles", load }));
    }
    assert.equal(loads, 4, "User-scoped cache hits must preserve types too.");
    assert.ok([...entries.keys()].every(key => key.includes("v2-typed")), "Old untyped entries must not be reused.");
    assert.ok(tags.some(value => value.includes("clover:workspace-summary:demo-a:reports")));
    assert.ok(tags.some(value => value.includes("clover:user-summary:demo-user:circles")));
  } finally {
    for (const [name, descriptor] of [["AsyncLocalStorage", previousStorage], ["__incrementalCache", previousCache]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
  console.log("[PASS] Reports and Goals dates, exact decimals, and scoped cache hits survive Next.js JSON persistence.");
}

void main().catch(error => { console.error(error); process.exitCode = 1; });

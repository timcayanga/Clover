import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  OfflineEngine,
  OFFLINE_MAX_AGE,
  type Transport,
} from "../../mobile/src/offline/engine";
import { LocalAllowance } from "../../mobile/src/offline/local-allowance";
import {
  FileQueue,
  type QueuedFile,
} from "../../mobile/src/offline/file-queue";
import {
  localSpending,
  suggestLocalCategory,
} from "../../mobile/src/offline/local-tools";
import { delimitedPreview } from "../../mobile/src/offline/table-preview";
import type { OfflineStore } from "../../mobile/src/offline/types";
import type { Transaction } from "../../mobile/src/types";
const cases: { name: string; run: () => Promise<void> | void }[] = [];
const test = (name: string, run: () => Promise<void> | void) =>
  cases.push({ name, run });
function memory(): OfflineStore {
  const data = new Map<string, string>();
  return {
    get: async <T>(key: string) =>
      data.has(key) ? (JSON.parse(data.get(key)!) as T) : null,
    set: async (k, v) => {
      data.set(k, JSON.stringify(v));
    },
    remove: async (k) => {
      data.delete(k);
    },
    keys: async (p) => [...data.keys()].filter((k) => k.startsWith(p)),
    clear: async () => data.clear(),
    close: async () => {},
  };
}
const auth = { profiles: [{ id: "p", name: "Personal" }] },
  version = "2026-09-14T00:00:00.000Z";
const entry = {
  accountId: "a",
  merchantRaw: "QA lunch",
  amount: "15.20",
  date: "2026-09-14",
  type: "expense",
  currency: "PHP",
};
const row = {
  id: "t",
  workspaceId: "p",
  accountId: "a",
  accountName: "Cash",
  date: "2026-09-14",
  amount: "15.20",
  currency: "PHP",
  type: "expense",
  merchantRaw: "Shop",
  merchantClean: "Shop",
  description: null,
  categoryName: "Food",
  reviewStatus: "confirmed",
  updatedAt: version,
} as Transaction;
function setup(
  handler?: (path: string, options?: RequestInit) => Promise<unknown>,
  store = memory(),
  clock = () => Date.parse(version),
) {
  const transport = (async (path: string, options?: RequestInit) =>
    path === "bootstrap"
      ? auth
      : handler
        ? handler(path, options)
        : { transaction: row }) as Transport;
  return new OfflineEngine(store, transport, randomUUID, clock);
}
async function prime(e: OfflineEngine) {
  await e.init();
  await e.request("bootstrap");
  await e.request("transactions/t?workspaceId=p");
  await e.setOnline(false);
}
test("restart preserves a queued manual transaction", async () => {
  const e = setup();
  await prime(e);
  await e.request("transactions?workspaceId=p", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  await e.dispose();
  const restored = setup(undefined, e.store);
  await restored.init();
  assert.equal(restored.status.pending, 1);
});
test("network failure after server commit retries the same operation once", async () => {
  const receipts = new Map<string, unknown>();
  let creates = 0,
    fail = true;
  const e = setup(async (path, opts) => {
    if (!path.startsWith("offline")) return { transaction: row };
    const op = JSON.parse(String(opts?.body));
    if (!receipts.has(op.id)) {
      creates++;
      receipts.set(op.id, { transaction: { ...row, id: "new" } });
    }
    if (fail) {
      fail = false;
      throw new TypeError("lost response");
    }
    return receipts.get(op.id);
  });
  await prime(e);
  await e.request("transactions?workspaceId=p", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  await e.setOnline(true);
  assert.equal(e.status.pending, 1);
  await e.setOnline(true);
  assert.equal(creates, 1);
  assert.equal(e.status.pending, 0);
});
test("concurrent sync calls share one send", async () => {
  let calls = 0;
  const e = setup(async (path) => {
    if (path.startsWith("offline")) {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
    }
    return { transaction: row };
  });
  await prime(e);
  await e.request("transactions?workspaceId=p", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  await Promise.all([e.setOnline(true), e.sync(), e.sync()]);
  assert.equal(calls, 1);
});
test("conflict pauses and explicit keep uses latest version with new ID", async () => {
  let first = true;
  const sent: any[] = [];
  const current = {
    ...row,
    updatedAt: "2026-09-14T01:00:00.000Z",
    merchantClean: "Elsewhere",
  };
  const e = setup(async (path, opts) => {
    if (!path.startsWith("offline")) return { transaction: row };
    const op = JSON.parse(String(opts?.body));
    sent.push(op);
    if (first) {
      first = false;
      throw Object.assign(new Error("changed"), {
        status: 409,
        data: { current },
      });
    }
    return {
      transaction: { ...current, merchantClean: op.payload.merchantClean },
    };
  });
  await prime(e);
  await e.request("transactions/t?workspaceId=p", {
    method: "PATCH",
    body: JSON.stringify({ merchantClean: "My edit" }),
  });
  await e.setOnline(true);
  const [p] = await e.pending();
  assert.equal(p.state, "conflict");
  assert.equal(e.status.pending, 1);
  await e.keepEdit(p.id);
  assert.equal(e.status.pending, 0);
  assert.notEqual(sent[0].id, sent[1].id);
  assert.equal(sent[1].baseVersion, current.updatedAt);
});
test("offline edits reject financial amount changes and duplicate drafts", async () => {
  const e = setup();
  await prime(e);
  await assert.rejects(
    e.request("transactions/t?workspaceId=p", {
      method: "PATCH",
      body: JSON.stringify({ amount: 100 }),
    }),
    /connection/,
  );
  await e.request("transactions/t?workspaceId=p", {
    method: "PATCH",
    body: JSON.stringify({ description: "note" }),
  });
  await assert.rejects(
    e.request("transactions/t?workspaceId=p", {
      method: "PATCH",
      body: JSON.stringify({ description: "again" }),
    }),
    /pending edit/,
  );
});
test("missing Profile and stale/rolled-back authorization fail closed", async () => {
  let now = Date.parse(version);
  const e = setup(undefined, memory(), () => now);
  await prime(e);
  await assert.rejects(e.request("home?workspaceId=other"), /Profile/);
  now += OFFLINE_MAX_AGE + 1;
  await assert.rejects(e.request("bootstrap"), /secure offline/);
  now = Date.parse(version) - 1;
  await assert.rejects(e.request("bootstrap"), /secure offline/);
});
test("401 does not fall back to cached data", async () => {
  const e = setup(async () => {
    throw Object.assign(new Error("expired"), { status: 401 });
  });
  await e.init();
  await e.request("bootstrap");
  await assert.rejects(e.request("home?workspaceId=p"), /expired/);
  await e.setOnline(false);
  await assert.rejects(e.request("bootstrap"), /secure offline/);
});
test("revoked Profile pending edits are blocked before any send", async () => {
  const store = memory();
  const e = setup(undefined, store);
  await prime(e);
  await e.request("transactions?workspaceId=p", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  let sends = 0;
  const revoked = new OfflineEngine(
    store,
    (async (path) => {
      if (path === "bootstrap") return { profiles: [] };
      sends++;
      return {};
    }) as Transport,
    randomUUID,
  );
  await revoked.init();
  await revoked.sync();
  assert.equal(sends, 0);
  assert.equal((await revoked.pending())[0].state, "blocked");
});
test("sign-out clears cache, pending financial data and grant", async () => {
  const e = setup();
  await prime(e);
  await e.request("transactions?workspaceId=p", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  await e.store.set("local-allowance", { secret: "grant" });
  await e.clear();
  assert.deepEqual(await e.store.keys(""), []);
});
test("local totals separate currencies, use exact decimals, exclude transfers", () => {
  const s = localSpending(
    {
      rows: [
        row,
        { ...row, id: "2", amount: "0.10" },
        { ...row, id: "3", amount: "100", currency: "USD" },
        { ...row, id: "4", amount: "999", type: "transfer" },
        { ...row, id: "5", amount: "999", isExcluded: true },
      ],
      total: 8,
      complete: false,
    },
    new Date(version),
  );
  assert.match(s, /PHP: income 0.00 · spending 15.30/);
  assert.match(s, /USD: income 0.00 · spending 100.00/);
  assert.match(s, /Partial history/);
  assert.doesNotMatch(s, /999/);
});
test("category suggestions need consistent confirmed exact merchant evidence", () => {
  assert.equal(suggestLocalCategory("Shop", [row]), null);
  assert.equal(
    suggestLocalCategory("Shop", [row, { ...row, id: "2" }])?.confidence,
    85,
  );
  assert.equal(
    suggestLocalCategory("Shop", [
      row,
      { ...row, id: "2", categoryName: "Travel" },
    ]),
    null,
  );
});
test("local allowance is serialized, persists restart and refuses extra inference", async () => {
  const store = memory(),
    a = new LocalAllowance(store, () => Date.parse(version));
  await a.save({
    grant: {
      id: "g",
      issued: 1,
      used: 0,
      issuedAt: version,
      expiresAt: "2026-10-01T00:00:00Z",
    },
    monthlyLimit: 50,
    resetsAt: "2026-10-01",
    serverTime: version,
  });
  let runs = 0;
  const result = await Promise.allSettled([
    a.use(async () => ++runs),
    a.use(async () => ++runs),
  ]);
  assert.equal(runs, 1);
  assert.equal(result.filter((r) => r.status === "rejected").length, 1);
  const restarted = new LocalAllowance(store, () => Date.parse(version));
  await assert.rejects(
    restarted.use(async () => ++runs),
    /allowance/,
  );
});
test("failed inference refunds a request and expiry blocks requests", async () => {
  const store = memory(),
    a = new LocalAllowance(store, () => Date.parse(version));
  await a.save({
    grant: {
      id: "g",
      issued: 1,
      used: 0,
      issuedAt: version,
      expiresAt: "2026-10-01T00:00:00Z",
    },
    monthlyLimit: 50,
    resetsAt: "2026-10-01",
    serverTime: version,
  });
  await assert.rejects(
    a.use(async () => {
      throw new Error("model unavailable");
    }),
  );
  assert.equal((await a.get())?.grant?.used, 0);
  await assert.rejects(
    new LocalAllowance(store, () => Date.parse("2026-10-01")).use(
      async () => 1,
    ),
    /allowance/,
  );
});
test("allowance refresh cannot roll back local usage", async () => {
  const store = memory(),
    a = new LocalAllowance(store, () => Date.parse(version));
  const v = {
    grant: {
      id: "g",
      issued: 10,
      used: 4,
      issuedAt: version,
      expiresAt: "2026-10-01T00:00:00Z",
    },
    monthlyLimit: 50,
    resetsAt: "2026-10-01",
    serverTime: version,
  };
  await a.save(v);
  await a.save({ ...v, grant: { ...v.grant, used: 0 } });
  assert.equal((await a.get())?.grant?.used, 4);
});
const file: QueuedFile = {
  id: randomUUID(),
  workspaceId: "p",
  name: "test.csv",
  mimeType: "text/csv",
  size: 20,
  createdAt: version,
  state: "draft",
};
test("queued file restarts with original bytes and never auto-uploads a draft", async () => {
  const store = memory();
  let uploads = 0;
  const transport = {
    status: async () => {
      throw Object.assign(new Error("missing"), { status: 404 });
    },
    upload: async () => {
      uploads++;
      return {};
    },
  };
  const q = new FileQueue(store, transport, async () => {});
  await q.add(file, "b3JpZ2luYWw=");
  await q.flush();
  assert.equal(uploads, 0);
  await q.close();
  const restored = new FileQueue(store, transport, async () => {});
  assert.equal(await restored.bytes(file), "b3JpZ2luYWw=");
  await restored.enqueue(file.id);
  await restored.flush();
  assert.equal(uploads, 1);
  assert.equal((await restored.list())[0].state, "processing");
  await assert.rejects(restored.bytes(file), /no longer/);
});
test("ambiguous file upload recovers by status without resending original", async () => {
  let exists = false,
    uploads = 0;
  const q = new FileQueue(
    memory(),
    {
      status: async () => {
        if (!exists) throw Object.assign(new Error("missing"), { status: 404 });
        return { done: true, failed: false };
      },
      upload: async () => {
        uploads++;
        exists = true;
        throw new Error("response lost");
      },
    },
    async () => {},
  );
  await q.add(file, "b3JpZ2luYWw=");
  await q.enqueue(file.id);
  await q.flush();
  assert.equal((await q.list())[0].state, "sending");
  assert.equal(await q.bytes(file), "b3JpZ2luYWw=");
  await q.flush();
  assert.equal(uploads, 1);
  assert.equal((await q.list())[0].state, "done");
});
test("delimited preview preserves quotes, multiline cells and source signs", () => {
  const result = delimitedPreview(
    '\ufeffsep=;\nDate;Description;Amount\n2026-09-14;"Shop; \\""A\\""\nsecond line";-1.00'.replace(
      /\\/g,
      "",
    ),
  );
  assert.match(result, /Amount: -1.00/);
  assert.match(result, /second line/);
  assert.match(result, /no transactions are confirmed/);
});
test("ambiguous table/encoding fails closed", () => {
  assert.throws(
    () => delimitedPreview('Date,Description,Amount\n2026-09-14,"unfinished,1'),
    /unfinished/,
  );
  assert.throws(
    () => delimitedPreview("Date,Description,Amount\n2026-09-14,Shop,1,2"),
    /inconsistent/,
  );
  assert.throws(
    () => delimitedPreview("Date\0,Description,Amount"),
    /encoding/,
  );
});
test("server wipe epoch removes cached financial data and queued sources", async () => {
  const store = memory(),
    e = setup(undefined, store);
  await prime(e);
  await e.request("transactions?workspaceId=p", {
    method: "POST",
    body: JSON.stringify(entry),
  });
  await store.set("file:old", { id: "old" });
  await store.set("file-bytes:old", "private");
  let sends = 0;
  const afterWipe = new OfflineEngine(
    store,
    (async (path) => {
      if (path === "bootstrap")
        return { ...auth, offlineEpoch: "2026-09-14T02:00:00.000Z" };
      sends++;
      return {};
    }) as Transport,
    randomUUID,
  );
  await afterWipe.init();
  await afterWipe.sync();
  assert.equal(sends, 0);
  assert.equal(afterWipe.status.pending, 0);
  assert.equal(await store.get("file-bytes:old"), null);
  assert.equal(await store.get("cache:transactions/t?workspaceId=p"), null);
});
test("Adviser uses an explicit dated snapshot, independent of cached list pages", async () => {
  const e = setup();
  await prime(e);
  assert.equal((await e.downloadedTransactions("p")).complete, false);
  await e.saveDownloadedHistory("p", [row], 2);
  const history = await e.downloadedTransactions("p");
  assert.equal(history.complete, false);
  assert.equal(history.rows.length, 1);
  assert.equal(history.downloadedAt, version);
  await e.saveDownloadedHistory("p", [], 0);
  assert.equal((await e.downloadedTransactions("p")).complete, true);
});

(async () => {
  let failures = 0;
  for (const c of cases) {
    try {
      await c.run();
      console.log("PASS", c.name);
    } catch (e) {
      failures++;
      console.error("FAIL", c.name, e);
    }
  }
  console.log(
    `${cases.length - failures}/${cases.length} offline checks passed`,
  );
  process.exitCode = failures ? 1 : 0;
})();

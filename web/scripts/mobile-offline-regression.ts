import { createScreenDataLoader, registerScreenRefresh, refreshScreen } from "../../mobile/src/screen-refresh";
import { uploadProgress } from "../../mobile/src/offline/upload-progress";
import { normalizeDeviceTextEvidence } from "../../shared/device-text-evidence";
import { boundedDeviceText, uploadInParts } from "../../mobile/src/offline/resumable-upload";
import { nativeImportIsComplete, needsNativeImportResume } from "../../shared/native-import-status";
import { uploadSizeProblem, IMPORT_PHOTO_MAX_SIZE, NATIVE_UPLOAD_MAX_SIZE, NATIVE_UPLOAD_PART_SIZE } from "../../shared/native-upload";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NetworkError } from "../../mobile/src/api";
import {
  OfflineEngine,
  OFFLINE_MAX_AGE,
  type Transport,
} from "../../mobile/src/offline/engine";
import { LocalModelQueue } from "../../mobile/src/offline/local-model-queue";
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
test("a transient timeout can reconnect and replace stale downloaded data", async () => {
  let failing = false;
  let amount = "15.20";
  const e = setup(async () => {
    if (failing) throw new NetworkError("Timed out");
    return { transactions: [{ ...row, amount }] };
  });
  await e.setOnline(true);
  const path = "transactions?workspaceId=p";
  await e.request(path);
  failing = true;
  const cached = await e.request<{ transactions: Transaction[] }>(path);
  assert.equal(cached.transactions[0].amount, "15.20");
  assert.equal(e.status.online, true, "A request timeout does not mean the device lost connectivity");
  failing = false;
  amount = "19.75";
  const fresh = await e.request<{ transactions: Transaction[] }>(path);
  assert.equal(fresh.transactions[0].amount, "19.75");
  assert.equal(e.status.online, true);
});
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
test("online financial edits use the authenticated API without entering the offline queue", async () => {
  let edits = 0;
  const e = setup(async (_path, options) => {
    if (options?.method === "PATCH") {
      edits++;
      assert.deepEqual(JSON.parse(String(options.body)), {amount:"30"});
      return {transaction:{...row,amount:"30"}};
    }
    return {transaction:row};
  });
  await prime(e);
  await e.setOnline(true);
  const result = await e.request<{transaction:Transaction}>("transactions/t?workspaceId=p", {method:"PATCH",body:JSON.stringify({amount:"30"})});
  assert.equal(result.transaction.amount,"30");
  assert.equal(edits,1);
  assert.equal((await e.pending()).length,0);
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
test("device inference works without cloud grants and serializes model access", async () => {
  const queue = new LocalModelQueue();
  let active = 0, maximum = 0;
  const results = await Promise.all([1, 2, 3].map(value => queue.use(async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return value;
  })));
  assert.deepEqual(results, [1, 2, 3]);
  assert.equal(maximum, 1);
  assert.equal(await new LocalModelQueue().use(async () => "after restart"), "after restart");
});
test("device generation failures are surfaced once and do not block the next task", async () => {
  const queue = new LocalModelQueue();
  let attempts = 0;
  await assert.rejects(queue.use(async () => { attempts++; throw new Error("OS rate limit"); }), /OS rate limit/);
  assert.equal(attempts, 1);
  assert.equal(await queue.use(async () => "ready"), "ready");
});
const file: QueuedFile = {
  id: randomUUID(),
  workspaceId: "p",
  name: "test.csv",
  mimeType: "text/csv",
  size: 8,
  createdAt: version,
  state: "draft",
};
test("photo limits accept 10 MB, reject larger photos, and preserve document limits", () => {
  for (const [name, mime] of [["receipt.HEIC", "application/octet-stream"], ["camera", "image/jpeg"], ["receipt.png", "image/png"]]) {
    assert.equal(uploadSizeProblem(name, mime, IMPORT_PHOTO_MAX_SIZE), null);
    assert.match(uploadSizeProblem(name, mime, IMPORT_PHOTO_MAX_SIZE + 1)!, /10 MB/);
  }
  assert.equal(uploadSizeProblem("statement.pdf", "application/pdf", NATIVE_UPLOAD_MAX_SIZE), null);
  assert.match(uploadSizeProblem("statement.pdf", "application/pdf", NATIVE_UPLOAD_MAX_SIZE + 1)!, /25 MB/);
});
test("import completion waits for the focused transaction refresh and releases unfocused loaders", async () => {
  let release!: () => void;
  let visibleRows: string[] = [];
  let completed = false;
  const savedRows = ["receipt-1"];
  const stop = registerScreenRefresh("/transactions", async () => {
    await new Promise<void>(resolve => { release = resolve; });
    visibleRows = savedRows;
    return true;
  });
  const refresh = refreshScreen("/transactions").then(result => { completed = result; });
  await Promise.resolve();
  assert.equal(completed, false, "100% must not precede the page refresh.");
  release(); await refresh;
  assert.equal(completed, true);
  assert.deepEqual(visibleRows, savedRows);
  stop();
  const failed = registerScreenRefresh("/transactions", async () => false);
  assert.equal(await refreshScreen("/transactions"), false, "A failed page refresh must remain distinguishable from durable import success.");
  failed();
  assert.equal(await refreshScreen("/transactions"), true, "Unmounted pages leave no stale loaders.");
});
test("import refresh follows a replacement filter or focus loader before completing", async () => {
  let releaseOld!: () => void;
  let releaseCurrent!: () => void;
  let visibleRows: string[] = [];
  let completed = false;
  const stopOld = registerScreenRefresh("/transactions", async () => {
    await new Promise<void>(resolve => { releaseOld = resolve; });
    return false; // The old transaction request was superseded.
  });
  const refresh = refreshScreen("/transactions").then(result => { completed = result; });
  await Promise.resolve();
  stopOld();
  const stopCurrent = registerScreenRefresh("/transactions", async () => {
    await new Promise<void>(resolve => { releaseCurrent = resolve; });
    visibleRows = ["receipt-in-current-filter"];
    return true;
  });
  releaseOld();
  while (!releaseCurrent) await Promise.resolve();
  assert.equal(completed, false, "Discarding the old request must not release 100% while the new query is pending.");
  releaseCurrent(); await refresh;
  assert.equal(completed, true);
  assert.deepEqual(visibleRows, ["receipt-in-current-filter"]);
  stopCurrent();
});
test("account refresh waits for applied balances and reports rejection or discarded responses", async () => {
  let resolve!: (data: { accounts: string[] }) => void;
  let reject!: (error: Error) => void;
  let visibleAccounts = ["old-bank"];
  let active = true, error = "", completed = false;
  const load = createScreenDataLoader({
    load: () => new Promise<{accounts:string[]} >((done, fail) => { resolve = done; reject = fail; }),
    active: () => active,
    apply: data => { visibleAccounts = data.accounts; },
    error: value => { error = (value as Error).message; },
  });
  const stop = registerScreenRefresh("/accounts", load);
  const refresh = refreshScreen("/accounts").then(result => { completed = result; });
  await Promise.resolve();
  assert.equal(completed, false);
  assert.deepEqual(visibleAccounts, ["old-bank"]);
  resolve({accounts:["updated-bank"]}); await refresh;
  assert.equal(completed, true);
  assert.deepEqual(visibleAccounts, ["updated-bank"]);
  const failed = refreshScreen("/accounts"); await Promise.resolve();
  reject(new Error("Account balances could not load"));
  assert.equal(await failed, false);
  assert.equal(error, "Account balances could not load");
  const stale = load();
  const releaseStale = resolve;
  const latest = load();
  releaseStale({accounts:["stale-bank"]});
  assert.equal(await stale, false);
  assert.deepEqual(visibleAccounts, ["updated-bank"]);
  resolve({accounts:["newest-bank"]}); assert.equal(await latest, true);
  const unfocused = load(); active = false;
  resolve({accounts:["unfocused-bank"]}); assert.equal(await unfocused, false);
  assert.deepEqual(visibleAccounts, ["newest-bank"]);
  stop();
});
test("partial quote refresh applies valid values in the current scope but reports incomplete refresh", async () => {
  let visible = { scope: "old-profile", values: { old: 999 } as Record<string, number> };
  const refresh = createScreenDataLoader({
    load: async () => ({ scope: "current-profile", values: { successful: 150 }, complete: false }),
    active: () => true,
    apply: result => { visible = { scope: result.scope, values: result.values }; return result.complete; },
    error: () => assert.fail("Per-quote failures must not discard successful quotes"),
  });
  assert.equal(await refresh(), false);
  assert.deepEqual(visible, { scope: "current-profile", values: { successful: 150 } });
});
test("native completion waits for committed visible data and account projections", () => {
  assert.equal(nativeImportIsComplete({}), false);
  assert.equal(nativeImportIsComplete({ visibleImportComplete: false, settledImportComplete: false }), false);
  assert.equal(nativeImportIsComplete({ visibleImportComplete: true, settledImportComplete: false }), false);
  assert.equal(nativeImportIsComplete({ visibleImportComplete: true, settledImportComplete: true }), true);
  assert.equal(nativeImportIsComplete({ visibleImportComplete: true }), true, "Older server visibility signals remain supported.");
});
test("native recovery only resumes a server-approved checkpoint", () => {
  const status = { importFile: { status: "failed", processingPhase: "queued_retry" }, canResume: true };
  assert.equal(needsNativeImportResume(status), true);
  assert.equal(needsNativeImportResume({ ...status, canResume: false }), false);
  assert.equal(needsNativeImportResume({ ...status, visibleImportComplete: true }), false);
  assert.equal(needsNativeImportResume({ ...status, importFile: { status: "done" } }), false);
  assert.equal(needsNativeImportResume({ importFile: { status: "processing" }, statementSelfHeal: { reason: "stale_statement_image_queue" } }), true);
  assert.equal(needsNativeImportResume({ importFile: { status: "failed", processingPhase: "password_required" }, canResume: true }), false);
});
test("status preserves actionable errors, monotonic progress, and review recovery without resending", async () => {
  let status = { done: false, failed: false, progress: 75, message: "Reading receipt", canResume: false };
  let uploads = 0;
  const q = new FileQueue(memory(), { status: async () => status, upload: async () => { uploads++; return {}; } }, async () => {});
  await q.add(file, "b3JpZ2luYWw="); await q.enqueue(file.id); await q.flush();
  status = { done: false, failed: true, progress: 25, message: "This statement needs its password.", canResume: true };
  await q.flush();
  const failed = (await q.list())[0];
  assert.equal(failed.state, "attention"); assert.equal(failed.error, status.message);
  assert.equal(failed.canResume, true); assert.equal(failed.progress, 75);
  status = { done: true, failed: false, progress: 100, message: "Ready to review", canResume: false };
  await q.enqueue(file.id); await q.flush();
  assert.equal((await q.list())[0].state, "done"); assert.equal(uploads, 0);
});
test("missing acknowledged imports never re-upload a duplicate source", async () => {
  const store = memory(); let exists = true, uploads = 0;
  const q = new FileQueue(store, { status: async () => { if (!exists) throw Object.assign(new Error("missing"), {status:404}); return {done:false,failed:false}; }, upload: async () => {uploads++; return {};} }, async () => {});
  await q.add(file, "b3JpZ2luYWw="); await q.enqueue(file.id); await q.flush(); exists = false;
  await q.flush(); assert.equal(uploads, 0); assert.equal((await q.list())[0].state, "attention");
});
test("transfer completion never claims parsing and saving are finished", () => {
  for (const state of ["sending", "finalizing", "processing", "attention", "paused"] as const) {
    assert.ok(uploadProgress({state,size:100,sentBytes:100,progress:100}) < 100);
  }
  assert.equal(uploadProgress({state:"finalizing",size:100,sentBytes:100}),45);
  assert.equal(uploadProgress({state:"done",size:100,sentBytes:100}),100);
  assert.equal(uploadProgress({state:"sending",size:0,sentBytes:0,progress:NaN}),0);
});
test("wrong then correct PDF password retries the same completed parts without re-uploading", async () => {
  const store = memory(); let received = false, unlocked = false, uploads = 0, unlocks = 0;
  const passwordError = () => Object.assign(new Error("This file is password-protected. Enter the password to continue."), {status:422,data:{code:"IMPORT_PASSWORD_REQUIRED"}});
  const q = new FileQueue(store, {
    status: async () => {
      if (!received) throw Object.assign(new Error("missing"), {status:404});
      return {done:unlocked,failed:!unlocked,needsPassword:!unlocked,message:unlocked ? "Records ready" : "Enter the statement password."};
    },
    upload: async () => {uploads++;received=true;throw passwordError();},
    unlock: async (_file,password) => {unlocks++;if(password!=="fictional-correct-password")throw passwordError();unlocked=true;return {canonicalId:file.id};},
  },async()=>{});
  await q.add(file,"b3JpZ2luYWw="); await q.enqueue(file.id); await q.flush();
  assert.equal((await q.list())[0].needsPassword,true);
  assert.equal(await q.bytes(file),"b3JpZ2luYWw=");
  await q.enqueue(file.id,"fictional-wrong-password"); await q.flush();
  assert.equal((await q.list())[0].state,"attention");
  assert.equal((await q.list())[0].password,undefined,"Rejected passwords must be discarded");
  await q.flush(); assert.equal(unlocks,1,"Wrong passwords must not retry in a loop");
  await q.enqueue(file.id,"fictional-correct-password"); await q.flush();
  assert.equal(uploads,1); assert.equal(unlocks,2); assert.equal((await q.list())[0].state,"processing");
  assert.equal((await q.list())[0].password,undefined);
  await assert.rejects(q.bytes(file),/no longer/);
  await q.flush(); assert.equal((await q.list())[0].state,"done");
});
test("a password requested after server acknowledgement can unlock without device bytes", async () => {
  let passwordRequired=false, unlocks=0;
  const q = new FileQueue(memory(),{
    status:async()=>({done:false,failed:passwordRequired,needsPassword:passwordRequired}),
    upload:async()=>{throw new Error("must not re-upload");},
    unlock:async(_file,password)=>{assert.equal(password,"fictional-password");unlocks++;passwordRequired=false;return {};},
  },async()=>{});
  await q.add(file,"b3JpZ2luYWw=");await q.enqueue(file.id);await q.flush();passwordRequired=true;
  await q.flush();assert.equal((await q.list())[0].state,"attention");await assert.rejects(q.bytes(file),/no longer/);
  await q.enqueue(file.id,"fictional-password");await q.flush();assert.equal(unlocks,1);assert.equal((await q.list())[0].state,"processing");
});
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

test("resumable transport sends only missing parts and preserves exact bytes",async()=>{
  const bytes=Buffer.alloc(NATIVE_UPLOAD_PART_SIZE*2+17,42), sent:number[]=[], received:Buffer[]=[];
  const request=async<T>(path:string,options?:RequestInit):Promise<T>=>{
    const body=JSON.parse(String(options?.body));
    if(path.includes("/start"))return {parts:[0],state:"uploading"} as T;
    if(path.includes("/part")){sent.push(body.index);received.push(Buffer.from(body.base64,"base64"));return {ok:true} as T;}
    assert.equal(body.importMode,"receipt");
    return {canonicalImportFileId:"canonical"} as T;
  };
  const progress:number[]=[];
  const result=await uploadInParts(request,{...file,importMode:"receipt",size:bytes.length},bytes.toString("base64"),{signal:new AbortController().signal,progress:async(n)=>{progress.push(n);}});
  assert.deepEqual(sent,[1,2]);assert.deepEqual(Buffer.concat(received),bytes.subarray(NATIVE_UPLOAD_PART_SIZE));assert.equal(progress.at(-1),bytes.length);assert.equal(result.canonicalId,"canonical");
});
test("device OCR evidence is bounded, normalized and never accepts financial rows", () => {
  const evidence = {version:1,source:"apple_vision",text:"  SHOP\nTOTAL 125.00  ",pagesRead:1,totalPages:1,complete:true,durationMs:650,confirmedTransactions:[{amount:999}]};
  assert.deepEqual(normalizeDeviceTextEvidence(evidence), {version:1,source:"apple_vision",text:"SHOP\nTOTAL 125.00",pagesRead:1,totalPages:1,complete:true,durationMs:650});
  for (const changes of [{version:2},{source:"cloud"},{text:"x".repeat(40001)},{text:"   "},{durationMs:-1},{totalPages:0},{pagesRead:2}]) {
    assert.equal(normalizeDeviceTextEvidence({...evidence,...changes}), null);
  }
  assert.equal(normalizeDeviceTextEvidence({...evidence,pagesRead:1,totalPages:2})?.complete,false);
});
test("native upload reads OCR concurrently, forwards it only on completion and reuses saved evidence", async () => {
  const evidence={version:1 as const,source:"google_mlkit" as const,text:"COFFEE\nTOTAL 425.00",pagesRead:1,totalPages:1,complete:true,durationMs:20};
  let release!:(value:typeof evidence)=>void, started=false, reads=0, completeBody:any;
  const reading=new Promise<typeof evidence>(resolve=>{release=resolve;});
  const photo={...file,name:"receipt.jpg",mimeType:"image/jpeg"};
  const request=async<T>(path:string,options?:RequestInit):Promise<T>=>{
    const body=JSON.parse(String(options?.body));
    if(path.includes("/start")){await Promise.resolve();assert.equal(started,true);assert.equal(body.deviceText,undefined);return {parts:[],state:"uploading"} as T;}
    if(path.includes("/part")){release(evidence);return {ok:true} as T;}
    completeBody=body;return {canonicalImportFileId:"canonical"} as T;
  };
  const control={signal:new AbortController().signal,progress:async()=>{},saveDeviceText:async(value:typeof evidence)=>{photo.deviceText=value;}};
  const read=async()=>{started=true;reads++;return reading;};
  await uploadInParts(request,photo,"b3JpZ2luYWw=",control,read);
  assert.deepEqual(completeBody.deviceText,evidence);assert.deepEqual(photo.deviceText,evidence);
  await uploadInParts(request,photo,"b3JpZ2luYWw=",control,read);
  assert.equal(reads,1,"A transfer retry must not repeat device OCR");
});
test("slow or failed device OCR cannot block uploading the original", async () => {
  assert.equal(await boundedDeviceText(new Promise(()=>{}),5),undefined);
  assert.equal(await boundedDeviceText(Promise.reject(new Error("OCR unavailable")),5),undefined);
  let completed=false;
  const request=async<T>(path:string,options?:RequestInit):Promise<T>=>{
    if(path.includes("/start"))return {parts:[],state:"uploading"} as T;
    if(path.includes("/complete")){completed=true;assert.equal(JSON.parse(String(options?.body)).deviceText,undefined);}
    return {} as T;
  };
  await uploadInParts(request,file,"b3JpZ2luYWw=",{signal:new AbortController().signal,progress:async()=>{}},async()=>{throw new Error("unsupported");});
  assert.equal(completed,true);
});
test("pause aborts the active transfer, retains original bytes, and requires explicit resume",async()=>{
  const store=memory();let started!:()=>void;const began=new Promise<void>(r=>{started=r;});
  const q=new FileQueue(store,{status:async()=>{throw Object.assign(new Error("missing"),{status:404});},upload:async(_file,_bytes,control)=>{started();await new Promise<void>((_,reject)=>control.signal.addEventListener("abort",()=>reject(new Error("aborted")),{once:true}));return {};},cancel:async()=>{}},async()=>{});
  await q.add(file,"b3JpZ2luYWw=");await q.enqueue(file.id);const flight=q.flush();await began;await q.pause(file.id);await flight;
  assert.equal((await q.list())[0].state,"paused");assert.equal(await q.bytes(file),"b3JpZ2luYWw=");await q.flush();assert.equal((await q.list())[0].state,"paused");await q.cancel(file.id);assert.deepEqual(await q.list(),[]);
});
test("finalizing cannot be cancelled as if it were still a file transfer",async()=>{
  const store=memory();let finish!:()=>void,ready!:()=>void;const reached=new Promise<void>(r=>{ready=r;});
  const q=new FileQueue(store,{status:async()=>{throw Object.assign(new Error("missing"),{status:404});},upload:async(_file,_bytes,control)=>{await control.progress(file.size,true);ready();await new Promise<void>(r=>{finish=r;});return {}; }},async()=>{});
  await q.add(file,"b3JpZ2luYWw=");await q.enqueue(file.id);const flight=q.flush();await reached;await assert.rejects(q.cancel(file.id),/Cancel is unavailable/);finish();await flight;assert.equal((await q.list())[0].state,"processing");await assert.rejects(q.bytes(file),/no longer/);
});

test("server pause survives a late finalize response and resumes explicitly",async()=>{
  const store=memory();let finish!:()=>void,ready!:()=>void,uploaded=false;const reached=new Promise<void>(r=>{ready=r;});const actions:string[]=[];
  const q=new FileQueue(store,{status:async()=>{if(uploaded)return {done:false,failed:false};throw Object.assign(new Error("missing"),{status:404});},control:async(_file,action)=>{actions.push(action);},upload:async(_file,_bytes,control)=>{await control.progress(file.size,true);ready();await new Promise<void>(r=>{finish=r;});uploaded=true;return {canonicalId:"saved-import"};}},async()=>{});
  await q.add(file,"b3JpZ2luYWw=");await q.enqueue(file.id);const flight=q.flush();await reached;await q.pause(file.id);finish();await flight;
  assert.equal((await q.list())[0].state,"paused");assert.equal((await q.list())[0].serverPaused,true);assert.equal((await q.list())[0].canonicalId,"saved-import");
  await q.enqueue(file.id);await q.flush();assert.deepEqual(actions,["pause","resume"]);assert.equal((await q.list())[0].state,"processing");
});
test("server cancellation is acknowledged before local removal and late finalize cannot restore the file",async()=>{
  const store=memory();let finish!:()=>void,ready!:()=>void;const reached=new Promise<void>(r=>{ready=r;});const actions:string[]=[];
  const q=new FileQueue(store,{status:async()=>{throw Object.assign(new Error("missing"),{status:404});},control:async(_file,action)=>{actions.push(action);assert.equal((await q.list()).length,1);},upload:async(_file,_bytes,control)=>{await control.progress(file.size,true);ready();await new Promise<void>(r=>{finish=r;});return {canonicalId:"saved-import"};}},async()=>{});
  await q.add(file,"b3JpZ2luYWw=");await q.enqueue(file.id);const flight=q.flush();await reached;await q.cancel(file.id);assert.deepEqual(await q.list(),[]);finish();await flight;
  assert.deepEqual(actions,["cancel"]);assert.deepEqual(await q.list(),[]);await assert.rejects(q.bytes(file),/no longer/);
});
test("failed server cancellation preserves the import and its source",async()=>{
  const store=memory();const q=new FileQueue(store,{status:async()=>({done:false,failed:false}),control:async()=>{throw new Error("offline");},upload:async()=>({})},async()=>{});
  await q.add({...file,state:"processing"},"b3JpZ2luYWw=");await assert.rejects(q.cancel(file.id),/offline/);assert.equal((await q.list())[0].state,"processing");assert.equal(await q.bytes(file),"b3JpZ2luYWw=");
});

test("pausing a waiting file prevents a stale queue snapshot from uploading it",async()=>{
  const store=memory();let release!:()=>void,started!:()=>void;const began=new Promise<void>(r=>{started=r;});const sent:string[]=[];
  const q=new FileQueue(store,{status:async()=>{throw Object.assign(new Error("missing"),{status:404});},upload:async(f)=>{sent.push(f.id);started();await new Promise<void>(r=>{release=r;});return {};},cancel:async()=>{}},async()=>{});
  const second={...file,id:randomUUID(),createdAt:"2026-09-15T00:00:00.000Z"};
  await q.add(file,"b3JpZ2luYWw=");await q.add(second,"b3JpZ2luYWw=");await q.enqueue(file.id);await q.enqueue(second.id);const flight=q.flush();await began;await q.pause(second.id);release();await flight;
  assert.deepEqual(sent,[file.id]);assert.equal((await q.list()).find(f=>f.id===second.id)?.state,"paused");
});


test("pausing one active upload lets other queued files continue",async()=>{
  const store=memory();let started!:()=>void;const began=new Promise<void>(r=>{started=r;});const sent:string[]=[];
  const second={...file,id:randomUUID(),createdAt:"2026-09-15T00:00:00.000Z"};
  const q=new FileQueue(store,{status:async()=>{throw Object.assign(new Error("missing"),{status:404});},upload:async(f,_bytes,control)=>{sent.push(f.id);if(f.id===file.id){started();await new Promise<void>((_,reject)=>control.signal.addEventListener("abort",()=>reject(new Error("aborted")),{once:true}));}return {}; }},async()=>{});
  await q.add(file,"b3JpZ2luYWw=");await q.add(second,"b3JpZ2luYWw=");await q.enqueue(file.id);await q.enqueue(second.id);const flight=q.flush();await began;await q.pause(file.id);await flight;
  assert.deepEqual(sent,[file.id,second.id]);assert.equal((await q.list()).find(f=>f.id===file.id)?.state,"paused");assert.equal((await q.list()).find(f=>f.id===second.id)?.state,"processing");
});

test("a flush requested during an upload also drains a newly queued file",async()=>{
  const store=memory();let release!:()=>void,started!:()=>void;
  const began=new Promise<void>(resolve=>{started=resolve;});const sent:string[]=[];
  const q=new FileQueue(store,{status:async(f)=>{if(sent.includes(f.id))return {done:false,failed:false};throw Object.assign(new Error("missing"),{status:404});},upload:async(f)=>{
    sent.push(f.id);if(f.id===file.id){started();await new Promise<void>(resolve=>{release=resolve;});}return {};
  }},async()=>{});
  await q.add(file,"b3JpZ2luYWw=");await q.enqueue(file.id);const flight=q.flush();await began;
  const second={...file,id:randomUUID(),createdAt:"2026-09-15T00:00:00.000Z"};
  await q.add(second,"b3JpZ2luYWw=");await q.enqueue(second.id);const followup=q.flush();release();
  await Promise.all([flight,followup]);assert.ok(sent.includes(second.id),"The follow-up flush must not be lost behind the active request");
});

test("presentation cache hydrates recent authorized Profile data and excludes invalidated reads", async () => {
  let now = Date.parse(version);
  const e = setup(async () => ({ accounts: [{ id: "a", balance: "10" }] }), memory(), () => now);
  await e.init(); await e.request("bootstrap");
  await e.request("accounts?workspaceId=p");
  assert.equal((await e.presentationCache("p")).length, 1);
  await assert.rejects(() => e.presentationCache("other"), /not available offline/);
  now += 300001;
  assert.equal((await e.presentationCache("p")).length, 0);
  await e.request("accounts?workspaceId=p");
  now++;
  await e.request("settings/preferences", { method: "PATCH", body: "{}" });
  assert.equal((await e.presentationCache("p")).length, 0);
  now++;
  await e.request("accounts?workspaceId=p");
  assert.equal((await e.presentationCache("p")).length, 1);
  await e.clear();
  await assert.rejects(() => e.presentationCache("p"), /refresh your secure offline access/);
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

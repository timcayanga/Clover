import { PageCache } from "../../mobile/src/page-cache";
import { importCommitAgeMs, importPollTimings } from "../../shared/import-commit-timing";
import { tryRunLocalOcr } from "../../mobile/src/offline/local-ocr-slot";
import { beginFirstReceiptScan, reportFirstReceiptOutcome } from "../../shared/receipt-first-attempt";
import { setTelemetrySink } from "../../shared/analytics";
import { createScreenDataLoader, registerScreenRefresh, refreshScreen } from "../../mobile/src/screen-refresh";
import { uploadProgress } from "../../mobile/src/offline/upload-progress";
import { hasUsefulPartialReceiptText, normalizeDeviceTextEvidence } from "../../shared/device-text-evidence";
import { boundedDeviceText, DEVICE_OCR_FINALIZE_WAIT_MS, uploadInParts } from "../../mobile/src/offline/resumable-upload";
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
  type FileTransport,
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
test("photo limits accept 25 MB, reject larger photos, and preserve document limits", () => {
  for (const [name, mime] of [["receipt.HEIC", "application/octet-stream"], ["camera", "image/jpeg"], ["receipt.png", "image/png"]]) {
    assert.equal(uploadSizeProblem(name, mime, IMPORT_PHOTO_MAX_SIZE), null);
    assert.match(uploadSizeProblem(name, mime, IMPORT_PHOTO_MAX_SIZE + 1)!, /25 MB/);
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
  const store = memory(); let received = false, unlocked = false, uploads = 0, unlocks = 0, statusChecks = 0;
  const passwordError = () => Object.assign(new Error("This file is password-protected. Enter the password to continue."), {status:422,data:{code:"IMPORT_PASSWORD_REQUIRED"}});
  const q = new FileQueue(store, {
    status: async () => {
      statusChecks++;
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
  assert.equal(statusChecks, 1, "Both unlocks should skip a redundant status round trip");
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
test("statement preview uses the header below the export title", () => {
  for (const delimiter of ["\t", ";", "|"]) {
    const text = ["Activity report, November", ["Date", "Description", "Amount"].join(delimiter),
      ["2026-11-19", "Cafe", "-12.50"].join(delimiter)].join("\n");
    assert.match(delimitedPreview(text), /Amount: -12.50/);
  }
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
test("chunked uploads resume from encrypted parts and clean up after acknowledgement", async () => {
  const store = memory();
  const selected = { ...file, name: "large.pdf", mimeType: "application/pdf", size: NATIVE_UPLOAD_PART_SIZE * 2 + 17 };
  const storedParts: number[] = [];
  const get = store.get.bind(store);
  store.get = async <T,>(key: string) => {
    if (key.includes(":part:")) storedParts.push(Number(key.split(":").at(-1)));
    return get<T>(key);
  };
  const seenParts: number[] = [];
  const transport: FileTransport = {
    status: async () => { throw Object.assign(new Error("Missing"), { status: 404 }); },
    upload: (item, source, control) => uploadInParts(async <T,>(path: string, options?: RequestInit) => {
      if (path.includes("/start")) return { parts: [0], state: "uploading" } as T;
      if (path.includes("/part")) {
        const { index, base64 } = JSON.parse(String(options?.body));
        seenParts.push(index);
        assert.deepEqual(Buffer.from(base64, "base64"), Buffer.alloc(index === 1 ? NATIVE_UPLOAD_PART_SIZE : 17, index));
      }
      return { canonicalImportFileId: selected.id } as T;
    }, item, source, control),
  };
  const queue = new FileQueue(store, transport, async () => {});
  const firstRead: number[] = [];
  await queue.add(selected, async index => {
    firstRead.push(index);
    return Buffer.alloc(index === 2 ? 17 : NATIVE_UPLOAD_PART_SIZE, index).toString("base64");
  });
  assert.deepEqual(firstRead, [0, 1, 2]);
  assert.equal(await get("file-bytes:" + file.id), null, "Chunked uploads never create a whole-file record");
  const reopened = new FileQueue(store, transport, async () => {});
  await store.set("file-bytes:orphan:part:0", "AAAA");
  await reopened.pruneUnreferencedSources();
  assert.equal(await get("file-bytes:orphan:part:0"), null);
  await reopened.enqueue(selected.id);
  await reopened.flush();
  assert.deepEqual(storedParts, [1, 2], "Acknowledged parts never load back into JavaScript");
  assert.deepEqual(seenParts, [1, 2]);
  assert.deepEqual(await store.keys("file-bytes:"), []);
});

for (const savedBeforeDisconnect of [true, false]) {
  test(`retry after a lost part acknowledgement (server saved: ${savedBeforeDisconnect})`, async () => {
    const store = memory();
    const selected = { ...file, id: randomUUID(), name: "retry.pdf", mimeType: "application/pdf", size: NATIVE_UPLOAD_PART_SIZE * 2 + 17 };
    const serverParts = new Set<number>();
    const calls: Array<{ index: number; attempt: string | null; resend: string | null; bodyBytes: number }> = [];
    const events: Array<Record<string, unknown>> = [];
    setTelemetrySink((name, properties) => {
      if (name === "native_upload_transfer_attempt" && properties.import_file_id === selected.id) events.push(properties);
    });
    let lostConnection = false;
    let complete = false;
    const transport: FileTransport = {
      status: async () => {
        if (complete) return { done: true, failed: false };
        throw Object.assign(new Error("Import is not ready"), { status: 404 });
      },
      upload: (item, source, control) => uploadInParts(async <T,>(path: string, options?: RequestInit) => {
        if (path.includes("/start")) return { parts: [...serverParts], state: "uploading" } as T;
        if (path.includes("/part")) {
          const body = String(options?.body);
          const { index, base64 } = JSON.parse(body);
          const headers = new Headers(options?.headers);
          calls.push({
            index, attempt: headers.get("x-clover-upload-attempt"),
            resend: headers.get("x-clover-upload-resend"), bodyBytes: Buffer.byteLength(body),
          });
          assert.deepEqual(Buffer.from(base64, "base64"), Buffer.alloc(index === 2 ? 17 : NATIVE_UPLOAD_PART_SIZE, index));
          if (index === 1 && !lostConnection) {
            lostConnection = true;
            if (savedBeforeDisconnect) serverParts.add(index);
            throw new NetworkError("Connection lost before acknowledgement");
          }
          serverParts.add(index);
        } else {
          assert.deepEqual([...serverParts], [0, 1, 2]);
          complete = true;
        }
        return { canonicalImportFileId: selected.id } as T;
      }, item, source, control),
    };
    try {
      const initial = new FileQueue(store, transport, async () => {});
      await initial.add(selected, async index => Buffer.alloc(index === 2 ? 17 : NATIVE_UPLOAD_PART_SIZE, index).toString("base64"));
      await initial.enqueue(selected.id);
      await initial.flush();
      const [pending] = await initial.list();
      assert.equal(pending.state, "sending");
      assert.deepEqual(pending.uploadTransfer?.dispatchedParts, [0, 1]);
      await initial.close();
      const reopened = new FileQueue(store, transport, async () => {});
      await reopened.flush();
      const [uploaded] = await reopened.list();
      assert.equal(uploaded.state, "done");
      assert.equal(uploaded.pdfTiming?.startedAt, pending.uploadTransfer?.startedAt);
      assert.equal(uploaded.pdfTiming?.resumed, true);
      assert.deepEqual(calls.map(call => call.index), savedBeforeDisconnect ? [0, 1, 2] : [0, 1, 1, 2]);
      const [initialEvent, retry] = events;
      assert.equal(initialEvent.source_bytes_acknowledged, NATIVE_UPLOAD_PART_SIZE);
      assert.equal(initialEvent.source_bytes_dispatched, 2 * NATIVE_UPLOAD_PART_SIZE);
      assert.equal(initialEvent.outcome, "failed");
      assert.equal(retry.attempt_number, 2);
      assert.equal(retry.parts_skipped, savedBeforeDisconnect ? 2 : 1);
      assert.equal(retry.parts_resent, savedBeforeDisconnect ? 0 : 1);
      assert.equal(retry.source_bytes_resent, savedBeforeDisconnect ? 0 : NATIVE_UPLOAD_PART_SIZE);
      assert.equal(retry.source_bytes_acknowledged, (savedBeforeDisconnect ? 0 : NATIVE_UPLOAD_PART_SIZE) + 17);
      assert.equal(retry.part_request_body_bytes_dispatched, calls.slice(2).reduce((sum, call) => sum + call.bodyBytes, 0));
      assert.deepEqual(calls.slice(2).map(call => [call.attempt, call.resend]), savedBeforeDisconnect
        ? [["2", "0"]] : [["2", "1"], ["2", "0"]]);
    } finally {
      setTelemetrySink(() => {});
    }
  });
}

test("connection lost during completion reconciles a saved import with zero retry bytes", async () => {
  const store = memory();
  const selected = { ...file, id: randomUUID() };
  let completed = false;
  let transfers = 0;
  const reports: Array<Record<string, unknown>> = [];
  setTelemetrySink((name, event) => {
    if (name === "native_upload_transfer_attempt" && event.import_file_id === selected.id) reports.push(event);
  });
  try {
    const queue = new FileQueue(store, {
      status: async () => {
        if (completed) return { done: true, failed: false };
        throw Object.assign(new Error("Status not ready"), { status: 404 });
      },
      upload: async (_item, _source, control) => {
        transfers++;
        await control.progress(selected.size, true);
        completed = true;
        throw new NetworkError("Completion response lost");
      },
    }, async () => {});
    await queue.add(selected, "b3JpZ2luYWw=");
    await queue.enqueue(selected.id);
    await queue.flush();
    assert.equal(await queue.bytes(selected), "b3JpZ2luYWw=");
    await queue.flush();
    assert.equal((await queue.list())[0].state, "done");
    await assert.rejects(queue.bytes(selected), /no longer/);
    assert.equal(transfers, 1);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].outcome, "already_received");
    assert.equal(reports[0].last_stage, "status");
    assert.equal(reports[0].source_bytes_dispatched, 0);
    assert.equal(reports[0].source_bytes_skipped, selected.size);
  } finally {
    setTelemetrySink(() => {});
  }
});

test("already received upload returns its canonical import without reading the file", async () => {
  const called: string[] = [];
  const result = await uploadInParts(async <T,>(path: string) => {
    called.push(path);
    return { parts: [0], state: "done", canonicalImportFileId: "existing-import" } as T;
  }, file, async () => { throw new Error("Must skip retained bytes"); }, {
    signal: new AbortController().signal, progress: async () => {},
  });
  assert.equal(result.canonicalId, "existing-import");
  assert.equal(called.length, 1);
});

test("an active finalization lease keeps the upload pending without another part or complete request", async () => {
  const store = memory();
  const called: string[] = [];
  const queue = new FileQueue(store, {
    status: async () => { throw Object.assign(new Error("Status not ready"), { status: 404 }); },
    upload: (item, source, control) => uploadInParts(async <T,>(path: string) => {
      called.push(path);
      return { parts: [0], state: "finalizing", activeFinalization: true } as T;
    }, item, source, control),
  }, async () => {});
  await queue.add(file, "b3JpZ2luYWw=");
  await queue.enqueue(file.id);
  await queue.flush();
  assert.equal((await queue.list())[0].state, "finalizing");
  assert.equal(await queue.bytes(file), "b3JpZ2luYWw=");
  assert.equal(called.length, 1);
  assert.match(called[0], /\/start\?/);
});

test("a short source read rolls back all staged parts", async () => {
  const store = memory();
  const queue = new FileQueue(store, {
    status: async () => ({ done: false, failed: false }), upload: async () => ({}),
  }, async () => {});
  const selected = { ...file, name: "large.pdf", mimeType: "application/pdf", size: NATIVE_UPLOAD_PART_SIZE + 3 };
  await assert.rejects(queue.add(selected, async index => Buffer.alloc(index === 0 ? NATIVE_UPLOAD_PART_SIZE : 1).toString("base64")), /read completely/);
  assert.deepEqual(await queue.list(), []);
  assert.deepEqual(await store.keys("file-bytes:"), []);
});

test("upload and preview share one OCR slot until native reading finishes", async () => {
  let finish!: (text: string) => void;
  const nativeRead = new Promise<string>(resolve => { finish = resolve; });
  const uploadRead = tryRunLocalOcr(() => nativeRead);
  assert.equal(await tryRunLocalOcr(async () => { throw new Error("Competing preview started"); }), undefined);
  finish("Receipt text");
  assert.equal(await uploadRead, "Receipt text");
  await assert.rejects(tryRunLocalOcr(async () => { throw new Error("Decode failed"); }), /Decode failed/);
  assert.equal(await tryRunLocalOcr(async () => "Next preview"), "Next preview");
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
  const control={signal:new AbortController().signal,progress:async()=>{},saveDeviceText:(value:typeof evidence)=>{photo.deviceText=value;}};
  const read=async()=>{started=true;reads++;return reading;};
  await uploadInParts(request,photo,"b3JpZ2luYWw=",control,read);
  assert.deepEqual(completeBody.deviceText,evidence);assert.deepEqual(photo.deviceText,evidence);
  await uploadInParts(request,photo,"b3JpZ2luYWw=",control,read);
  assert.equal(reads,1,"A transfer retry must not repeat device OCR");
});
test("early photo recognition overlaps secure retention and upload opening without rereading the image", async () => {
  const evidence = { version: 1 as const, source: "google_mlkit" as const, text: "COFFEE\nTOTAL 425.00",
    pagesRead: 1, totalPages: 1, complete: true, durationMs: 25 };
  let startRetention!: () => void;
  const authorization = new Promise<void>(resolve => { startRetention = resolve; });
  let finishRecognition!: (value: typeof evidence) => void;
  const preparation = new Promise<typeof evidence>(resolve => { finishRecognition = resolve; });
  const photo = { ...file, name: "receipt.jpg", mimeType: "image/jpeg" };
  let fallbackReads = 0;
  const sequence: string[] = ["prepare"];
  const queue = new FileQueue(memory(), {
    status: async () => { throw Object.assign(new Error("Unknown upload"), { status: 404 }); },
    upload: (queued, original, control) => uploadInParts(async <T,>(path: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      if (path.includes("/start")) {
        assert.equal(body.deviceText, undefined);
        sequence.push("open");
        return { parts: [], state: "uploading" } as T;
      }
      if (path.includes("/part")) {
        assert.equal(body.base64, "b3JpZ2luYWw=");
        sequence.push("part");
        finishRecognition(evidence);
      } else {
        sequence.push("complete");
        assert.deepEqual(body.deviceText, evidence);
      }
      return {} as T;
    }, queued, original, control, async () => { fallbackReads++; return undefined; }),
  }, () => authorization);
  const retain = queue.add(photo, async () => {
    sequence.push("retain");
    return "b3JpZ2luYWw=";
  }, { full: preparation });
  assert.deepEqual(sequence, ["prepare"]);
  startRetention();
  await retain;
  await queue.enqueue(photo.id);
  await queue.flush();
  assert.deepEqual(sequence, ["prepare", "retain", "open", "part", "complete"]);
  assert.equal(fallbackReads, 0);
});

test("finalization takes useful partial evidence without waiting for full OCR", async () => {
  const partial = { version: 1 as const, source: "apple_vision" as const, text: "TEST COFFEE\nTotal PHP 425.00",
    pagesRead: 1, totalPages: 1, complete: false, durationMs: 50 };
  assert.equal(hasUsefulPartialReceiptText(partial.text), true);
  assert.equal(hasUsefulPartialReceiptText("Welcome\nThank you"), false);
  assert.equal(hasUsefulPartialReceiptText("Total 425.00"), false);
  const complete = { ...partial, text: partial.text + "\nDate 2026-11-17", complete: true };
  for (const fullReady of ["early", "during-transfer", "pending"]) {
    let finishFull!: (value: typeof complete) => void;
    const full = fullReady === "early" ? Promise.resolve(complete) : new Promise<typeof complete>(resolve => { finishFull = resolve; });
    let releasePartial!: (value: typeof partial) => void;
    const ready = new Promise<typeof partial>(resolve => { releasePartial = resolve; });
    let handoff: unknown;
    const request = async <T,>(path: string, options?: RequestInit): Promise<T> => {
      if (path.includes("/start")) return { parts: [], state: "uploading" } as T;
      if (path.includes("/part")) {
        releasePartial(partial);
        await Promise.resolve();
        if (fullReady === "during-transfer") finishFull(complete);
      }
      if (path.includes("/complete")) handoff = JSON.parse(String(options?.body)).deviceText;
      return {} as T;
    };
    await Promise.race([
      uploadInParts(request, file, "b3JpZ2luYWw=", {
        signal: new AbortController().signal, progress: async () => {},
        preparedDeviceText: { full, partial: ready },
      }),
      new Promise<never>((_, reject) => {
        const watchdog = setTimeout(() => reject(new Error("Upload waited for full OCR")), 1000);
        watchdog.unref();
      }),
    ]);
    assert.deepEqual(handoff, fullReady === "pending" ? partial : complete);
  }
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
test("finalization starts within a short grace period when OCR is still running", async () => {
  const evidence = { version: 1 as const, source: "apple_vision" as const, text: "COFFEE\nTOTAL 425.00",
    pagesRead: 1, totalPages: 1, complete: true, durationMs: 500 };
  let resolveOcr!: (value: typeof evidence) => void;
  const ocr = new Promise<typeof evidence>(resolve => { resolveOcr = resolve; });
  let saves = 0;
  let finalizationStarted = 0;
  let completed = 0;
  let finish!: () => void;
  const watchdog = new Promise<void>((_, reject) => {
    const timer = setTimeout(() => reject(new Error("Finalization waited for OCR")), 2000);
    finish = () => clearTimeout(timer);
  });
  const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
    if (path.includes("/start")) return { parts: [], state: "uploading" } as T;
    if (path.includes("/part")) finalizationStarted = performance.now();
    if (path.includes("/complete")) {
      completed++;
      assert.equal(JSON.parse(String(options?.body)).deviceText, undefined);
      assert(performance.now() - finalizationStarted >= DEVICE_OCR_FINALIZE_WAIT_MS - 20);
    }
    return {} as T;
  };
  try {
    await Promise.race([watchdog, uploadInParts(request, file, "b3JpZ2luYWw=", {
      signal: new AbortController().signal, progress: async () => {}, saveDeviceText: () => { saves++; },
    }, () => ocr)]);
    assert.equal(completed, 1);
    resolveOcr(evidence);
    await ocr;
    assert.equal(completed, 1, "Late OCR cannot complete the upload again");
    assert.equal(saves, 0, "Late OCR cannot write queue state");
  } finally {
    finish();
    resolveOcr(evidence);
  }
});

test("pausing during the OCR grace period interrupts finalization", async () => {
  const controller = new AbortController();
  const request = async <T>(path: string): Promise<T> => {
    if (path.includes("/start")) return { parts: [], state: "uploading" } as T;
    assert(!path.includes("/complete"), "Paused upload reached finalization");
    setTimeout(() => controller.abort(), 10);
    return {} as T;
  };
  await assert.rejects(uploadInParts(request, file, "b3JpZ2luYWw=", {
    signal: controller.signal, progress: async () => {},
  }, () => new Promise(() => {})), /Upload paused/);
});

test("an import refresh invalidates only the owning Profile and fences stale results", async () => {
  const cache = new PageCache();
  const own = "transactions?workspaceId=profile-a&page=1";
  const other = "transactions?workspaceId=profile-b&page=1";
  cache.seed(other, ["other-profile"], Date.now());
  let release!: (rows: string[]) => void;
  const old = cache.read(own, () => new Promise<string[]>(resolve => { release = resolve; }));
  await Promise.resolve();
  cache.clearWorkspace("profile-a");
  assert.deepEqual(await cache.read(own, async () => ["committed"]), ["committed"]);
  release(["stale"]);
  await old;
  assert.deepEqual(cache.peek(own), ["committed"]);
  assert.deepEqual(cache.peek(other), ["other-profile"]);
});

test("committed-row timing separates polling from screen visibility and respects Profile scope", async () => {
  const store = memory();
  const notices = importPollTimings(importCommitAgeMs(new Date(1000), 1, 1100), 20);
  const q = new FileQueue(store, {
    status: async () => ({ done: true, failed: false, commitNotice: { noticedAt: 2000, polling: notices } }),
    upload: async () => ({}),
  }, async () => {});
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  setTelemetrySink((event, data) => {
    if (event === "import_first_row_visible" || event === "import_commit_observed") events.push({ event, data });
  });
  try {
    await q.add(file, "b3JpZ2luYWw=");
    await q.enqueue(file.id);
    await q.flush();
    const rows = [{ id: "row", importFileId: file.id }];
    await q.observeCommittedRows("another-profile", rows, 2050);
    await q.observeCommittedRows(file.workspaceId, [{ id: "other-row" }], 2050);
    assert.deepEqual(events.map(event => event.event), ["import_commit_observed"]);
    await q.observeCommittedRows(file.workspaceId, rows, 2050);
    await q.observeCommittedRows(file.workspaceId, rows, 2100);
    assert.deepEqual(events.map(event => event.event), ["import_commit_observed", "import_first_row_visible"]);
    assert.equal(events[1].data.commit_to_poll_ms, 100);
    assert.equal(events[1].data.commit_to_poll_upper_ms, 120);
    assert.equal(events[1].data.poll_to_first_visible_row_ms, 50);
  } finally {
    setTelemetrySink(() => {});
  }
});

test("PDF timings survive transport and resolve when any imported row is visible", async () => {
  const store = memory();
  const pdf = { ...file, name: "fixture.pdf", mimeType: "application/pdf", size: 8 };
  const q = new FileQueue(store, {
    status: async current => {
      if (current.pdfTiming) return { done: true, failed: false, pdfVisibilityTarget: { attemptId: "attempt-pdf", transactionId: "oldest-row" } };
      throw Object.assign(new Error("not started"), { status: 404 });
    },
    upload: (current, bytes, control) => uploadInParts(async <T>(path: string) =>
      (path.includes("/start") ? { parts: [], state: "uploading" } : {}) as T, current, bytes, control),
  }, async () => {});
  await q.add(pdf, "b3JpZ2luYWw=");
  await q.enqueue(pdf.id);
  await q.flush();
  await q.flush();
  assert.ok((await q.list())[0].pdfTiming!.finalizeRequestMs! >= 0);
  const ready = (await q.list())[0].pdfVisibilityReadyAt!;
  assert.ok(Number.isFinite(ready));
  const reports: Array<Record<string, unknown>> = [];
  setTelemetrySink((event, properties) => {
    if (event === "pdf_import_first_row_visible") reports.push(properties);
  });
  try {
    const rows = [{ id: "newest-row", importFileId: pdf.id }];
    await q.observePdfRows("other-profile", rows, ready + 25);
    assert.equal(reports.length, 0);
    await q.observePdfRows(pdf.workspaceId, rows, ready + 25);
    await q.observePdfRows(pdf.workspaceId, rows, ready + 100);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].attempt_id, "attempt-pdf");
    assert.equal(reports[0].ui_delay_ms, 25);
    assert.equal(reports[0].ui_delay_boundary, "availability_response_to_visible_row");
    assert.equal(await store.get("pdf-visible:attempt-pdf"), true);
  } finally {
    setTelemetrySink(() => {});
  }
});

test("camera acceptance is the clock and first outcome survives review and retry", async () => {
  const events: { outcome: unknown; within_target: unknown }[] = [];
  setTelemetrySink((event, properties) => {
    if (event === "receipt_first_attempt") events.push({
      outcome: properties.outcome, within_target: properties.within_target,
    });
  });
  try {
    const store = memory();
    const q = new FileQueue(store, {
      status: async () => ({ done: false, failed: true, processingPhase: "receipt_review_required" }),
      upload: async () => ({}),
    }, async () => {});
    const scan = beginFirstReceiptScan();
    await q.add({ ...file, firstReceiptScan: scan, importMode: "receipt" }, "b3JpZ2luYWw=");
    await q.enqueue(file.id);
    await q.flush();
    await q.receiptConfirmed(file.workspaceId, file.id, "camera-row");
    await q.observeFirstReceiptRows(file.workspaceId, [{ id: "camera-row" }]);
    assert.deepEqual(events, [
      { outcome: "accepted", within_target: undefined },
      { outcome: "review_required", within_target: false },
    ]);

    const now = Date.now;
    try {
      Date.now = () => 30_000;
      reportFirstReceiptOutcome({ id: "at-boundary", acceptedAt: 20_000 }, "visible");
      reportFirstReceiptOutcome({ id: "slow", acceptedAt: 19_999 }, "visible");
      reportFirstReceiptOutcome({ id: "abandoned", acceptedAt: 0 }, "not_seen_24h");
      assert.deepEqual(events.slice(-3).map(event => event.within_target), [true, false, false]);
    } finally {
      Date.now = now;
    }
  } finally {
    setTelemetrySink(() => {});
  }
});

test("receipt review reports which fields were shown separately from the review decision", async () => {
  const events: Record<string, unknown>[] = [];
  setTelemetrySink((name, data) => {
    if (name === "receipt_first_attempt" || name === "receipt_review_prompt_shown") events.push({ name, ...data });
  });
  try {
    const store = memory();
    const q = new FileQueue(store, {
      status: async () => ({ done: false, failed: true, processingPhase: "receipt_review_required" }),
      upload: async () => ({}),
    }, async () => {});
    const scan = beginFirstReceiptScan();
    await q.add({ ...file, firstReceiptScan: scan, importMode: "receipt" }, "b3JpZ2luYWw=");
    await q.enqueue(file.id);
    await q.flush();
    assert.equal(events[1].reason_code, "receipt_details_needed");
    await q.observeReceiptReviewPrompt("wrong-profile", file.id, ["date"], scan.acceptedAt + 800);
    assert.equal(events.length, 2);
    await q.observeReceiptReviewPrompt(file.workspaceId, file.id, ["date", "total"], scan.acceptedAt + 900);
    await q.observeReceiptReviewPrompt(file.workspaceId, file.id, ["date"], scan.acceptedAt + 1000);
    assert.equal(events.length, 3);
    assert.deepEqual(events[2], { name: "receipt_review_prompt_shown", operation_id: scan.id, duration_ms: 900, reason_code: "date+total" });
  } finally {
    setTelemetrySink(() => {});
  }
});

for (const platform of ["ios", "android"]) {
  test(`${platform}: camera acceptance to the first matching visible receipt row`, async () => {
    const events: Record<string, unknown>[] = [];
    setTelemetrySink((name, properties) => {
      if (name === "receipt_first_attempt") events.push({ ...properties, platform });
    });
    try {
      const q = new FileQueue(memory(), {
        status: async () => ({ done: true, failed: false, receiptTransactionId: "saved-row" }),
        upload: async () => ({}),
      }, async () => {});
      const scan = beginFirstReceiptScan();
      await q.add({ ...file, firstReceiptScan: scan, importMode: "receipt" }, "b3JpZ2luYWw=");
      await q.enqueue(file.id);
      await q.flush();
      const rows = [{ id: "saved-row" }];
      assert.equal(events.length, 1, "A save response is not a visible row");
      await q.observeFirstReceiptRows("other-profile", rows, scan.acceptedAt + 400);
      await q.observeFirstReceiptRows(file.workspaceId, [{ id: "unrelated" }], scan.acceptedAt + 500);
      assert.equal(events.length, 1);
      await q.observeFirstReceiptRows(file.workspaceId, rows, scan.acceptedAt + 10_000);
      await q.observeFirstReceiptRows(file.workspaceId, rows, scan.acceptedAt + 10_020);
      assert.equal(events.length, 2);
      assert.equal(events[1].operation_id, events[0].operation_id);
      assert.equal(events[1].outcome, "visible");
      assert.equal(events[1].duration_ms, 10_000);
      assert.equal(events[1].within_target, true);
    } finally {
      setTelemetrySink(() => {});
    }
  });
}

test("receipt upload reports visible only for the matching on-screen transaction and Profile", async () => {
  const store = memory();
  const q = new FileQueue(store, {
    status: async () => ({ done: false, failed: true, processingPhase: "receipt_review_required" }),
    upload: async () => { throw new Error("Saved receipt must never upload again."); },
  }, async () => {});
  await q.add({ ...file, importMode: "receipt" }, "b3JpZ2luYWw=");
  await q.enqueue(file.id);
  await q.flush();
  const pending = (await q.list())[0];
  assert.equal(pending.state, "attention");
  assert.equal(pending.receiptTiming?.outcome, undefined);
  await q.receiptConfirmed(file.workspaceId, file.id, "receipt-transaction");
  await q.observeReceiptRows("another-profile", ["receipt-transaction"]);
  await q.observeReceiptRows(file.workspaceId, ["different-transaction"]);
  assert.equal((await q.list())[0].receiptTiming?.outcome, undefined);
  await Promise.all([
    q.observeReceiptRows(file.workspaceId, ["receipt-transaction"]),
    q.observeReceiptRows(file.workspaceId, ["receipt-transaction"]),
  ]);
  const reopened = new FileQueue(store, {
    status: async () => ({ done: true, failed: false }),
    upload: async () => ({}),
  }, async () => {});
  assert.equal((await reopened.list())[0].receiptTiming?.outcome, "visible");
});

test("receipt upload measures failures and unresolved uploads after reopening", async () => {
  const store = memory();
  const q = new FileQueue(store, {
    status: async () => ({ done: false, failed: true, processingPhase: "repair_needed" }),
    upload: async () => ({}),
  }, async () => {});
  await q.add({ ...file, importMode: "receipt" }, "b3JpZ2luYWw=");
  await q.enqueue(file.id);
  await q.flush();
  const failed = (await q.list())[0];
  assert.equal(failed.receiptTiming?.outcome, "failed");
  const pending = { ...file, id: "old-receipt", receiptTiming: { id: "old-attempt", startedAt: Date.now() - 86_400_001 } };
  await q.add(pending, "b3JpZ2luYWw=");
  await q.reportUnseenReceipts();
  assert.equal((await q.list()).find(item => item.id === pending.id)?.receiptTiming?.outcome, "not_seen_24h");
});

test("an error notice is remembered across relaunch without discarding the saved import", async () => {
  const store = memory();
  const transport = { status: async () => ({ done: false, failed: true, message: "Check this file" }), upload: async () => ({}) };
  const q = new FileQueue(store, transport, async () => {});
  await q.add({ ...file, state: "attention", error: "Check this file" }, "b3JpZ2luYWw=");
  await q.acknowledgeProgress(file.id);
  const reopened = new FileQueue(store, transport, async () => {});
  assert.equal((await reopened.list())[0].progressNoticeSeen, true);
  assert.equal((await reopened.list())[0].state, "attention");
  assert.equal(await reopened.bytes(file), "b3JpZ2luYWw=", "Acknowledging a notice never deletes the source");
  await reopened.enqueue(file.id);
  assert.equal((await reopened.list())[0].progressNoticeSeen, false, "An explicit retry may report a new result");
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

test("cold Home snapshots stay warm after list caches expire and never survive financial writes",async()=>{
 let now=Date.parse(version);
 const e=setup(async()=>({balance:123}),memory(),()=>now);
 await e.init();await e.request("bootstrap");
 await e.request("home?workspaceId=p&currency=PHP&section=overview");
 now+=6*60_000;
 const snapshot=await e.presentationCache("p");assert.equal(snapshot.length,1);assert.equal((snapshot[0].value as any).balance,123);
 await assert.rejects(()=>e.presentationCache("other"),/not available offline/);
 now++;await e.request("settings/preferences",{method:"PATCH",body:"{}"});
 assert.equal((await e.presentationCache("p")).length,0);
 await e.request("home?workspaceId=p&currency=PHP&section=overview");
 now+=31*60_000;assert.equal((await e.presentationCache("p")).length,0);
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

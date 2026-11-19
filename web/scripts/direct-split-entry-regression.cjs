const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, deps = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      console,
      URL,
      AbortController,
      Date,
      ...extra,
      require: (name) => {
        if (name.endsWith(".png")) return name;
        if (!(name in deps)) throw Error("Missing dependency " + name);
        return deps[name];
      },
    },
  );
  return exports;
}
const nodes = (t) =>
  !t || typeof t !== "object"
    ? []
    : Array.isArray(t)
      ? t.flatMap(nodes)
      : [t, ...nodes(t.props?.children)];
const text = (t) =>
  t == null
    ? ""
    : typeof t === "string" || typeof t === "number"
      ? String(t)
      : Array.isArray(t)
        ? t.map(text).join("")
        : text(t.props?.children);
const flush = () => new Promise((resolve) => setImmediate(resolve));
function hooks() {
  const state = [],
    refs = [],
    effects = [],
    callbacks = [];
  let si = 0,
    ri = 0,
    ei = 0,
    ci = 0,
    pending = [];
  const same = (a, b) =>
    a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const h = {
    useState(value) {
      const i = si++;
      if (!(i in state))
        state[i] = typeof value === "function" ? value() : value;
      return [
        state[i],
        (v) => (state[i] = typeof v === "function" ? v(state[i]) : v),
      ];
    },
    useRef(value) {
      return (refs[ri++] ??= { current: value });
    },
    useEffect(fn, deps) {
      const i = ei++;
      if (!effects[i] || !same(effects[i].deps, deps)) {
        const old = effects[i];
        effects[i] = { deps };
        pending.push(() => {
          old?.cleanup?.();
          effects[i].cleanup = fn();
        });
      }
    },
    useCallback(fn, deps) {
      const i = ci++;
      if (!callbacks[i] || !same(callbacks[i].deps, deps))
        callbacks[i] = { fn, deps };
      return callbacks[i].fn;
    },
    useMemo: (fn) => fn(),
    useTransition: () => [false, (fn) => fn()],
  };
  return {
    h,
    state,
    refs,
    render(fn) {
      si = ri = ei = ci = 0;
      const t = fn();
      for (const n of nodes(t)) {
        if (n.props?.ref && n.props.ref.current === null)
          n.props.ref.current = { close() {}, showModal() {} };
      }
      while (pending.length) pending.shift()();
      return t;
    },
    stop() {
      effects.forEach((e) => e?.cleanup?.());
    },
  };
}
const jsx = {
  jsx: (type, props) => ({ type, props }),
  jsxs: (type, props) => ({ type, props }),
  Fragment: "Fragment",
};
const contextRules = load("../shared/direct-bill-context.ts");
assert.deepEqual(
  Array.from(
    contextRules.circleBillMembers([
      { id: "owner", displayName: "Alex", status: "active" },
      { id: "friend", displayName: "Bea", status: "invited" },
      { id: "removed", displayName: "Removed", status: "removed" },
    ]),
    (m) => m.name,
  ),
  ["Alex", "Bea"],
);
assert.equal(
  contextRules.circleBillContextReady({ detailsLoaded: false }, false),
  false,
);
assert.equal(
  contextRules.circleBillContextReady({ detailsLoaded: true }, true),
  false,
);
assert.equal(
  contextRules.circleBillContextReady({ detailsLoaded: true }, false),
  true,
);
async function main() {
  for (const context of [
    { person: "Bea" },
    {
      group: {
        id: "group",
        name: "Friends",
        members: [
          { id: "a", name: "Alex" },
          { id: "b", name: "Bea" },
        ],
      },
    },
  ]) {
    const h = hooks(),
      calls = [],
      saved = [],
      events = [];
    const keyboard = new Map();
    let closed = 0,
      release;
    const fetch = async (url, options) => {
      calls.push({ url, body: options?.body });
      if (url.includes("preview"))
        return {
          ok: true,
          json: async () => ({
            preview: {
              merchantName: "Receipt cafe",
              billDate: "2026-11-20",
              currency: "PHP",
              total: "100",
              confidence: 65,
              receiptText: "Cafe TOTAL PHP 100",
              items: [{ description: "Meal", amount: "100" }],
            },
            receiptStorageKey: "owned-receipt",
          }),
        };
      return new Promise(
        (resolve) =>
          (release = () =>
            resolve({
              ok: true,
              json: async () => ({ bill: { id: "saved" } }),
            })),
      );
    };
    const { SplitBillEntry } = load(
      "components/split-bill-entry.tsx",
      {
        react: h.h,
        "react/jsx-runtime": jsx,
        "react-dom": { createPortal: (n) => n },
        "./add-entry-methods": { AddEntryMethods: "Methods" },
        "./upload-source-buttons": { UploadSourcePicker: "Upload" },
        "./split-item-grid": { SplitItemGrid: "Items" },
        "@/lib/workspace-selection": {
          readSelectedWorkspaceId: () => "profile",
        },
        "@/lib/dialog-focus": { containDialogFocus: () => () => {} },
        "./ai-consent": { requestAiConsent: async () => true },
        "@/lib/split-bill": {
          mergeSplitBillItemSplitMetadata: (_raw, items) => ({
            splitBillItemSplits: items,
          }),
        },
      },
      {
        crypto: require("node:crypto").webcrypto,
        fetch,
        FormData,
        document: {
          body: {},
          addEventListener: (event, listener, capture) => {
            assert.equal(capture, true);
            keyboard.set(event, listener);
          },
          removeEventListener: (event) => keyboard.delete(event),
        },
        window: { dispatchEvent: (e) => events.push(e.type) },
        Event,
      },
    );
    const render = () =>
      h.render(() =>
        SplitBillEntry({
          currentUserName: "Alex",
          context,
          onClose: () => closed++,
          onSaved: (bill) => saved.push(bill),
        }),
      );
    let t = render();
    assert(nodes(t).some(n => n.props?.role === "dialog" && /\bglass\b/.test(n.props.className)), "Bill entry retains Clover's card surface");
    assert(text(t).includes("Take Photo"));
    assert(text(t).includes("Add Manually"));
    assert(!text(t).includes("Sync"));
    nodes(t)
      .find((n) => n.type === "button" && text(n) === "Add Manually")
      .props.onClick();
    t = render();
    const capture = nodes(t).find(
      (n) => n.type === "input" && n.props.capture === "environment",
    );
    assert(capture, "Camera input remains mounted when Manual is selected");
    let photoClicks = 0;
    capture.props.ref.current.click = () => photoClicks++;
    nodes(t)
      .find((n) => n.type === "button" && text(n) === "Take Photo")
      .props.onClick();
    assert.equal(photoClicks, 1);
    t = render();
    nodes(t)
      .find((n) => n.type === "input" && n.props.capture === "environment")
      .props.onChange({
        target: {
          files: [new File(["receipt"], "receipt.jpg", { type: "image/jpeg" })],
          value: "receipt.jpg",
        },
      });
    await flush();
    await flush();
    t = render();
    assert(
      nodes(t).find(
        (n) => n.type === "input" && n.props.value === "Receipt cafe",
      ),
      "Receipt preview returns to the same editable form",
    );
    const input = (label, value) => {
      const row = nodes(t).find(
        (n) => n.type === "label" && text(n).startsWith(label),
      );
      const field = nodes(row).find((n) => n.type === "input");
      field.props.onChange({ target: { value } });
      t = render();
    };
    input("Amount", "100");
    input("Name", "Dinner");
    assert(text(t).includes("More Details"));
    const save = nodes(t).find(
      (n) => n.type === "button" && text(n) === "Save Bill",
    );
    save.props.onClick();
    save.props.onClick();
    const creates = calls.filter((c) => c.url === "/api/split-bills");
    assert.equal(creates.length, 1, "In-flight saves are coalesced");
    const payload = JSON.parse(creates[0].body);
    assert.equal(payload.expense.workspaceId, "profile");
    assert.equal(payload.groupId, context.group?.id ?? null);
    assert.deepEqual(
      Array.from(payload.participants, (p) => p.name),
      ["Alex", "Bea"],
    );
    assert.equal(payload.items[0].participantIds.length, 2);
    assert.equal(payload.payments[0].amount, "100");
    release();
    await flush();
    render();
    assert.equal(saved.length, 1);
    assert.equal(closed, 1);
    assert(events.includes("clover:transactions-changed"));
    let prevented = false,
      stopped = false;
    keyboard.get("keydown")({
      key: "Escape",
      preventDefault: () => (prevented = true),
      stopImmediatePropagation: () => (stopped = true),
    });
    assert(prevented && stopped, "Escape stays within the bill entry");
    h.stop();
    assert.equal(keyboard.size, 0);
  }
  const shell = fs.readFileSync(
    path.join(root, "components/clover-shell.tsx"),
    "utf8",
  );
  const add = shell.slice(shell.indexOf("const openQuickAddTransaction ="));
  assert(
    add.indexOf("clover:open-circle-bill-add") < add.indexOf("matchMedia"),
    "Page context must be resolved before the generic mobile transaction form",
  );
  const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
  assert(css.includes(".split-bill-detail-tabs.clover-tabs"));
  assert(css.includes("max-height:44px!important;flex:0 0 auto!important"));
  const events = load("../mobile/src/bill-entry-events.ts");
  let opens = 0;
  const stop = events.onContextBillEntry(() => opens++);
  events.requestContextBillEntry();
  stop();
  events.requestContextBillEntry();
  assert.equal(opens, 1);
  const stopCircle = events.onContextBillEntry(() => (opens += 10), "circles");
  events.requestContextBillEntry("split");
  assert.equal(opens, 1);
  events.requestContextBillEntry("circles");
  assert.equal(opens, 11);
  stopCircle();
  console.log(
    "PASS actual direct bill form: default photo, manual input, group/person context, equal split, one save, linked expense contract, origin retained and native event cleanup",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

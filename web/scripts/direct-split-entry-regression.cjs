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
const { supportsReceiptCapture } = load("lib/receipt-capture-platform.ts");
assert.equal(supportsReceiptCapture(null), false);
for (const browser of [{userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X)",platform:"MacIntel",maxTouchPoints:0},{userAgent:"Mozilla/5.0 (Windows NT 10.0)",platform:"Win32",maxTouchPoints:10}]) assert.equal(supportsReceiptCapture(browser),false,"Desktop, including touch laptops, uses files");
for (const browser of [{userAgent:"Mozilla/5.0 (iPhone)"},{userAgent:"Mozilla/5.0 (Linux; Android 16)"},{userAgent:"Mozilla/5.0 (Macintosh)",platform:"MacIntel",maxTouchPoints:5}]) assert.equal(supportsReceiptCapture(browser),true,"Phones and iPads retain photo capture");
async function main() {
  // Exercise the installed Expo FormData patch and fetch encoder, including its native bytes() path.
  const {installFormDataPatch} = load("../mobile/node_modules/expo/src/winter/FormData.ts", {}, {Blob});
  const NativeForm = installFormDataPatch(class {constructor(){this._parts=[];}});
  const {convertFormDataAsync} = load("../mobile/node_modules/expo/src/winter/fetch/convertFormData.ts",
    {"../../utils/blobUtils": {blobToArrayBufferAsync:blob => blob.arrayBuffer()}}, {Blob, TextEncoder});
  const photoBytes = Uint8Array.from([255,216,255,224,0,1,254,255,217]);
  const loadPhotoUpload = platform => load("../mobile/src/upload.ts", {
      "expo-file-system": {Paths:{cache:{uri:"file:///cache/"}}, File: class {get size(){return photoBytes.length;} async bytes(){return photoBytes;}}},
      "../../shared/native-upload": {uploadSizeProblem:()=>null}, "react-native": {Platform:{OS:platform}}
    }, {FormData:platform === "web" ? FormData : NativeForm, fetch:async()=>new Response(photoBytes,{headers:{"content-type":"image/jpeg"}})});
  for (const platform of ["ios","android","web"]) {
    const form = await loadPhotoUpload(platform).receiptPhotoForm({uri:"file:///cache/123.jpg",name:"receipt.jpg",mimeType:"image/jpeg"});
    let request;
    if (platform === "web") request = new Request("https://example.invalid", {method:"POST",body:form});
    else {
      const {body,boundary} = await convertFormDataAsync(form);
      request = new Request("https://example.invalid", {method:"POST",body,headers:{"content-type":"multipart/form-data; boundary="+boundary}});
    }
    const file = (await request.formData()).get("file");
    assert.equal(file.name,"receipt.jpg");
    assert.equal(file.type,"image/jpeg");
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()),photoBytes);
  }
  {
    const deps = {"react/jsx-runtime": jsx, "react-native":{Pressable:"Button",View:"View"},
      "./app-text":{Text:"Text"},"./ui":{Field:"Field",useTheme:()=>({colors:{}})}};
    const {SplitPeopleField,PeopleSuggestions} = load("../mobile/src/split-people-field.tsx",deps);
    let selected=[],draft="";
    const saved=[{name:"Pabs"},{name:"Joby"}];
    const render=()=>nodes(SplitPeopleField({selected,draft,saved,onChange:n=>selected=n,onDraft:n=>draft=n,disabled:false}));
    const field=()=>render().find(n=>n.type==="Field").props;
    field().onChangeText("pabs,Jo");
    assert.deepEqual(Array.from(selected),["Pabs"]);
    const suggestion=render().find(n=>n.type===PeopleSuggestions);
    nodes(PeopleSuggestions(suggestion.props)).find(n=>n.props.accessibilityLabel==="Use Joby").props.onPress();
    field().onSubmitEditing({nativeEvent:{text:"Bea"}});
    field().onChangeText("Carlo");
    field().trailing.props.onPress();
    field().onChangeText("PABS,");
    assert.deepEqual(Array.from(selected),["Pabs","Joby","Bea","Carlo"]);
    render().find(n=>n.props.accessibilityLabel==="Remove Bea").props.onPress();
    assert.deepEqual(Array.from(selected),["Pabs","Joby","Carlo"]);
  }
  for (const platform of ["ios","android"]) {
    const ui = hooks();
    const saved = [];
    const captured = {uri:"file:///cache/123.jpg",fileName:"receipt.jpg",mimeType:"image/jpeg"};
    let receiptPreviewed = false;
    const {BillEditor} = load("../mobile/src/direct-bill-editor.tsx", {
      "../../shared/currency-mark": load("../shared/currency-mark.ts"),
      react: ui.h, "react/jsx-runtime": jsx, "react-native": {Platform:{OS:platform},View:"View",TextInput:"Input",Pressable:"Button"},
      "@clerk/expo": {useUser:()=>({user:{fullName:"Personal profile name"}})},
      "expo-crypto": {randomUUID:require("node:crypto").randomUUID}, "expo-image-picker": {requestCameraPermissionsAsync:async()=>({granted:true}),launchCameraAsync:async()=>({canceled:false,assets:[captured]}),launchImageLibraryAsync:async()=>({canceled:false,assets:[captured]})}, "expo-document-picker": {getDocumentAsync:async()=>({canceled:false,assets:[{...captured,name:"receipt.jpg"}]})},
      "./split-people-field": {...load("../mobile/src/split-people-field.tsx", {"react/jsx-runtime":jsx,"react-native":{},"./app-text":{},"./ui":{}}), PeopleSuggestions:"Suggestions"}, "./split-item-grid": {SplitItemGrid:"Items"}, "../../shared/split-bill-experience": {suggestBillCategory:()=>null},
      "./add-entry-methods": {AddEntryMethods:"Methods"}, "./upload": loadPhotoUpload(platform),
      "./upload-selected-file": load("../mobile/src/upload-selected-file.ts", {"expo-crypto":{}, "./offline/file-storage":{}, "../../shared/receipt-upload":{receiptMultipartLimit:1572864}, "react-native":{Platform:{OS:platform}}, "./upload":loadPhotoUpload(platform)}),
      "./session": {useSession:()=>({profileId:"profile",request:async (_path, opts)=>{if (_path.startsWith("split-bill-receipts/preview")) {
          const {body,boundary} = await convertFormDataAsync(opts.body);
          const req = new Request("https://example.invalid", {method:"POST",body,headers:{"content-type":"multipart/form-data; boundary="+boundary}});
          const file = (await req.formData()).get("file");
          assert.equal(file.name,"receipt.jpg");
          assert.deepEqual(new Uint8Array(await file.arrayBuffer()), photoBytes);
          receiptPreviewed=true;
          return {receiptStorageKey:"receipt",preview:{merchantName:"Bakery",total:"12.00",billDate:"2026-11-20",currency:"PHP",items:[{description:"Bread",amount:"12.00"}]}};
        }
        saved.push(JSON.parse(opts.body)); return {bill:{id:"saved"}};}})},
      "./ui": {useTheme:()=>({colors:{}}),Field:"Field",Screen:"Screen",Body:"Body",CategoryMark:"CategoryMark"},
      "./plan-ui": {PlanHeader:"Header",PlanAction:"Action",usePlanData:()=>({})}, "./app-text":{Text:"Text"},
      "./account-type-mark": {AccountTypeMark:"Account"}, "./transaction-entry":{ChoiceField:"Choice"},
    });
    const context = {circleId:"trip",currency:"PHP",group:{id:"group",name:"Trip",recorderName:"Alex",members:[
      {id:"m1",name:"Bea"},{id:"m2",name:"Alex"},{id:"m3",name:"Carlo"}]}};
    const render = () => nodes(ui.render(() => BillEditor({context, onSaved:()=>{}, onClose:()=>{}})));
    const control = (key,value) => render().find(n=>n.props[key]===value);
    assert.ok(control("title","Add Expense"));
    assert.ok(control("accessibilityLabel","Remove Bea"));
    assert.ok(control("accessibilityLabel","Remove Alex"));
    assert.equal(control("title","Choose Group"),undefined);
    control("accessibilityLabel","Remove Bea").props.onPress();
    control("title","+").props.onPress();
    assert.deepEqual(Array.from(control("label","Add Circle Member").props.options, o=>o.value),["Bea"]);
    control("label","Add Circle Member").props.onChange("Bea");
    control("accessibilityLabel","Remove Carlo").props.onPress();
    control("accessibilityLabel","More Details").props.onPress();
    assert.equal(control("label","Paid By").props.value,"Alex");
    assert.ok(control("label","Note (Optional)"));
    const fields = render().filter(n=>n.type==="Choice").map(n=>n.props.label);
    assert.deepEqual(fields.slice(-2),["Account (Optional)","Category (Optional)"]);
    control("label","Name").props.onChangeText("Taxi");
    control("label","Amount").props.onChangeText("120");
    control("title","Save Expense").props.onPress();
    await flush();
    assert.equal(saved.length,1);
    assert.equal(saved[0].circleId,"trip");
    assert.deepEqual(saved[0].participants.map(p=>p.name),["Alex","Bea"]);
    assert.equal(saved[0].paidByIndex,0);
    for (const source of ["camera", "library", "file"]) {
      receiptPreviewed = false;
      render().find(n=>n.type==="Methods").props.onUploadSource(source);
      await flush();
      assert.ok(receiptPreviewed, source);
      assert.equal(render().find(n=>n.type==="Methods").props.initialMethod, "manual");
    }
    assert.equal(control("label","Name").props.value,"Bakery");
    assert.equal(control("label","Amount").props.value,"12.00");
    control("title","Save Expense").props.onPress();
    await flush();
    assert.equal(saved[1].circleId,context.circleId);
    assert.equal(saved[1].groupId,context.group.id);
    assert.deepEqual(saved[1].participants,saved[0].participants);
    assert.equal(saved[1].receipt.storageKey,"receipt");
    assert.equal(saved[1].paidByIndex,0);
    ui.stop();
  }
  for (const capture of [false, true]) {
    const h = hooks(), selected = [];
    const { UploadSourceButtons } = load("components/upload-source-buttons.tsx", {
      react: h.h, "react/jsx-runtime": jsx,
      "@/lib/import-format-policies": { PUBLIC_IMPORT_ACCEPT: "image/*,application/pdf" },
      "@/lib/receipt-capture-platform": { supportsReceiptCapture: () => capture },
    });
    const render = () => h.render(() => UploadSourceButtons({cameraFirst:true,onFiles:()=>selected.push("files"),onCamera:()=>selected.push("camera"),onLibrary:()=>selected.push("library")}));
    render(); const tree = render();
    const buttons = nodes(tree).filter(n => n.type === "button");
    assert.deepEqual(buttons.map(text),capture ? ["Take photo","Photo library","Choose files"] : ["Choose files"],"Desktop offers one file picker; mobile retains distinct receipt sources");
    for (const button of buttons) button.props.onClick();
    assert.deepEqual(selected,capture ? ["camera","library","files"] : ["files"]);
    h.stop();
  }
  for (const capture of [false, true]) for (const context of [
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
        "@/lib/preview-receipt-client": { previewReceiptFile: (file) => {
          const form = new FormData(); form.set("file", file); return fetch("/api/split-bill-receipts/preview",{body:form});
        } },
        react: h.h,
        "react/jsx-runtime": jsx,
        "react-dom": { createPortal: (n) => n },
        "./add-entry-methods": { AddEntryMethods: "Methods" },
        "@/lib/receipt-capture-platform": { supportsReceiptCapture: () => capture },
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
    assert(!text(t).includes("Add Manually"), "No preliminary chooser before the shared selector");
    const methods = nodes(t).find(n => n.type === "Methods");
    assert.equal(methods.props.initialMethod, capture ? "upload" : "manual", "Mobile starts at receipt capture; desktop starts at the manual form");
    assert.equal(methods.props.kind, "split", "No bank Sync method for split entry");
    methods.props.onUploadFiles([new File(["receipt"], "receipt.jpg", { type: "image/jpeg" })]);
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
  // Exercise the real native selector callback: camera/library must stay in
  // this bill editor, rather than navigate to generic Add Transaction.
  const nativeHooks = hooks(), routed = [], sources = [];
  const { AddEntryMethods: NativeMethods } = load("../mobile/src/add-entry-methods.tsx", {
    react: nativeHooks.h, "react/jsx-runtime": jsx,
    "react-native": { View: "View", Pressable: "Pressable" },
    "expo-linear-gradient": { LinearGradient: "Gradient" },
    "expo-router": { router: { push: route => routed.push(route) } },
    "./contextual-upgrade": { ResourceUpgradeNotice: "Upgrade" },
    "./entry-navigation": { useEntryNavigation: () => fn => fn() },
    "./entry-controls": { EntrySelector: "Selector", EntryTransition: "Transition", UploadTiles: "Tiles" },
    "./app-text": { Text: "Text" },
    "./ui": { Body: "Body", Button: "Button", useTheme: () => ({ colors: {} }) },
    "./transaction-entry": { TransactionChat: "Chat" },
  });
  const nativeRender = () => nativeHooks.render(() => NativeMethods({ kind: "split", initialMethod: "upload", children: "Retained manual draft", onUploadSource: source => sources.push(source) }));
  let native = nativeRender();
  assert.equal(nodes(native).find(n => n.type === "Selector").props.value, "upload");
  const tiles = nodes(native).find(n => n.type === "Tiles");
  assert.equal(tiles.props.cameraFirst, true);
  for (const source of ["camera", "library", "file"]) tiles.props.onChoose(source);
  assert.deepEqual(sources, ["camera", "library", "file"]);
  assert.deepEqual(routed, [], "All receipt sources retain the bill/group context");
  nodes(native).find(n => n.type === "Selector").props.onChange("manual");
  native = nativeRender();
  assert.equal(nodes(native).find(n => n.type === "Selector").props.value, "manual");
  assert(text(native).includes("Retained manual draft"));
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
    "PASS actual direct bill form: desktop manual/mobile photo defaults, manual input, group/person context, equal split, one save, linked expense contract, origin retained and native event cleanup",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

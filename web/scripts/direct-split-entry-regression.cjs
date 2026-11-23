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
      "../../shared/import-format-policies": load("../shared/import-format-policies.ts"),
      "../../shared/native-upload": {uploadSizeProblem:()=>null}, "react-native": {Platform:{OS:platform}}
    }, {FormData:platform === "web" ? FormData : NativeForm, fetch:async()=>new Response(photoBytes,{headers:{"content-type":"image/jpeg"}})});
  let browserReads = 0;
  const readSelection = async () => {
    assert.equal(++browserReads, 1, "A multipart upload should read its selection once");
    return new Response(photoBytes, { headers: { "content-type": "image/jpeg" } });
  };
  const browserUpload = load("../mobile/src/upload-selected-file.ts", {
    "expo-crypto": {}, "./offline/file-storage": {}, "../../shared/receipt-upload": {receiptMultipartLimit:1572864},
    "react-native": { Platform: { OS: "web" } },
    "./upload": load("../mobile/src/upload.ts", {
      "expo-file-system": {}, "react-native": { Platform: { OS: "web" } },
      "../../shared/import-format-policies": load("../shared/import-format-policies.ts"),
      "../../shared/native-upload": {uploadSizeProblem:()=>null},
    }, {FormData, fetch:readSelection}),
  }, {fetch:readSelection});
  await browserUpload.uploadSelectedFile("preview", async (_path, {body}) => {
    assert.deepEqual(new Uint8Array(await body.get("file").arrayBuffer()), photoBytes);
  }, {uri:"blob:photo", name:"receipt.jpg", mimeType:"image/jpeg"});
  assert.equal(browserReads, 1);
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
  for (const [kind, endpoint] of [["Group","split-bill-groups"],["Person","split-bill-people"],["Payment","split-bill-payment-profiles"]]) {
    const ui=hooks(), requests=[];
    let closed=0, saved=0;
    const {TogetherEntry}=load("../mobile/src/together-entry.tsx", {
      react:ui.h,"react/jsx-runtime":jsx,"./ui":{Field:"Field",Screen:"Screen",Notice:"Notice",Body:"Body"},
      "./plan-ui":{PlanAction:"Action",PlanHeader:"Header"},
      "./split-people-field":{SplitPeopleField:"People",mergePeople:(names,draft)=>[...new Set([...names,...draft].filter(Boolean))]},
      "./session":{useSession:()=>({profileId:"qa",request:async(url,opts)=>{requests.push({url,data:JSON.parse(opts.body)});}})},
    });
    const render=()=>nodes(ui.render(()=>TogetherEntry({kind,savedPeople:[],onClose:()=>closed++,onSaved:()=>saved++})));
    const field=render().find(n=>n.type==="Field");
    field?.props.onChangeText("QA "+kind);
    render().find(n=>n.type==="People")?.props.onDraft("QA member");
    const submit=render().find(n=>n.props.title==="Save "+kind);
    submit.props.onPress(); submit.props.onPress();
    await flush();
    assert.equal(requests.length,1);
    assert.equal(requests[0].url,endpoint+"?workspaceId=qa");
    assert.equal(closed,1); assert.equal(saved,1);
    if(kind==="Group")assert.equal(requests[0].data.members[0].name,"QA member");
    if(kind==="Person")assert.equal(requests[0].data.name,"QA member");
    if(kind==="Payment")assert.equal(requests[0].data.label,"QA Payment");
    ui.stop();
  }
  {
    const contacts = [{id:"naomi",userId:"owner",name:"Naomi",email:"confirmed@example.test"}];
    let owner = "owner";
    const tx = {
      $executeRaw: async () => {},
      splitBillPerson: {
        findFirst: async ({where}) => contacts.find(p => p.userId===where.userId &&
          (!where.id || (typeof where.id==="string" ? p.id===where.id : p.id!==where.id.not)) &&
          (!where.OR || where.OR.some(clause=>Object.entries(clause).every(([field,match])=>p[field]?.toLowerCase()===match.equals.toLowerCase())))),
        create: async ({data}) => {const p={id:"new",...data};contacts.push(p);return p;},
        update: async ({where,data}) => Object.assign(contacts.find(p=>p.id===where.id),data),
      },
    };
    const {POST} = load("app/api/split-bill-people/route.ts",{
      "@/lib/split-bill-people":{}, "next/server":{NextResponse:{json:(body,opts)=>({...body,status:opts.status})}},
      zod:require("zod"), "@/lib/prisma":{prisma:{$transaction:async fn=>fn(tx)}},
      "@/lib/split-bill-access":{getSplitBillCurrentUser:async()=>({id:owner})},
    });
    const {PATCH} = load("app/api/split-bill-people/[personId]/route.ts",{
      "next/server":{NextResponse:{json:(body,opts)=>({...body,status:opts?.status??200})}},
      zod:require("zod"), "@/lib/prisma":{prisma:{$transaction:async fn=>fn(tx)}},
      "@/lib/split-bill-access":{getSplitBillCurrentUser:async()=>({id:owner})},
    });
    const edit=(personId,body)=>PATCH({json:async()=>body},{params:Promise.resolve({personId})});
    const save=body=>POST({json:async()=>body});
    const existing=await save({name:" naomi ",phone:"+63912345",email:"different@example.test"});
    assert.equal(existing.status,200);
    assert.equal(existing.person.email,"confirmed@example.test");
    assert.equal(existing.person.phone,"+63912345");
    assert.equal((await edit("naomi",{name:"Nao",email:null,phone:"5550101"})).status,200);
    assert.equal(contacts[0].name,"Naomi");
    assert.equal(contacts[0].displayName,"Nao");
    assert.equal(contacts[0].email,null);
    assert.equal((await save({name:"Nao",fromContacts:true})).person.id,"naomi");
    assert.equal(contacts[0].fromContacts,true);
    owner="another-owner";
    assert.equal((await edit("naomi",{name:"Changed"})).status,404);
    assert.equal((await save({name:"Naomi"})).status,201);
    assert.equal(contacts.length,2);
    assert.equal(contacts[1].email,undefined);
    assert.equal((await save({name:"Bad",email:"invalid"})).status,400);
  }
  for (const name of ["Naomi", "Ari"]) {
    const ui = hooks(), writes = [], saved = [];
    const {SplitPersonSearch} = load("components/split-person-search.tsx", {react:ui.h,"react/jsx-runtime":jsx},{
      fetch:async (url,opts)=>{
        writes.push(JSON.parse(opts.body));
        return {ok:true,json:async()=>({person:{name,id:"new"}})};
      },
    });
    const render=()=>nodes(ui.render(()=>SplitPersonSearch({search:"",onSearch:()=>{},people:[{id:"existing",name:"Naomi"}],onSaved:p=>saved.push(p)})));
    render().find(n=>n.type==="input").props.ref.current.focus=()=>{};
    const submit=()=>render().find(n=>n.type==="form").props.onSubmit({preventDefault(){}});
    submit();
    render().find(n=>n.type==="input").props.onChange({target:{value:name==="Naomi"?"na":name}});
    if(name==="Naomi") render().find(n=>n.type==="button" && text(n)==="Naomi").props.onClick();
    submit(); await flush();
    assert.equal(saved[0].name,name);
    assert.equal(writes.length,name==="Naomi"?0:1);
    ui.stop();
  }
  for (const scenario of ["existing", "manual", "contact", "cancel"]) {
    const ui = hooks(), writes = [], saved = [];
    const existing = {id:"known",name:"Naomi"};
    const picked = {name:"Ari",phone:"+639000000000",email:"ari@example.test"};
    const {AddSplitPerson} = load("../mobile/src/add-split-person.tsx", {
      react:ui.h, "react/jsx-runtime":jsx, "react-native":{View:"View"},
      "expo-modules-core":{requireOptionalNativeModule:()=>({pick:async()=>scenario==="cancel"?null:picked})},
      "./plan-ui":{PlanAction:"Action"}, "./ui":{Field:"Field",Notice:"Notice"},
      "./session":{useSession:()=>({profileId:"qa",request:async(url,opts)=>{
        const body=JSON.parse(opts.body); writes.push(body);
        return {person:{id:"new",...body}};
      }})},
    });
    const render=()=>nodes(ui.render(()=>AddSplitPerson({initial:"",people:[existing],onSaved:p=>saved.push(p),onCancel:()=>{}})));
    const action=title=>render().find(n=>n.props.title===title || n.props.accessibilityLabel===title).props.onPress();
    if (scenario==="contact" || scenario==="cancel") await action("From Contacts");
    else render().find(n=>n.type==="Field").props.onChangeText(scenario==="existing"?"na":"Ari");
    if (scenario==="existing") await action("Naomi");
    if (scenario==="cancel") {
      assert.equal(render().find(n=>n.type==="Field").props.value,"");
      assert.equal(saved.length,0);
    } else {
      await action("+ Add Person");
      assert.equal(saved.length,1);
      assert.equal(writes.length,scenario==="existing"?0:1);
      if (scenario==="existing") assert.equal(saved[0].id,"known");
      if (scenario==="contact") assert.deepEqual(writes[0],{...picked,fromContacts:true});
    }
    ui.stop();
  }
  for (const platform of ["ios","android"]) {
    const ui = hooks();
    const saved = [];
    const captured = {uri:"file:///cache/123.jpg",fileName:"receipt.jpg",mimeType:"image/jpeg"};
    let receiptPreviewed = false;
    let reliableForScopedSplit = false;
    let progressive = false;
    let draftId = "test-draft";
    let finishRefinement, interruptRefinement;
    let printedBillDate = "2026-11-20";
    let visible = true;
    const {HostedBillEditor} = load("../mobile/src/direct-bill-editor.tsx", {
      "../../shared/currency-mark": load("../shared/currency-mark.ts"),
      react: {...ui.h,createContext:()=>({})}, "./entry-overlay":{EntryOverlay:"Overlay"}, "react-native-safe-area-context":{useSafeAreaInsets:()=>({bottom:0})}, "react/jsx-runtime": jsx, "react-native": {Platform:{OS:platform},View:"View",TextInput:"Input",Pressable:"Button"},
      "@clerk/expo": {useUser:()=>({user:{fullName:"Personal profile name"}})},
      "expo-crypto": {randomUUID:require("node:crypto").randomUUID}, "expo-image-picker": {requestCameraPermissionsAsync:async()=>({granted:true}),launchCameraAsync:async()=>({canceled:false,assets:[captured]}),launchImageLibraryAsync:async()=>({canceled:false,assets:[captured]})}, "expo-document-picker": {getDocumentAsync:async()=>({canceled:false,assets:[{...captured,name:"receipt.jpg"}]})},
      "./split-people-field": {...load("../mobile/src/split-people-field.tsx", {"react/jsx-runtime":jsx,"react-native":{},"./app-text":{},"./ui":{}}), PeopleSuggestions:"Suggestions"}, "./split-item-grid": {SplitItemGrid:"Items"}, "../../shared/split-bill-experience": load("../shared/split-bill-experience.ts"),
      "./add-entry-methods": {AddEntryMethods:"Methods"}, "./upload": loadPhotoUpload(platform),
      "./ai-consent": {useCloudAiConsent:()=>({ensure:async()=>true,prompt:null})},
      "./upload-selected-file": load("../mobile/src/upload-selected-file.ts", {"expo-crypto":{}, "./offline/file-storage":{}, "../../shared/receipt-upload":{receiptMultipartLimit:1572864}, "react-native":{Platform:{OS:platform}}, "./upload":loadPhotoUpload(platform)}),
      "./session": {useSession:()=>({profileId:"profile",request:async (_path, opts)=>{if (_path.startsWith("split-bill-receipts/preview")) {
          if (_path.includes("&refine=")) return new Promise((resolve,reject) => { finishRefinement = resolve; interruptRefinement = reject; });
          const {body,boundary} = await convertFormDataAsync(opts.body);
          const req = new Request("https://example.invalid", {method:"POST",body,headers:{"content-type":"multipart/form-data; boundary="+boundary}});
          const file = (await req.formData()).get("file");
          assert.equal(file.name,"receipt.jpg");
          assert.deepEqual(new Uint8Array(await file.arrayBuffer()), photoBytes);
          receiptPreviewed=true;
          return {...(progressive ? {draftId,refining:true,attemptId:"test-attempt"} : {}),reliableForScopedSplit,receiptStorageKey:"receipt",preview:{merchantName:"Bakery",total:"12.00",billDate:printedBillDate,currency:"PHP",serviceCharge:"1.25",items:[{description:"Bread",amount:"10.75"}]}};
        }
        saved.push(JSON.parse(opts.body)); return {bill:{id:"saved"}};}})},
      "./ui": {useTheme:()=>({colors:{}}),Field:"Field",Screen:"Screen",Body:"Body",CategoryMark:"CategoryMark"},
      "./plan-ui": {PlanHeader:"Header",PlanAction:"Action",usePlanData:()=>({})}, "./app-text":{Text:"Text"},
      "./account-type-mark": {AccountTypeMark:"Account"}, "./transaction-entry":{ChoiceField:"Choice"},
    });
    const context = {circleId:"trip",currency:"PHP",group:{id:"group",name:"Trip",recorderName:"Alex",members:[
      {id:"m1",name:"Bea"},{id:"m2",name:"Alex"},{id:"m3",name:"Carlo"}]}};
    const render = () => nodes(ui.render(() => HostedBillEditor({context, visible, setVisible:value=>visible=value, onSaved:()=>{}, onClose:()=>{}})));
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
      assert.equal(visible,false);
      render().find(n=>n.props.accessibilityRole==="button").props.onPress();
      assert.equal(visible,true);
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
    reliableForScopedSplit = true;
    render().find(n=>n.type==="Methods").props.onUploadSource("file");
    await flush(); render(); await flush(); render();
    assert.equal(saved.length,3,"A reliable scoped receipt creates exactly one bill in the background");
    assert.equal(saved[2].circleId,"trip");
    assert.deepEqual(saved[2].reviewedItems.map(i=>[i.description,i.amount]),[["Bread","10.75"],["Service Charge","1.25"]]);
    assert.equal(saved[2].reviewedItems[0].splitMethod,"equal");
    assert.deepEqual(Array.from(saved[2].reviewedItems[0].participantIndexes),[0,1]);
    printedBillDate = null;
    visible = true;
    render().find(n=>n.type==="Methods").props.onUploadSource("file");
    await flush(); render(); await flush(); render();
    assert.equal(saved.length,3,"A missing date must not inherit the preceding receipt date");
    render().find(n=>n.props.accessibilityRole==="button").props.onPress();
    assert.equal(control("label","Date (YYYY-MM-DD)").props.value,"");
    progressive = true;
    control("kind","split").props.onUploadSource("camera");
    await flush();
    assert.equal(visible,true,"A reconciled preview opens while refinement is pending");
    control("label","Name").props.onChangeText("Edited bakery");
    const editedItems = [{description:"Edited bread",amount:"12.00",participantIds:["Alex"]}];
    render().find(n=>n.type==="Items").props.onChange(editedItems);
    control("kind","split").props.onUploadSource("file");
    await flush();
    assert.equal(control("label","Name").props.value,"Edited bakery","Retry reuses the edited draft");
    interruptRefinement(Error("network disconnected"));
    await flush();
    render().find(n => n.props.accessibilityRole === "button" && text(n) === "Retry line item check").props.onPress();
    finishRefinement({draftId:"test-draft",refining:false, preview:{merchantName:"Bakery",currency:"PHP",total:"12.00",
      billDate:"2026-11-20", items:[{description:"Fresh bread",amount:"12.00"}]}});
    await flush();
    assert.equal(control("label","Date (YYYY-MM-DD)").props.value,"2026-11-20");
    assert.equal(render().find(n=>n.type==="Items").props.items[0].description,"Edited bread","Late refinement preserves item edits");
    assert.equal(saved.length,3);

    delete context.circleId;
    draftId = "group-receipt";
    printedBillDate = "2026-11-20";
    control("kind","split").props.onUploadSource("library");
    await flush();
    finishRefinement({draftId,refining:false,readyForReviewableBill:true,reliableForScopedSplit:false,
      preview:{merchantName:"Bakery",currency:"PHP",total:"12.00",billDate:printedBillDate,requiresReview:true,
        serviceCharge:"1.25",items:[{description:"Fresh bread",amount:"10.75"}]}});
    await flush();render();await flush();
    assert.equal(saved.length,4,"The reviewable receipt persists in its group after refinement");
    assert.equal(saved[3].groupId,"group");
    assert.equal(saved[3].expense.splitOnly,true);
    assert.equal(saved[3].receipt.needsReview,true);
    assert.deepEqual(saved[3].reviewedItems.map(r=>r.amount),["10.75","1.25"]);
    ui.stop();
  }
  const {receiptServiceChargeItem} = load("../shared/split-bill-experience.ts");
  assert.equal(receiptServiceChargeItem([{amount:"90.75"},{amount:"9.25"}],"9.25","100.00"),null);
  assert.equal(receiptServiceChargeItem([{amount:"90.75"},{amount:null}],"9.25","100.00"),null);
  assert.equal(receiptServiceChargeItem([{amount:"90.75"}],"9.25","101.00"),null);
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
              serviceCharge: "9.25",
              items: [{ description: "Meal", amount: "90.75" }],
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
        "../../shared/split-bill-experience": load("../shared/split-bill-experience.ts"),
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
    assert(nodes(t).some(n=>n.props.role==="dialog"), "The completed upload opens the editable draft automatically");
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
    assert.deepEqual(payload.items.map(i=>[i.description,i.amount]),[["Meal","90.75"],["Service Charge","9.25"]]);
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

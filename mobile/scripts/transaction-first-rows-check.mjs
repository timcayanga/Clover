import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const compile = file => ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const pagination = {};
vm.runInNewContext(compile("../src/transaction-pagination.ts"), { exports: pagination });
const tick = () => new Promise(resolve => setImmediate(resolve));
const row = id => ({ id, merchantRaw: "Fixture", merchantClean: null, amount: "120", currency: "PHP", date: "2026-10-30", workspaceId: "profile-a" });
const firstPage = { transactions: [row("first")], hasMore: true, totalCount: 31, page: 1 };
const events = [];
const requests = [];
let now = 0;
let cached = null;
let stateIndex = 0;
let focus;
let effects = [];
const states = [];
const previousDeps = [];
const pending = [];
const session = {
  profileId: "profile-a", demo: false, rows: [],
  cached: () => cached,
  request: path => { requests.push(path); return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
};
const exports = {};
vm.runInNewContext(compile("../app/(tabs)/transactions.tsx"), {
  exports, encodeURIComponent, setTimeout, clearTimeout,
  require(name) {
    if (name === "react") return {
      useState(initial) { const i = stateIndex++; if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial; return [states[i], update => { states[i] = typeof update === "function" ? update(states[i]) : update; }]; },
      useRef(initial) { const i = stateIndex++; return states[i] ??= { current: initial }; },
      useCallback: fn => fn,
      useEffect(fn, deps) {
        const i = stateIndex++;
        if (!deps || !previousDeps[i] || deps.some((value, index) => value !== previousDeps[i][index])) effects.push(fn);
        previousDeps[i] = deps;
      },
    };
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment" };
    if (name === "react-native") return { FlatList: "FlatList", View: "View", Modal: "Modal", useWindowDimensions: () => ({ fontScale: 1 }) };
    if (name === "expo-router") return { useLocalSearchParams: () => ({}), useFocusEffect: fn => { focus = fn; }, router: {} };
    if (name.endsWith("/adaptive")) return { useAdaptiveLayout: () => ({ dockHeight: 48 }) };
    if (name.endsWith("/adaptive-detail")) return { AdaptiveDetail: "AdaptiveDetail", useDetailPane: () => false };
    if (name.endsWith("/session")) return { useSession: () => session };
    if (name.endsWith("/ui")) return { useTheme: () => ({ colors: {}, styles: {} }) };
    if (name.endsWith("/screen-refresh")) return { registerScreenRefresh: () => () => {} };
    if (name.endsWith("/transaction-review")) return { transactionReviewReasons: () => [] };
    if (name.endsWith("/transaction-pagination")) return pagination;
    if (name.endsWith("/transaction-filter-query")) return { emptyTransactionFilters: {}, hasTransactionFilters: () => false, transactionFilterQuery: () => "" };
    if (name.endsWith("/analytics")) return { beginTelemetry: (_kind, props) => {
      const start = now;
      return (outcome, extra) => events.push({ ...props, outcome, ...extra, duration_ms: now - start });
    } };
    return {};
  },
});
function render() {
  stateIndex = 0; effects = [];
  const tree = exports.default();
  const visit = node => {
    if (Array.isArray(node)) return node.map(visit).find(Boolean);
    if (!node?.props) return undefined;
    return node.type === "FlatList" ? node.props : visit(node.props.list ?? node.props.children);
  };
  const list = visit(tree);
  for (const effect of effects) effect();
  return list;
}
function visible(list, item = list.data[0]) {
  list.onViewableItemsChanged({ viewableItems: [{ item, isViewable: true }] });
}

render();
let blur = focus();
assert.match(requests[0], /page=1.*pagination=lookahead/);
assert.equal(render().data.length, 0);
now = 720;
pending.shift().resolve(firstPage);
await tick();
let list = render();
assert.equal(list.data[0].id, "first");
assert.equal(events.length, 0, "A successful response does not prove the list displayed rows");
now = 760;
visible(list);
assert.equal(events.at(-1).timing_boundary, "focus_to_first_viewable_rows");
assert.equal(events.at(-1).duration_ms, 760);
assert.equal(events.at(-1).row_source, "request");
visible(list);
assert.equal(events.length, 1, "Only one first-row event per focus");
list.onEndReached();
assert.match(requests.at(-1), /page=2.*pagination=lookahead/);
pending.shift().resolve({ page: 2, totalCount: 2, hasMore: false, transactions: [row("last")] });
await tick();
list = render();
assert.equal(list.data.length, 2);
list.onEndReached();
assert.equal(requests.length, 2, "Lookahead, rather than a count, stops pagination");

blur();
cached = firstPage;
now = 1000;
blur = focus();
now = 1016;
list = render();
assert.equal(events.at(-1).row_source, "cache");
assert.equal(events.at(-1).duration_ms, 16, "Same-scope visible cached rows complete before the fresh response");
const previousRequest = pending.shift();
blur();
cached = null;
session.profileId = "profile-b";
list = render();
assert.equal(list.data.length, 0, "Rows from the previous Profile disappear before the new read");
blur = focus();
previousRequest.resolve(firstPage);
await tick();
list = render();
visible(list, firstPage.transactions[0]);
assert.equal(list.data.length, 0, "A late response cannot repopulate another Profile");
now = 1040;
pending.shift().resolve({ transactions: [], totalCount: 0, hasMore: false, page: 1 });
await tick();
render();
assert.equal(events.at(-1).result, "empty");
assert.equal(events.at(-1).outcome, "completed");
blur();
console.log("PASS native Transactions: API vs viewability, cached first rows, lookahead, Profile changes and empty results");

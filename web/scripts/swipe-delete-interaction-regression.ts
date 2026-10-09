import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { walletFinish } from "../../shared/account-wallet";

type Node = { type: unknown; props: Record<string, any> };
function harness(native: boolean, props: Record<string, any>) {
  const hooks: any[] = []; let cursor = 0;
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const react = {
    useRef(value: unknown) { const i = cursor++; return hooks[i] ??= { current: value }; },
    useState(value: unknown) { const i = cursor++; if (!(i in hooks)) hooks[i] = value; return [hooks[i], (v: any) => { hooks[i] = typeof v === "function" ? v(hooks[i]) : v; }]; },
    useEffect() {},
  };
  class AnimatedValue { constructor(public value: number) {} setValue(v: number) { this.value = v; } stopAnimation() {} }
  const dependencies: Record<string, unknown> = {
    "../../shared/account-wallet": { walletFinish },
    react, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/lib/responsive-layout": { MOBILE_LAYOUT_MEDIA_QUERY: "(max-width:1100px)" },
    "react-native": { View: "View", Pressable: "Pressable", Animated: { Value: AnimatedValue, View: "AnimatedView", timing: (v: AnimatedValue, options: any) => ({ start: () => v.setValue(options.toValue) }) }, PanResponder: { create: (panHandlers: any) => ({ panHandlers }) } },
    "./ui": { useTheme: () => ({ colors: { ink: "black", white: "white", danger: "red" } }) },
    "./app-text": { Text: "Text" }, "./accessibility-preferences": { useAccessibilityPreferences: () => ({ reduceMotion: true }) },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(native ? "../mobile/src/swipe-delete-row.tsx" : "components/mobile-swipe-delete.tsx", "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Error, window: { matchMedia: () => ({ matches: true }), setTimeout: () => {} },
    require(name: string) { assert(name in dependencies, name); return dependencies[name]; },
  });
  let tree: Node;
  function render() { cursor = 0; tree = (native ? exports.SwipeDeleteRow : exports.MobileSwipeDelete)({ children: jsx("Child", {}), ...props }); }
  function all(node: any = tree): Node[] { if (!node || typeof node !== "object") return []; return [node, ...[node.props?.children].flat(Infinity).flatMap(child => all(child ?? null))]; }
  function find(predicate: (node: Node) => boolean) { const found = all().find(predicate); assert(found, "Expected rendered control"); return found; }
  const text = (node: any): string => typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : node?.props ? text(node.props.children) : "";
  function button(label: string) { return find(n => (n.type === "button" || n.type === "Pressable") && text(n) === label); }
  function press(label: string) { const node = button(label); assert(!node.props.disabled, `${label} must be enabled`); return (native ? node.props.onPress : node.props.onClick)(); }
  render(); return { render, all, find, press, button, props };
}
export async function runSwipeDeleteInteractions() {
  for (const native of [false, true]) {
    let calls = 0, release!: () => void, fail = false;
    const h = harness(native, { label: "Lunch", deleteLabel: "Delete Lunch", onDelete: async () => { calls++; if (fail) throw new Error("Connection interrupted"); await new Promise<void>(resolve => { release = resolve; }); } });
    const pointer = (x: number, y: number, type = "touch") => ({ pointerType: type, pointerId: 1, clientX: x, clientY: y, currentTarget: { setPointerCapture() {}, releasePointerCapture() {} }, preventDefault() {} });
    if (native) {
      const gestures = () => h.find(n => !!n.props.onMoveShouldSetPanResponderCapture).props;
      assert.equal(gestures().onMoveShouldSetPanResponderCapture(null, { dx: -8, dy: 0 }), false, "Small jitter must not capture");
      assert.equal(gestures().onMoveShouldSetPanResponderCapture(null, { dx: -20, dy: 50 }), false, "Vertical scroll wins");
      assert.equal(gestures().onMoveShouldSetPanResponderCapture(null, { dx: 70, dy: 0 }), false, "Right swipe on closed row stays ordinary navigation");
      assert.equal(gestures().onMoveShouldSetPanResponderCapture(null, { dx: -60, dy: 3 }), true);
      gestures().onPanResponderGrant(); gestures().onPanResponderMove(null, { dx: -60 }); gestures().onPanResponderRelease(); h.render();
    } else {
      const content = () => h.find(n => n.props.className === "mobile-swipe-delete__content").props;
      content().onPointerDown(pointer(100, 0, "mouse")); content().onPointerMove(pointer(0, 0, "mouse")); h.render();
      assert.equal(content().style["--mobile-swipe-offset"], "0px", "Mouse selection must not swipe");
      content().onPointerDown(pointer(100, 0)); content().onPointerMove(pointer(80, 50)); h.render();
      assert.equal(content().style["--mobile-swipe-offset"], "0px");
      content().onPointerDown(pointer(100, 0)); content().onPointerMove(pointer(40, 3)); content().onPointerUp(pointer(40, 3)); h.render();
      assert.equal(content().style["--mobile-swipe-offset"], "-82px");
      let blocked = false;
      content().onClickCapture({ preventDefault() { blocked = true; }, stopPropagation() {} }); assert(blocked, "Swiping cannot open details"); h.render();
    }
    assert.equal(calls, 0, "Swipe alone must never delete");
    h.press("Delete"); h.render(); assert.equal(calls, 0, "First Delete only asks for confirmation");
    h.press("Cancel"); h.render(); assert.equal(calls, 0, "Cancel preserves data");
    h.press("Delete"); h.render();
    const confirm = h.button("Confirm deletion").props;
    (native ? confirm.onPress : confirm.onClick)(); (native ? confirm.onPress : confirm.onClick)();
    assert.equal(calls, 1, "Duplicate taps send one mutation"); h.render(); assert(h.button("Cancel").props.disabled);
    release(); await new Promise(resolve => setTimeout(resolve, 0)); h.render();
    fail = true; h.press("Delete"); h.render(); h.press("Confirm deletion");
    await new Promise(resolve => setTimeout(resolve, 0)); h.render();
    assert(h.all().some(n => n.props.role === "alert" || n.props.accessibilityRole === "alert"), "Server failure stays inline");
    assert(!h.button("Confirm deletion").props.disabled, "Failed deletion can be retried");
    h.press("Cancel"); h.render(); h.props.disabled = true; h.render();
    if (native) assert.equal(h.find(n => !!n.props.onMoveShouldSetPanResponderCapture).props.onMoveShouldSetPanResponderCapture(null, { dx: -100, dy: 0 }), false);
    else assert(h.button("Delete").props.disabled);
  }
  for (const file of ["app/(tabs)/transactions.tsx", "app/(tabs)/accounts.tsx", "app/(tabs)/recurring.tsx", "app/split-bills.tsx", "src/investment-views.tsx", "src/account-history.tsx", "src/split-group-details.tsx"]) assert.match(readFileSync(`../mobile/${file}`, "utf8"), /<SwipeDeleteRow[\s>]/, `${file} must render actual swipe rows`);
  console.log("PASS web/native swipe gestures, confirmation, cancellation, double-tap guard, inline failure and retry");
}

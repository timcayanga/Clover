import { selectRecentProfile } from "../../mobile/src/profile-selection";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { hasVisitedClover, rememberCloverVisit, launchDestination, nativeEntryAccess, launchHistoryKey, type LaunchStorage } from "../../mobile/src/launch-history";

async function main() {
  const profiles = [{ id: "personal" }, { id: "family" }];
  assert.equal(selectRecentProfile(profiles, "", "family"), "family", "Cold launch restores last profile");
  assert.equal(selectRecentProfile(profiles, "personal", "family"), "personal", "Refresh preserves the active profile");
  assert.equal(selectRecentProfile(profiles, "deleted", "foreign-user-profile"), "personal", "Removed or unauthorized selections fall back safely");
  assert.equal(selectRecentProfile([], "family", "family"), "", "No profile still requires setup");
  const values = new Map<string, string>();
  const storage: LaunchStorage = { get: async key => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); } };
  const firstVisit = await hasVisitedClover(storage);
  assert.equal(firstVisit, false);
  assert.equal(launchDestination(false, false, firstVisit), "loading", "Guest routes cannot mount before Clerk hydration");
  assert.equal(launchDestination(true, true, null), "loading", "Device history also resolves before displaying routes");
  assert.equal(launchDestination(true, false, firstVisit), "welcome");
  await rememberCloverVisit(storage);
  assert.equal(launchDestination(true, false, firstVisit), "welcome", "Persisting history must not interrupt the current tutorial");
  assert.equal(launchDestination(true, false, await hasVisitedClover(storage)), "welcome", "Every signed-out launch shows the opening pages");
  assert.equal(launchDestination(true, true, false), "app", "Restored legacy accounts never display welcome");
  assert.equal(launchDestination(false, true, true), "loading");
  assert.equal(launchDestination(true, true, true), "app");
  assert.equal(launchDestination(true, false, true), "welcome", "Expired sessions and explicit sign-out return to opening pages");
  for (const legacy of ["true", "false"]) {
    values.clear(); values.set("clover-remember-session", legacy);
    assert.equal(await hasVisitedClover(storage), true, "Existing login preference migrates even if remember-me was disabled");
  }
  values.clear(); values.set(launchHistoryKey, "malformed");
  assert.equal(await hasVisitedClover(storage), true);
  const unavailable: LaunchStorage = { get: async () => { throw Error("locked"); }, set: async () => { throw Error("locked"); } };
  assert.equal(await hasVisitedClover(unavailable), true, "Storage failure falls back to login");
  await rememberCloverVisit(unavailable);
  const layout = readFileSync(new URL("../../mobile/app/_layout.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("_layout.tsx", layout, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let rootStack: ts.JsxElement | undefined;
  function findStack(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "Stack") rootStack = node;
    ts.forEachChild(node, findStack);
  }
  findStack(source);
  assert(rootStack, "The native root navigator must exist");
  function availableScreens(active: boolean, needsOnboarding: boolean | undefined, authEntry: "sign-in" | "sign-up" | null, accountDeleted = false) {
    const entry = nativeEntryAccess(active, needsOnboarding, authEntry, accountDeleted);
    const screens: string[] = [];
    function visit(children: ts.NodeArray<ts.JsxChild>) {
      for (const child of children) {
        if (ts.isJsxSelfClosingElement(child) && child.tagName.getText(source) === "Stack.Screen") {
          const name = child.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === "name");
          assert(name && ts.isJsxAttribute(name) && name.initializer && ts.isStringLiteral(name.initializer));
          screens.push(name.initializer.text);
        } else if (ts.isJsxElement(child) && child.openingElement.tagName.getText(source) === "Stack.Protected") {
          const guard = child.openingElement.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(source) === "guard");
          assert(guard && ts.isJsxAttribute(guard) && guard.initializer && ts.isJsxExpression(guard.initializer) && guard.initializer.expression);
          const expression = guard.initializer.expression.getText(source);
          assert(expression === "accountDeleted" || /^entry\.(welcome|auth|app|onboarding)$/.test(expression));
          const allowed = expression === "accountDeleted" ? accountDeleted : entry[expression.slice(6) as keyof typeof entry];
          if (allowed) visit(child.children);
        }
      }
    }
    visit(rootStack!.children);
    return screens;
  }
  for (const [active, needsOnboarding, authEntry, deleted, expected] of [
    [false, undefined, null, false, "welcome"],
    [true, undefined, "sign-in", false, "auth"],
    [true, undefined, "sign-up", false, "onboarding"],
    [true, true, null, false, "onboarding"],
    [true, false, null, false, "(tabs)"],
    [false, undefined, null, true, "account-deleted"],
  ] as const) {
    const screens = availableScreens(active, needsOnboarding, authEntry, deleted);
    assert.equal(screens[0], expected, "A public payment link must never replace the normal entry fallback");
    assert(screens.includes("payment-request"), "Guest payment links remain available in every account state");
    assert.equal(screens.length, new Set(screens).size, "Screens must not be declared twice");
  }
  assert(layout.includes('if (launchDestination(loaded, active, visited) === "loading") return null;'));
  assert(layout.includes('guard={entry.welcome}'));
  assert(layout.includes('guard={entry.app}'));
  assert(layout.includes('guard={entry.onboarding}'));
  assert(layout.includes('guard={entry.auth}'));
  for (const needsSetup of [undefined, true, false]) {
    const entry = nativeEntryAccess(true, needsSetup, true);
    assert.equal(entry.app, needsSetup === false, 'Home cannot mount until onboarding eligibility resolves');
    assert.equal(entry.auth, needsSetup === undefined, 'Keep the creating-account route during bootstrap');
    assert.equal(entry.onboarding, needsSetup !== undefined, 'Onboarding stays mounted while its completion redirect runs');
  }
  const creating = nativeEntryAccess(true, undefined, "sign-up");
  assert.equal(creating.onboarding, true, "Show onboarding while a fresh signup bootstrap is pending");
  assert.equal(creating.auth, false, "Never leave the blank Create your account screen mounted after signup");
  assert.equal(creating.app, false, "Home remains gated until onboarding is completed");
  assert.equal(nativeEntryAccess(true, undefined, "sign-in").auth, true, "Existing-account login retains bootstrap retry controls");
  assert.equal(nativeEntryAccess(true, undefined, false).coldStart, true, 'Restored sessions stay under the native splash while uncached bootstrap resolves');
  assert.equal(nativeEntryAccess(false, undefined, false).welcome, true);
  const deleted = nativeEntryAccess(false, undefined, false, true);
  assert.equal(deleted.welcome, false);
  assert.equal(deleted.auth, false);
  assert.equal(deleted.app, false);
  assert(!layout.includes('if (fontsLoaded || fontError) void SplashScreen.hideAsync()'));
  assert(layout.includes('session.data?.needsOnboarding'), "Required account setup remains enforced");
  const menu = readFileSync(new URL("../../mobile/src/ui.tsx", import.meta.url), "utf8");
  assert(menu.includes('void session.signOut()'), "Menu must use the session cleanup and unsynced-data safeguard");
  console.log("PASS native launch hydration, first/repeat signed-out openings, signup bootstrap guards, deletion completion, restored sessions, legacy migration and sign-out wiring");
}
void main();

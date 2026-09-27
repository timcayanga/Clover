import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasVisitedClover, rememberCloverVisit, launchDestination, launchHistoryKey, type LaunchStorage } from "../../mobile/src/launch-history";

async function main() {
  const values = new Map<string, string>();
  const storage: LaunchStorage = { get: async key => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); } };
  const firstVisit = await hasVisitedClover(storage);
  assert.equal(firstVisit, false);
  assert.equal(launchDestination(false, false, firstVisit), "loading", "Guest routes cannot mount before Clerk hydration");
  assert.equal(launchDestination(true, true, null), "loading", "Device history also resolves before displaying routes");
  assert.equal(launchDestination(true, false, firstVisit), "welcome");
  await rememberCloverVisit(storage);
  assert.equal(launchDestination(true, false, firstVisit), "welcome", "Persisting history must not interrupt the current tutorial");
  assert.equal(launchDestination(true, false, await hasVisitedClover(storage)), "auth", "Next launch goes directly to login even without completing signup");
  assert.equal(launchDestination(true, true, false), "app", "Restored legacy accounts never display welcome");
  assert.equal(launchDestination(false, true, true), "loading");
  assert.equal(launchDestination(true, true, true), "app");
  assert.equal(launchDestination(true, false, true), "auth", "Expired session and explicit sign-out both return to login");
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
  assert(layout.includes('if (launchDestination(loaded, active, visited) === "loading") return null;'));
  assert(layout.includes('guard={!active && welcomeAllowed}'));
  assert(!layout.includes('if (fontsLoaded || fontError) void SplashScreen.hideAsync()'));
  assert(layout.includes('session.data?.needsOnboarding'), "Required account setup remains enforced");
  const menu = readFileSync(new URL("../../mobile/src/ui.tsx", import.meta.url), "utf8");
  assert(menu.includes('void session.signOut()'), "Menu must use the session cleanup and unsynced-data safeguard");
  console.log("PASS native launch hydration, first visit, repeat visit, restored/expired sessions, legacy migration, storage failure and menu sign-out wiring");
}
void main();

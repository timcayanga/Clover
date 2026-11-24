import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PageCache } from "../src/page-cache.ts";

const source = readFileSync(new URL("../src/widget-snapshot.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;

async function launch(currencies, expectedTotal, startsOnHome = true) {
  const cache = new PageCache();
  const home = "home?workspaceId=test&currency=PHP&section=overview";
  const all = home.replace("=PHP", "=ALL");
  const accounts = "accounts?workspaceId=test";
  const calls = [];
  const request = path => cache.read(path, async () => {
    calls.push(path);
    if (path === accounts) return {accounts: []};
    return {balance: path === all ? 250 : 100, currencies};
  }, true);
  let snapshot;
  const modules = {
    react: {useEffect: effect => effect()},
    "react-native": {Platform: {OS: "ios"}},
    "expo-modules-core": {requireOptionalNativeModule: () => ({
      setWidgetSnapshot: async value => { snapshot = JSON.parse(value); },
    })},
    "expo-secure-store": {getItemAsync: async () => "false"},
    "../../shared/default-transaction-account": {mostUsedTransactionAccount: () => null},
  };
  const exports = {};
  vm.runInNewContext(code, {exports, require: id => modules[id], AbortController, Intl});
  if (startsOnHome) await request(home);
  exports.useWidgetSnapshot({profileId: "test", data: {defaultCurrency: "PHP", preferences: {
    defaults: {defaultLandingPage: startsOnHome ? "dashboard" : "accounts"},
  }}, request}, true);
  await new Promise(resolve => setImmediate(resolve));
  await request(accounts);
  assert.deepEqual(calls, [...(startsOnHome ? [home] : []), accounts, ...(expectedTotal === 250 ? [all] : [])]);
  assert.equal(snapshot.total, new Intl.NumberFormat(undefined, {style: "currency", currency: "PHP"}).format(expectedTotal));
}
await launch(["PHP"], 100);
await launch(["PHP","USD"], 250);
await launch(undefined, 250);
await launch(["PHP"], 250, false);
console.log("PASS widget and screen share Home and Accounts reads and preserve converted totals");

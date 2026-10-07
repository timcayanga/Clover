import assert from "node:assert/strict";
import { GET } from "../app/api/fx-rate/route";
import { mobileOperation } from "../lib/mobile-api-policy";
async function main() {
const originalFetch = global.fetch;
let calls = 0;
let entry: unknown = {
  base: "USD",
  quote: "PHP",
  rate: 56,
  date: "2026-10-07",
};
global.fetch = async () => {
  calls++;
  return Response.json([entry]);
};
const get = (query: string) =>
  GET(new Request(`https://clover.example/api/fx-rate?${query}`));
try {
  assert.equal((await get("base=../USD&quote=PHP")).status, 400);
  assert.equal(calls, 0);
  assert.equal((await (await get("base=PHP&quote=PHP")).json()).rate, 1);
  assert.equal(calls, 0);
  assert.equal((await (await get("base=USD&quote=PHP")).json()).rate, 56);
  for (const bad of [
    { rate: 0 },
    { rate: -1 },
    { quote: "EUR" },
    { base: "EUR" },
    { date: "" },
  ]) {
    entry = { base: "USD", quote: "PHP", rate: 56, date: "2026-10-07", ...bad };
    assert.equal((await get("base=USD&quote=PHP")).status, 404);
  }
  global.fetch = async () => {
    throw new Error("Timeout");
  };
  assert.equal((await get("base=USD&quote=PHP")).status, 502);
  assert.equal(mobileOperation("GET", ["fx-rate"]), "fx-rate");
  assert.equal(mobileOperation("POST", ["fx-rate"]), null);
  console.log(
    "FX route regression passed: identity, codes, positive rates, pair validation, outage and mobile read-only operation.",
  );
} finally {
  global.fetch = originalFetch;
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });

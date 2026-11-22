// Run with node --require tsx/cjs from web/. Only the provider and
// configuration are replaced so requests never reach a real identity.
const assert = require("node:assert/strict");
const Module = require("node:module");
const originalLoad = Module._load;
const reads = [];
const clerk = { users: { getUser: id => new Promise((resolve, reject) => reads.push({ id, resolve, reject })) } };
Module._load = function (id, ...args) {
  if (id === "@/lib/env") return { getEnv: () => ({}) };
  if (id === "@/lib/prisma") return { prisma: {} };
  if (id === "@clerk/nextjs/server") return { clerkClient: async () => clerk };
  return originalLoad.call(this, id, ...args);
};
const { isConfiguredAdminEmail } = require("../lib/admin-access.ts");
Module._load = originalLoad;
async function run() {
  const first = isConfiguredAdminEmail("one");
  const concurrent = isConfiguredAdminEmail("one");
  const second = isConfiguredAdminEmail("two");
  await Promise.resolve();
  assert.deepEqual(reads.map(r => r.id), ["one", "two"]);
  reads[0].resolve({ emailAddresses: [{ emailAddress: "hello@clover.ph", verification: { status: "verified" } }] });
  reads[1].reject(Error("fixture outage"));
  assert.deepEqual(await Promise.all([first, concurrent, second]), [true, true, false]);
  const next = Promise.all(["one", "two"].map(isConfiguredAdminEmail));
  await Promise.resolve();
  assert.deepEqual(reads.slice(2).map(r => r.id), ["one", "two"]);
  for (const read of reads.slice(2)) read.resolve({ emailAddresses: [] });
  assert.deepEqual(await next, [false, false]);
  console.log("PASS overlapping identity checks, independent identities, retry and fresh access decisions");
}
run().catch(error => { console.error(error); process.exitCode = 1; });

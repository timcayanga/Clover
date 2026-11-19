import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(await readFile(new URL("./manifest.json", import.meta.url), "utf8"));
const roots = {
  repository: fileURLToPath(new URL("../../../../", import.meta.url)),
  receipt_samples: process.env.CLOVER_RECEIPT_SAMPLES_ROOT || join(homedir(), "Documents", "Receipt Samples"),
};
const actions = { financial: "read", non_financial: "reject", uncertain: "review" };
const counts = Object.fromEntries(Object.keys(actions).map(verdict => [verdict, 0]));
const ids = new Set();
const hashes = new Set();
assert.equal(manifest.schemaVersion, 1);

for (const sample of manifest.cases) {
  assert.match(sample.id, /^[a-z0-9-]+$/);
  assert(!ids.has(sample.id), `Duplicate ID: ${sample.id}`);
  ids.add(sample.id);
  assert(Object.hasOwn(roots, sample.source), sample.id);
  const root = roots[sample.source];
  const image = resolve(root, sample.path);
  const fromRoot = relative(root, image);
  assert(fromRoot && !isAbsolute(fromRoot) && !fromRoot.split(sep).includes(".."), sample.id);
  if (sample.source === "receipt_samples") assert(fromRoot.startsWith("Organized Samples" + sep), sample.id);
  assert(Object.hasOwn(actions, sample.expected.verdict), sample.id);
  assert.equal(sample.expected.action, actions[sample.expected.verdict], sample.id);
  assert(sample.expected.reason.trim().length >= 20, sample.id);
  const digest = createHash("sha256").update(await readFile(image)).digest("hex");
  assert.equal(digest, sample.sha256, `Retained image bytes changed: ${sample.id}`);
  assert(!hashes.has(digest), `Duplicate image bytes: ${sample.id}`);
  hashes.add(digest);
  counts[sample.expected.verdict]++;
}
assert(Object.values(counts).every(count => count > 0), "Every verdict needs coverage");
console.log(JSON.stringify({ verified: ids.size, verdicts: counts }));

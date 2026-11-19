import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const readJson = async path => JSON.parse(await readFile(path, "utf8"));

// The evaluation custodian keeps this index outside Git. It contains labels
// and fingerprints only. The evaluation runner should verify image bytes
// against the index before scoring and pass only image bytes to the reader.
export function assertIndependentHoldout(holdout, exposed) {
  assert(Array.isArray(holdout) && holdout.length > 0, "A nonempty holdout index is required.");
  assert(Array.isArray(exposed), "An exposure index is required.");
  const seen = new Set();
  const exposedIds = new Set(exposed.map(sample => sample.id));
  const exposedFamilies = new Set(exposed.map(sample => sample.sourceFamily).filter(Boolean));
  const exposedHashes = new Set(exposed.map(sample => sample.sha256).filter(Boolean));

  for (const sample of holdout) {
    assert.match(sample.id, /^[a-z0-9-]+$/);
    assert.match(sample.sourceFamily, /^[a-z0-9-]+$/);
    assert.match(sample.sha256, /^[a-f0-9]{64}$/);
    assert(["financial", "non_financial", "uncertain"].includes(sample.expected?.verdict), sample.id);
    assert(sample.expected.reason?.trim(), sample.id);
    assert(!exposedIds.has(sample.id) && !exposedFamilies.has(sample.sourceFamily) &&
      !exposedHashes.has(sample.sha256), `Holdout overlaps development: ${sample.id}`);
    assert(!seen.has(sample.sourceFamily) && !seen.has(sample.sha256) &&
      !seen.has(sample.id), `Duplicate holdout source: ${sample.id}`);
    seen.add(sample.sourceFamily);
    seen.add(sample.sha256);
    seen.add(sample.id);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , holdoutPath, exposurePath] = process.argv;
  assert(holdoutPath && exposurePath, "Usage: node verify-holdout.mjs HOLDOUT_INDEX EXPOSURE_INDEX");
  const [holdout, exposure, diagnostic, regressions] = await Promise.all([
    readJson(holdoutPath),
    readJson(exposurePath),
    readJson(new URL("./manifest.json", import.meta.url)),
    readJson(new URL("./false-rejection-regressions.json", import.meta.url)),
  ]);
  assert(Array.isArray(exposure) && exposure.every(sample =>
    /^[a-z0-9-]+$/.test(sample.sourceFamily ?? "") && /^[a-f0-9]{64}$/.test(sample.sha256 ?? "")),
    "The exposure index must record source families and hashes.");
  assertIndependentHoldout(holdout, [...diagnostic.cases, ...regressions, ...exposure]);
  console.log(`Verified split metadata for ${holdout.length} held-out sources.`);
}

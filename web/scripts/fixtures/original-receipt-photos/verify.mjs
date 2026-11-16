import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, join, relative, sep } from "node:path";

const library = await realpath(process.env.CLOVER_RECEIPT_SAMPLES_ROOT ?? join(homedir(), "Documents", "Receipt Samples"));
const manifestPath = process.argv[2] ?? join(homedir(), "Documents", "Clover File Organization", "Receipt Photo QA", "original-receipt-labels.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.version, 1);
const [diagnosticPath, exposurePath] = process.argv.slice(3);
const split = diagnosticPath ? "blind" : "diagnostic";
const exposed = new Set();
if (diagnosticPath) {
  assert(exposurePath, "Provide the private prior-exposure inventory");
  const { cases: diagnostic } = JSON.parse(await readFile(diagnosticPath, "utf8"));
  const inventory = JSON.parse(await readFile(exposurePath, "utf8"));
  assert(Array.isArray(diagnostic) && diagnostic.length > 0);
  assert(Array.isArray(inventory) && inventory.length > 0);
  for (const entry of [...diagnostic, ...inventory]) {
    assert(entry.sourceFamily && /^[0-9a-f]{64}$/.test(entry.sha256));
    exposed.add(entry.sourceFamily);
    exposed.add(entry.sha256);
  }
}
assert(Array.isArray(manifest.cases) && manifest.cases.length > 0);

const states = new Set(["observed", "not_printed", "unreadable", "occluded", "cropped", "ambiguous"]);
const ids = new Set();
const blindFamilies = new Set();
const hashes = new Set();
const qualities = new Set();
const observedFields = {};
let items = 0;
let adjustments = 0;
let actual = 0;

function fact(value, pattern, label) {
  assert(value && states.has(value.state), label);
  if (value.state === "observed") {
    assert(typeof value.value === "string" && pattern.test(value.value), label);
    observedFields[label] = (observedFields[label] ?? 0) + 1;
  } else {
    assert(!Object.hasOwn(value, "value"), label);
  }
}

const text = /\S/u;
const decimal = /^-?\d+\.\d{2}$/;
for (const row of manifest.cases) {
  assert(typeof row.id === "string" && row.id.length && !ids.has(row.id));
  assert(typeof row.sourceFamily === "string" && row.sourceFamily.length);
  assert.equal(row.evaluationSplit, split);
  assert(!exposed.has(row.sourceFamily) && !exposed.has(row.sha256), "Blind sample overlaps earlier exposure");
  if (split === "blind") {
    assert(!blindFamilies.has(row.sourceFamily), "Use one blind capture per document family");
    blindFamilies.add(row.sourceFamily);
  }
  ids.add(row.id);
  assert(/^[0-9a-f]{64}$/.test(row.sha256) && !hashes.has(row.sha256), row.id);
  hashes.add(row.sha256);
  assert(["local_actual_photo", "retained_public_sample"].includes(row.sourceType), row.id);
  const actualPhoto = row.sourceType === "local_actual_photo";
  if (actualPhoto) actual++;
  const folder = actualPhoto ? "Actual Receipts" : "Organized Samples";
  const source = await realpath(join(library, row.sourcePath));
  const scoped = relative(library, source);
  assert(!isAbsolute(row.sourcePath) && !isAbsolute(scoped) && scoped.startsWith(folder + sep), row.id);
  assert([".jpg", ".jpeg", ".png", ".webp", ".heic"].includes(extname(source).toLowerCase()), row.id);
  assert.equal(createHash("sha256").update(await readFile(source)).digest("hex"), row.sha256, row.id);
  assert(Array.isArray(row.imageQuality) && row.imageQuality.length, row.id);
  row.imageQuality.forEach(tag => qualities.add(tag));
  assert(["sales_invoice", "official_receipt", "bill_slip", "temporary_bill"].includes(row.documentType), row.id);
  assert(["paid", "unconfirmed"].includes(row.paymentStatus), row.id);
  fact(row.merchant, text, "merchant");
  fact(row.date, /^\d{4}-\d\d-\d\d$/, "date");
  if (row.date.state === "observed") {
    assert.equal(new Date(row.date.value).toISOString().slice(0, 10), row.date.value, row.id);
    assert(row.date.printed, row.id);
  }
  fact(row.currency, /^[A-Z]{3}$/, "currency");
  if (row.currencyHint) {
    assert(row.currency.state !== "observed" && /^[A-Z]{3}$/.test(row.currencyHint.value) && row.currencyHint.evidence, row.id);
  }
  fact(row.total, decimal, "total");
  if (row.total.state === "observed") assert(row.total.printedLabel, row.id);
  assert(["complete", "partial", "unreadable"].includes(row.itemCoverage), row.id);
  assert(["complete", "partial", "unreadable"].includes(row.adjustmentCoverage), row.id);
  for (const item of row.items) {
    fact(item.description, text, "item_description");
    fact(item.quantity, /^\d+(?:\.\d+)?$/, "item_quantity");
    fact(item.unitPrice, decimal, "item_unit_price");
    fact(item.lineAmount, decimal, "item_line_amount");
    items++;
  }
  for (const adjustment of row.adjustments) {
    assert(adjustment.kind && adjustment.printedLabel, row.id);
    assert(["reference", "applies_to_net", "adds_to_net", "adds_to_gross", "included_in_gross", "settlement"].includes(adjustment.role), row.id);
    fact(adjustment.amount, decimal, "adjustment");
    adjustments++;
  }
}
assert(qualities.has("blurred") && qualities.has("partial_frame"), "Include natural blur and partial photos");
console.log(JSON.stringify({ verifiedPhotos: ids.size, actual, items, adjustments, observedFields, qualities: [...qualities].sort() }, null, 2));

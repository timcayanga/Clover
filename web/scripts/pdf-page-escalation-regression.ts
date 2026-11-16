import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mergePdfPageTranscript, planPdfPageEscalation } from "../lib/pdf-page-escalation";
import { readPdfPageEscalation } from "../lib/import-file-text.server";

const pages = [
  "Original statement header\nAugust 1 Item 1 8.00\nAugust 2 continuation",
  "",
  "continued from last page\nAugust 5 Item 5 20.00\nClosing Balance 45.00",
];
const plan = planPdfPageEscalation(pages)!;
assert.equal(plan.page, 2);
assert.deepEqual(plan.before, pages[0].split("\n"));
assert.deepEqual(plan.after, pages[2].split("\n"));
const recovered = "of description 9.00\nAugust 4 Item 4 8.00";
assert.equal(mergePdfPageTranscript(pages, plan, "[PAGE 2]\n" + recovered),
  [pages[0], recovered, pages[2]].join("\n"));
assert.equal(mergePdfPageTranscript(pages, plan, "[PAGE 3]\n" + recovered), null);
assert.equal(mergePdfPageTranscript(pages, plan, "August 1 Item 1 8.00"), null);
assert.equal(mergePdfPageTranscript(pages, plan, ""), null);
for (const input of [
  [pages[0], pages[2]], ["", pages[0], pages[2]], [pages[0], pages[1], "", pages[2]],
  [pages[0], "Short cover page", pages[2]], [pages[0], "", "Only one line"],
]) assert.equal(planPdfPageEscalation(input), null);

async function checkPhysicalPdf() {
  const path = process.argv[2];
  if (!path) return;
  const bytes = await readFile(path);
  const targeted = await readPdfPageEscalation(bytes, pages.join("\n"));
  assert(targeted, "Hybrid PDF must preserve its physical page gap");
  assert.deepEqual(targeted.images.map(page => page.page), [2], "Render only the unreadable page");
  assert.equal(targeted.images[0].totalPages, 3);
  assert.equal(await readPdfPageEscalation(bytes, pages[0]), null, "Do not use a mismatched text source");
}

void checkPhysicalPdf().then(() => console.log("PDF page escalation regression passed."));

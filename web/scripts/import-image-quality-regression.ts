import assert from "node:assert/strict";
import { isPhotoRetakeMessage } from "../../shared/import-photo-retake";
import { getImageQualityRetake, IMAGE_QUALITY_SIGNALS } from "../lib/import-image-quality";

for (const [signal, expectedHint] of [
  ["crop", "whole document"], ["blur", "focus"], ["glare", "reflections"], ["unreadable_text", "lighting"],
] as const) {
  const evidence = [{ signal, blocked_fields: ["total" as const] }];
  assert.equal(getImageQualityRetake(evidence, []), null);
  assert.equal(getImageQualityRetake(evidence, ["date", "currency"]), null);
  const retake = getImageQualityRetake(evidence, ["total"]);
  assert.deepEqual(retake?.signals, [signal]);
  assert.ok(retake?.message.includes(expectedHint));
  assert.ok(isPhotoRetakeMessage(retake?.message));
}
assert.equal(IMAGE_QUALITY_SIGNALS.length, 4);
assert.equal(getImageQualityRetake([], ["total", "date"]), null);
assert.equal(getImageQualityRetake([{ signal: "glare", blocked_fields: [] }], ["total"]), null);
assert.equal(isPhotoRetakeMessage("Review the total to finish this receipt."), false);
const statement = getImageQualityRetake([{ signal: "unreadable_text", blocked_fields: ["transaction_rows"] }], ["transaction_rows"]);
assert.match(statement?.message ?? "", /transaction details/);
console.log("Image quality retakes: four signals, extracted fields, unrelated blockers, and screenshot guidance passed");

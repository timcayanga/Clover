import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SourceReviewRequiredError, SOURCE_REVIEW_PHASE, sourceReviewFailureReason, sourceReviewUserMessage } from "../lib/import-source-review";
import { parseHeldNativeSource } from "../lib/held-source-contracts";
import { parseMariBankNativeLedger } from "../lib/maribank-native-ledger";
import { parsePosbStatement } from "../lib/posb-statement";
import { buildImportTelemetrySnapshot } from "../lib/import-telemetry";
import { resolveImportModalStatusDecision } from "../lib/import-modal-status";
import { getImportErrorSpecForCode, isResumableImportErrorCode } from "../lib/import-error-spec";
import { mobileApiResponse } from "../lib/mobile-api-response";

const read = (id: string) => readFileSync(`scripts/fixtures/reviewed-parser-corpus/${id}.txt`, "utf8");
const reject = (run: () => unknown) => {
  let error: unknown;
  try { run(); } catch (caught) { error = caught; }
  assert(error instanceof SourceReviewRequiredError, "Source contradictions have a typed refusal, not a transient reader failure");
  const reason = sourceReviewFailureReason(error, { parsedRows: 0, confirmedRows: 0 });
  assert.equal(reason, error.message);
  assert.equal(sourceReviewFailureReason(new Error(error.message), { parsedRows: 0, confirmedRows: 0 }), null, "Message matching must not disable a genuine reader retry");
  for (const counts of [{ parsedRows: 1, confirmedRows: 0 }, { parsedRows: 0, confirmedRows: 1 },
    { parsedRows: -1, confirmedRows: 0 }, { parsedRows: 0, confirmedRows: -1 }]) {
    assert.equal(sourceReviewFailureReason(error, counts), null, "Existing or unknown rows cannot be replaced with a zero-row refusal");
  }
  return reason!;
};

reject(() => parseHeldNativeSource(read("seabank-indonesia-columns").replace("1.000 | 1.100", "1.001 | 1.100")));
reject(() => parseHeldNativeSource(read("dbs-my-account-zero").replace("Page 3 of 3", "")));
reject(() => parseMariBankNativeLedger("MARIBANK_NATIVE_PAGES 2\npage 1 of 2"));
reject(() => parsePosbStatement(read("posb-native-everyday-alias").replace("outgoing | 50.00 |", "outgoing | -50.00 |")));
const reason = reject(() => parseHeldNativeSource("GCASH PHILIPPINES PAYMENT RECEIPT CASH IN YOUR GCASH ACCOUNT Total Price USD 0 Amount Paid USD 1000 Balance USD 1000"));
assert.match(sourceReviewUserMessage(reason), /conflicting currencies/);
assert.doesNotMatch(sourceReviewUserMessage(reason), /native|snapshot|parser/i);
const snapshot = { status: "failed", processingPhase: SOURCE_REVIEW_PHASE, processingMessage: reason,
  workflowStage: "uploading", parsedRowsCount: 0, confirmedTransactionsCount: 0 };
const telemetry = buildImportTelemetrySnapshot(snapshot);
assert.equal(telemetry.canResume, false);
assert.equal(telemetry.phaseLabel, "Review needed");
assert.equal(telemetry.message, reason, "Retain the actual source-review reason rather than a generic reading error");
for (const importMode of ["statement", "receipt"] as const) {
  const decision = resolveImportModalStatusDecision({ ...snapshot, importMode, telemetryPhase: telemetry.phase });
  assert.equal(decision.kind, "repair_needed");
  if (decision.kind === "repair_needed") assert.equal(decision.errorCode, "I-109");
  assert.equal(resolveImportModalStatusDecision({ ...snapshot, importMode, confirmedTransactionsCount: 1 }).kind, "visible", "Confirmed financial data keeps precedence");
}
assert.equal(getImportErrorSpecForCode("I-109").title, "Source needs review");
assert.equal(isResumableImportErrorCode("I-109"), false);
assert.equal(isResumableImportErrorCode("I-104"), true);
assert.equal(buildImportTelemetrySnapshot({ status: "processing", processingPhase: "queued_retry" }).canResume, true);
const mobile = mobileApiResponse("import-status", { importFile: snapshot, ...telemetry,
  confirmedTransactionsCount: 0, parsedRowsCount: 0, visibleImportComplete: false });
assert.equal((mobile.importFile as typeof snapshot).processingMessage, reason);
console.log("Source review: typed native refusals, visible reasons, stopped source retries, transient recovery and confirmed-data precedence passed.");

import assert from "node:assert/strict";
import { startClientImportTiming } from "../lib/import-client-timing";
for(const outcome of ["transaction_available","completed_without_transaction","failed","input_required"] as const) {
 let now=100;const finish=startClientImportTiming(()=>now);now=1234;
 const result=finish(outcome)!;
 assert.equal(result.clientDurationMs,1134);assert.equal(result.outcome,outcome);
 assert.equal(result.timingBoundary,"client_submission_to_import_state");
 assert.equal(finish(outcome),null,"Repeated polls/state updates must not duplicate outcomes");
 assert.deepEqual(Object.keys(result).sort(),["clientAttemptId","clientDurationMs","outcome","timingBoundary"]);
}
console.log("Client import outcome timing covers success, no-row completion, failure and input-required with one monotonic attempt span.");

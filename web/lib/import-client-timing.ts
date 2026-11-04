export type ClientImportOutcome = "transaction_available" | "completed_without_transaction" | "failed" | "input_required";
/** One browser clock and one UI attempt; never subtract server/device clocks. */
export function startClientImportTiming(now: () => number = () => performance.now()) {
  const started = now();
  const attemptId = crypto.randomUUID();
  let finished = false;
  return (outcome: ClientImportOutcome) => {
    if (finished) return null;
    finished = true;
    return { clientAttemptId: attemptId, outcome, clientDurationMs: Math.max(0, Math.round(now()-started)),
      timingBoundary: "client_submission_to_import_state" };
  };
}

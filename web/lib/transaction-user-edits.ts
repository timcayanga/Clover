/** Display-only guard: confirmed user values must not be reinterpreted from import evidence. */
export function hasTransactionUserEdits(transaction: object) {
  const payload = "normalizedPayload" in transaction ? transaction.normalizedPayload : null;
  return ("reviewStatus" in transaction && transaction.reviewStatus === "edited") || Boolean(
    payload && typeof payload === "object" && !Array.isArray(payload) &&
    "source" in payload && payload.source === "manual_edit"
  );
}

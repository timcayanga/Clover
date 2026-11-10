export function splitBillReadSurface(query: URLSearchParams) {
  if (query.get("homeSummary") === "true") return "home_split_bills_summary";
  if (query.get("summaryOnly") === "true") return "split_bills_balance_summary";
  if (query.get("groupId") || query.get("person")) return "split_bills_filtered_list";
  return "split_bills_list";
}

const failureCodes = [
  "split_bills_profile_required",
  "split_bills_unauthorized",
  "split_bills_forbidden",
  "split_bills_identity_conflict",
  "split_bills_user_context_failed",
  "split_bills_summary_load_failed",
  "split_bills_list_query_failed",
  "split_bills_settlement_load_failed",
  "split_bills_response_failed",
] as const;

export type SplitBillReadErrorCode = typeof failureCodes[number];

export function splitBillReadErrorCode(value: unknown): SplitBillReadErrorCode | undefined {
  return failureCodes.find(code => code === value);
}

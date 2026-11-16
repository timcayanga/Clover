export type ReportFilterParams = {
  accounts?: string;
  accountId?: string;
  categories?: string;
  review?: string;
  transfers?: string;
  compare?: string;
};
export function reportFilterSelection(params: ReportFilterParams = {}) {
  const list = (value: string | undefined) =>
    Array.from(
      new Set(
        (value ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ).slice(0, 100);
  return {
    accounts: list(params.accounts ?? params.accountId),
    categories: (() => {
      try {
        const decoded = JSON.parse(params.categories ?? "[]");
        if (Array.isArray(decoded))
          return Array.from(
            new Set(
              decoded.filter(
                (value): value is string => typeof value === "string",
              ),
            ),
          ).slice(0, 100);
      } catch {}
      return list(params.categories);
    })(),
    review:
      params.review === "confirmed" || params.review === "pending"
        ? params.review
        : "all",
    transfers:
      params.transfers === "include" || params.transfers === "only"
        ? params.transfers
        : "exclude",
  };
}
export function matchesReportSelection(
  row: { account: { id: string }; reviewStatus?: string },
  category: string,
  type: string,
  selection: ReturnType<typeof reportFilterSelection>,
) {
  if (selection.accounts.length && !selection.accounts.includes(row.account.id))
    return false;
  if (selection.categories.length && !selection.categories.includes(category))
    return false;
  if (
    selection.review === "confirmed" &&
    row.reviewStatus !== "confirmed" &&
    row.reviewStatus !== "edited"
  )
    return false;
  if (
    selection.review === "pending" &&
    ["confirmed", "edited", "rejected", "duplicate_skipped"].includes(
      row.reviewStatus ?? "pending_review",
    )
  )
    return false;
  if (selection.transfers === "exclude" && type === "transfer") return false;
  if (selection.transfers === "only" && type !== "transfer") return false;
  return true;
}
export function previousYearDate(date: Date) {
  const result = new Date(date);
  const month = result.getMonth();
  result.setFullYear(result.getFullYear() - 1);
  if (result.getMonth() !== month) result.setDate(0);
  return result;
}

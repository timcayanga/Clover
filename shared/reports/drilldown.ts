import type { ReportView } from "./analysis";
/** Transport only known transaction filters; callers retain the current authorized Profile. */
export function reportTransactionParams(
  view: ReportView,
  currency: string,
  from: string,
  to: string,
  categories: { id: string; name: string }[],
  extra: Record<string, string> = {},
) {
  const { category, categoryName, type, reportType, ...rest } = extra;
  const name = category ?? categoryName;
  const chosen = name ? [name] : view.categories;
  const ids = chosen.flatMap(name => {const matches=categories.filter(c=>c.name===name && c.id).map(c=>c.id);return matches.length ? matches : [name];});
  const params = new URLSearchParams({
    currency,
    dateFilterMode: "custom",
    customStart: from,
    customEnd: to,
    types: view.transfers === "only" ? "transfer" : "credit,debit",
    ...rest,
  });
  if (chosen.length)
    params.set(
      "categories",
      ids.length ? ids.join(",") : "__no_category_match__",
    );
  if (view.accounts.length) params.set("accounts", view.accounts.join(","));
  if (view.review !== "all" && !params.has("reviewFilter"))
    params.set("reviewFilter", view.review);
  const direction = type ?? reportType;
  if (direction)
    params.set(
      "types",
      direction === "income"
        ? "credit"
        : direction === "expense"
          ? "debit"
          : direction,
    );
  return params;
}

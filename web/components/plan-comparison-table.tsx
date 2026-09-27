import { PLAN_COMPARISON_KEYS, PLAN_COMPARISON_ROWS, plannedProPrices, plannedPremiumPrices, type PricingMarket } from "@/lib/public-plan-comparison";

export function PlanComparisonTable({ variant, className, paidFirst = false, market = "ph" }: { paidFirst?: boolean; variant: keyof typeof PLAN_COMPARISON_KEYS; className?: string; market?: PricingMarket }) {
  const compact = variant !== "full";
  const plusPrice = plannedProPrices(market);
  const proPrice = plannedPremiumPrices(market);
  const rows: ReadonlyArray<readonly string[]> = compact ? [
    ["Monthly", "Free", plusPrice.monthly, proPrice.monthly],
    ["Yearly", "Free", plusPrice.annual, proPrice.annual],
    ["Clover Adviser", "Basic", "Advanced", "Advanced"],
    ["Reports", "Basic", "Advanced", "Advanced"],
    ["Accounts", ...PLAN_COMPARISON_ROWS.accounts.slice(1)],
    ["Linked Banks", ...PLAN_COMPARISON_ROWS.linkedBanks.slice(1)],
    ["AI Usage", ...PLAN_COMPARISON_ROWS.ai.slice(1)],
  ] : PLAN_COMPARISON_KEYS[variant].map(key => PLAN_COMPARISON_ROWS[key]);
  return <table className={className} data-plan-comparison={variant}>
    <caption>{paidFirst ? "Clover Pro, Plus and Free features" : "Clover Free, Plus and Pro features"}</caption>
    <thead><tr><th scope="col">Feature</th>{(paidFirst ? ["Pro", "Plus", "Free"] : ["Free", "Plus", "Pro"]).map(plan => <th scope="col" key={plan}>{plan}</th>)}</tr></thead>
    <tbody>{rows.map(([label, free, plus, pro]) => <tr key={label}><th scope="row">{label}</th>{(paidFirst ? [pro, plus, free] : [free, plus, pro]).map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody>
    {compact && <tfoot><tr><td colSpan={4}>AI tokens per month · Accounts exclude cash</td></tr></tfoot>}
  </table>;
}

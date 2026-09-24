import { PLAN_COMPARISON_KEYS, PLAN_COMPARISON_ROWS } from "@/lib/public-plan-comparison";

export function PlanComparisonTable({ variant, className, paidFirst = false }: { paidFirst?: boolean; variant: keyof typeof PLAN_COMPARISON_KEYS; className?: string }) {
  return <table className={className} data-plan-comparison={variant}>
    <caption>{paidFirst ? "Clover Pro, Plus and Free features" : "Clover Free, Plus and Pro features"}</caption>
    <thead><tr><th scope="col">Feature</th>{(paidFirst ? ["Pro", "Plus", "Free"] : ["Free", "Plus", "Pro"]).map(plan => <th scope="col" key={plan}>{plan}</th>)}</tr></thead>
    <tbody>{PLAN_COMPARISON_KEYS[variant].map(key => {
      const [label, free, plus, pro] = PLAN_COMPARISON_ROWS[key];
      return <tr key={key}><th scope="row">{label}</th>{(paidFirst ? [pro, plus, free] : [free, plus, pro]).map((value, index) => <td key={index}>{value}</td>)}</tr>;
    })}</tbody>
  </table>;
}

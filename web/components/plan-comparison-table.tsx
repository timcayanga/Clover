import { PLAN_COMPARISON_KEYS, PLAN_COMPARISON_ROWS } from "@/lib/public-plan-comparison";

export function PlanComparisonTable({ variant, className }: { variant: keyof typeof PLAN_COMPARISON_KEYS; className?: string }) {
  return <table className={className} data-plan-comparison={variant}>
    <caption>Planned Clover Free and Pro features</caption>
    <thead><tr><th scope="col">Feature</th><th scope="col">Free</th><th scope="col">Pro</th></tr></thead>
    <tbody>{PLAN_COMPARISON_KEYS[variant].map(key => {
      const [label, free, pro] = PLAN_COMPARISON_ROWS[key];
      return <tr key={key}><th scope="row">{label}</th><td>{free}</td><td>{pro}</td></tr>;
    })}</tbody>
  </table>;
}

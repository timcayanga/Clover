import type { AdviserChart } from "../../shared/adviser-chart";
import { formatCurrencyAmount } from "@/lib/currency-format";
export function AdviserReportCard({chart}:{chart:AdviserChart}) {
  const max=Math.max(...chart.bars.map(bar=>bar.amount),1);
  return <figure className="adviser-report-card"><figcaption>{chart.title}</figcaption><p>{new Date(chart.from).toLocaleDateString()} – {new Date(chart.through).toLocaleDateString()} · {chart.currency}</p>{chart.bars.map((bar,index)=><div key={index}><span>{bar.label}</span><strong>{formatCurrencyAmount(bar.amount,chart.currency)}</strong><div className="adviser-report-card__track" aria-hidden="true"><i style={{width:`${bar.amount/max*100}%`}} /></div></div>)}<a href="/reports">Open Reports</a></figure>;
}

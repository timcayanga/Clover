import type { AdviserChart } from '../../shared/adviser-chart';
import { spendingPlanRows } from '../../shared/adviser-spending-plan';
import { formatCurrencyAmount } from '@/lib/currency-format';
import './adviser-spending-card.css';
export function AdviserSpendingCard({chart}:{chart:AdviserChart}) {
  const plan=chart.spendingPlan!;
  const money=(n:number)=>formatCurrencyAmount(n,chart.currency);
  const rows=spendingPlanRows(plan).filter(row=>row.amount>0);
  const protectedAmount=rows.reduce((sum,row)=>sum+row.amount,0);
  const total=Math.max(plan.availableCash+plan.expectedIncome,protectedAmount,1);
  return <section className="adviser-spending-card" aria-label="Spending room breakdown">
    <header><span>Next {plan.horizonDays} days · {chart.currency}</span><span>Estimate</span></header>
    <div className="adviser-spending-card__hero"><span>{plan.roomAfterProtection<0?'Protect your cash first':'Room after essentials'}</span><strong>{money(plan.safeToSpend)}</strong><p>{plan.roomAfterProtection<0?`${money(-plan.roomAfterProtection)} short of the protected amounts.`:'A planning ceiling, not a target to spend.'}</p></div>
    <div className="adviser-spending-card__bar" aria-hidden="true">{rows.map(row=><i key={row.label} style={{background:row.color,width:`${row.amount/total*100}%`}}/>)}<i style={{background:'#03a8c0',width:`${plan.safeToSpend/total*100}%`}}/></div>
    <div className="adviser-spending-card__cash"><span>Cash in accounts</span><strong>{money(plan.availableCash)}</strong></div>
    {plan.expectedIncome>0?<div className="adviser-spending-card__cash"><span>Income included</span><strong>{money(plan.expectedIncome)}</strong></div>:null}
    <div className="adviser-spending-card__rows">{rows.map(row=><div key={row.label}><i style={{background:row.color}}/><span>{row.label}</span><strong>{money(row.amount)}</strong></div>)}</div>
    <p className="adviser-spending-card__note">{plan.expectedIncome===0?'No future income assumed. ':''}Credit limits and investments excluded.</p>
    <details><summary>Check assumptions <span>{plan.confidence.label} confidence</span></summary><p>Based on the finances you’ve added. Review missing bills and savings you want to keep untouched.</p><ul>{plan.caveats.map((c,i)=><li key={i}>{c}</li>)}<li>Historical spending may overlap with bills. Do not deduct already-paid trip costs again; unpaid costs must fit within the remaining room.</li></ul><p>Confidence: {plan.confidence.score}/100. An estimate, not a guarantee.</p></details>
  </section>;
}

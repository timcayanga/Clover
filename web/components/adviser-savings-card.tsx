import type { AdviserChart } from '../../shared/adviser-chart';
import { savingsColors } from '../../shared/adviser-savings-plan';
import './adviser-savings-card.css';

export function AdviserSavingsCard({chart}:{chart:AdviserChart}) {
  const plan = chart.savingsPlan!;
  const money = (n:number) => new Intl.NumberFormat('en-PH',{style:'currency',currency:chart.currency,minimumFractionDigits:0,maximumFractionDigits:2}).format(n);
  const compact = (n:number) => new Intl.NumberFormat('en', {notation:'compact', maximumFractionDigits:1}).format(n);
  const width = 320 / plan.points.length;
  return <figure className="adviser-savings-card" aria-label={chart.title}>
    <figcaption>{chart.title}</figcaption>
    <strong className="adviser-savings-card__target">{money(plan.target)}</strong>
    <p className="adviser-savings-card__timeline">In {plan.months} months · Starting with {money(plan.startingAmount)}</p>
    <svg viewBox="0 0 360 235" role="img" aria-label={`Planned savings grow to ${money(plan.target)} in ${plan.months} months`}>
      <line x1="20" x2="340" y1="197" y2="197" stroke="#d8e9e9"/>
      {plan.points.map((point,i) => {
        const h = point.amount / plan.target * 152;
        const x = 20 + i * width + width * .12;
        return <g key={point.month}><rect x={x} y={197-h} width={width*.76} height={h} rx="7" fill={savingsColors[i % savingsColors.length]}/><text x={x+width*.38} y={187-h} textAnchor="middle" fill="#15383e" fontSize="13" fontWeight="600">{compact(point.amount)}</text><text x={x+width*.38} y="220" textAnchor="middle" fill="#3d6166" fontSize="11">Month {point.month}</text></g>;
      })}
    </svg>
    <div className="adviser-savings-card__monthly"><strong>{money(plan.monthlyContribution)}</strong><span>each month</span></div>
    {plan.monthlyBuffer !== null ? <p className="adviser-savings-card__buffer">{plan.monthlyBuffer < 0 ? `${money(-plan.monthlyBuffer)} monthly shortfall` : `${money(plan.monthlyBuffer)} left after bills and this plan`}</p> : null}
    <details><summary>Planning assumptions</summary><ul>
      {plan.monthlyIncome !== null ? <li>Monthly income: {money(plan.monthlyIncome)}</li> : null}
      {plan.monthlyExpenses !== null ? <li>Bills and everyday spending: {money(plan.monthlyExpenses)}</li> : null}
      <li>Starting savings: {money(plan.startingAmount)}</li>
      <li>Based on the amounts you provided. No investment returns included.</li>
      <li>This is a projection. Nothing has been moved or saved as a goal.</li>
    </ul></details>
  </figure>;
}

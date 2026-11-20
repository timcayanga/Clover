"use client";

import { useState } from "react";
import { allocationViews, investmentAllocation, type AllocationHolding, type AllocationView } from "../../shared/investment-allocation";
import { formatCurrencyAmount } from "@/lib/currency-format";
import styles from "./investment-analysis-allocation.module.css";

export function InvestmentAnalysisAllocation({ holdings, currency, currencies, onCurrency, onSubtype, onAdd }: {
  holdings: AllocationHolding[];
  currency: string;
  currencies: string[];
  onCurrency: (currency: string) => void;
  onAdd: () => void;
  onSubtype: (subtype: string) => void;
}) {
  const [view, setView] = useState<AllocationView>("Markets");
  const charts = (currency === "ALL" ? currencies : [currency]).map(code => ({
    code, ...investmentAllocation(holdings, code, view),
  })).filter(chart => chart.total > 0);
  return <article className="investments-allocation glass">
    <h3 className="reports-subtab-title">Allocation</h3>
    <div className={styles.controls}>
      <label>Currency<select value={currency} onChange={e => onCurrency(e.target.value)}>
        <option value="ALL">All Currencies</option>
        {currencies.map(code => <option key={code}>{code}</option>)}
      </select></label>
      <label>Group By<select value={view} onChange={e => setView(e.target.value as AllocationView)}>
        {allocationViews.map(label => <option key={label}>{label}</option>)}
      </select></label>
    </div>
    {!charts.length && <><p>No positive holding values in this selection.</p><button type="button" className="button button-primary button-small" onClick={onAdd}>Add investment</button></>}
    {charts.map(({code, total, slices}) => {
      let end = 0;
      const stops = slices.map(slice => {
        const start = end;
        end += slice.percent;
        return `${slice.color} ${start}% ${end}%`;
      });
      return <section key={code} aria-label={`${code} allocation by ${view}`}>
        <div className={styles.ring} role="img" aria-label={`${code} allocation by ${view}. Values listed below.`}
          style={{backgroundImage: `conic-gradient(${stops.join(", ")})`}}>
          <div><strong>{formatCurrencyAmount(total, code)}</strong><small>Portfolio value · {code}</small></div>
        </div>
        <ul className={styles.legend}>{slices.map(slice => <li key={slice.key}>
          <i aria-hidden="true" style={{backgroundColor:slice.color}}/>
          {view === "Asset Types" ? <button type="button" onClick={() => onSubtype(slice.key)}>{slice.name}</button> : <span>{slice.name}</span>}
          <span>{formatCurrencyAmount(slice.amount, code)} · {slice.percent.toFixed(1)}%</span>
        </li>)}</ul>
      </section>;
    })}
  </article>;
}

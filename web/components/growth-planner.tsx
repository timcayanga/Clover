"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";
import {
  GROWTH_LIQUIDITY_LABELS,
  GROWTH_PRODUCT_LABELS,
  buildGrowthAdviserPrompt,
  getGrowthScenarioResult,
  normalizeGrowthScenario,
  type GrowthLiquidity,
  type GrowthProductType,
  type GrowthScenario,
} from "@/lib/growth-planner";

const storageKey = "clover.growth-planner.scenarios.v1";

const productDefaults: Record<GrowthProductType, Pick<GrowthScenario, "annualRate" | "compoundingPerYear" | "taxRate" | "liquidity" | "lockMonths" | "reinvestEarnings">> = {
  time_deposit: { annualRate: 4.5, compoundingPerYear: 1, taxRate: 20, liquidity: "maturity", lockMonths: 12, reinvestEarnings: true },
  bond: { annualRate: 5, compoundingPerYear: 2, taxRate: 20, liquidity: "limited", lockMonths: 12, reinvestEarnings: true },
  savings: { annualRate: 2.5, compoundingPerYear: 12, taxRate: 20, liquidity: "anytime", lockMonths: 0, reinvestEarnings: true },
  custom: { annualRate: 4, compoundingPerYear: 1, taxRate: 0, liquidity: "limited", lockMonths: 0, reinvestEarnings: true },
};

const makeScenario = (productType: GrowthProductType, principal: number, index: number): GrowthScenario => ({
  id: `${productType}-${index}`,
  name: GROWTH_PRODUCT_LABELS[productType],
  productType,
  principal,
  years: 5,
  annualFeeRate: 0,
  earlyWithdrawalPenalty: 0,
  ...productDefaults[productType],
});

const readNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function GrowthPlanner({ currency, initialPrincipal }: { currency: string; initialPrincipal: number }) {
  const startingPrincipal = Math.max(Math.round(initialPrincipal || 100_000), 1_000);
  const [scenarios, setScenarios] = useState<GrowthScenario[]>(() => [
    makeScenario("time_deposit", startingPrincipal, 0),
    makeScenario("bond", startingPrincipal, 1),
    makeScenario("savings", startingPrincipal, 2),
  ]);
  const [selectedId, setSelectedId] = useState(() => scenarios[0]?.id ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as GrowthScenario[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setScenarios(parsed.slice(0, 4).map(normalizeGrowthScenario));
          setSelectedId(parsed[0].id);
        }
      }
    } catch {
      // Planner persistence is optional and must never block calculations.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(scenarios));
    } catch {
      // Private browsing can disable storage; live calculations still work.
    }
  }, [hydrated, scenarios]);

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0];
  const results = useMemo(() => scenarios.map(getGrowthScenarioResult), [scenarios]);
  const selectedResult = results.find((result) => result.scenario.id === selectedScenario?.id) ?? results[0];
  const maximumValue = Math.max(1, ...results.flatMap((result) => result.projections.map((projection) => projection.endingValue)));
  const adviserPrompt = buildGrowthAdviserPrompt(scenarios, currency);
  const adviserHref = `/adviser?prompt=${encodeURIComponent(adviserPrompt)}`;

  const updateScenario = (patch: Partial<GrowthScenario>) => {
    setScenarios((current) => current.map((scenario) => scenario.id === selectedScenario.id ? normalizeGrowthScenario({ ...scenario, ...patch }) : scenario));
  };

  const changeProduct = (productType: GrowthProductType) => {
    updateScenario({
      productType,
      name: GROWTH_PRODUCT_LABELS[productType],
      ...productDefaults[productType],
    });
  };

  const addScenario = () => {
    if (scenarios.length >= 4) return;
    const next = makeScenario("custom", selectedScenario.principal, Date.now());
    setScenarios((current) => [...current, next]);
    setSelectedId(next.id);
  };

  const removeScenario = () => {
    if (scenarios.length <= 1) return;
    const remaining = scenarios.filter((scenario) => scenario.id !== selectedScenario.id);
    setScenarios(remaining);
    setSelectedId(remaining[0].id);
  };

  if (!selectedScenario || !selectedResult) return null;

  const chartWidth = 640;
  const chartHeight = 220;
  const chartLeft = 34;
  const chartBottom = 28;
  const chartTop = 18;
  const plotHeight = chartHeight - chartTop - chartBottom;
  const plotWidth = chartWidth - chartLeft - 18;
  const x = (year: number) => chartLeft + (year / Math.max(selectedScenario.years, 5)) * plotWidth;
  const y = (value: number) => chartTop + plotHeight - (value / maximumValue) * plotHeight;
  const years = Array.from({ length: Math.max(selectedScenario.years, 5) + 1 }, (_, index) => index);
  const selectedLine = years.map((year) => {
    const projection = year === 0 ? { endingValue: selectedScenario.principal } : getGrowthScenarioResult({ ...selectedScenario, years: year }).selectedProjection;
    return `${x(year)},${y(projection.endingValue)}`;
  }).join(" ");

  return (
    <section className="growth-planner" aria-labelledby="growth-planner-title">
      <header className="growth-planner__header">
        <div>
          <p className="eyebrow">Scenario planning</p>
          <h2 id="growth-planner-title">Growth Planner</h2>
          <p>Compare potential outcomes without changing your recorded portfolio.</p>
        </div>
        <button className="button button-secondary button-small" type="button" onClick={addScenario} disabled={scenarios.length >= 4}>+ Add scenario</button>
      </header>

      <div className="growth-planner__scenario-tabs" role="tablist" aria-label="Growth scenarios">
        {results.map((result) => (
          <button
            key={result.scenario.id}
            type="button"
            role="tab"
            aria-selected={result.scenario.id === selectedScenario.id}
            className={result.scenario.id === selectedScenario.id ? "is-active" : ""}
            onClick={() => setSelectedId(result.scenario.id)}
          >
            <span>{result.scenario.name}</span>
            <strong>{formatCurrencyAmount(result.selectedProjection.endingValue, currency)}</strong>
          </button>
        ))}
      </div>

      <div className="growth-planner__workspace">
        <form className="growth-planner__form" onSubmit={(event) => event.preventDefault()}>
          <div className="growth-planner__form-heading">
            <div><p className="eyebrow">Scenario assumptions</p><h3>{selectedScenario.name}</h3></div>
            {scenarios.length > 1 ? <button type="button" onClick={removeScenario}>Remove</button> : null}
          </div>
          <label className="growth-planner__field growth-planner__field--wide">
            <span>Scenario name</span>
            <input value={selectedScenario.name} onChange={(event) => updateScenario({ name: event.target.value })} />
          </label>
          <label className="growth-planner__field">
            <span>Product</span>
            <select value={selectedScenario.productType} onChange={(event) => changeProduct(event.target.value as GrowthProductType)}>
              {Object.entries(GROWTH_PRODUCT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="growth-planner__field">
            <span>Starting amount</span>
            <input type="number" min="0" step="1000" inputMode="decimal" value={selectedScenario.principal} onChange={(event) => updateScenario({ principal: readNumber(event.target.value) })} />
          </label>
          <label className="growth-planner__field">
            <span>Annual rate</span>
            <div className="growth-planner__input-suffix"><input type="number" step="0.01" inputMode="decimal" value={selectedScenario.annualRate} onChange={(event) => updateScenario({ annualRate: readNumber(event.target.value) })} /><span>%</span></div>
          </label>
          <label className="growth-planner__field">
            <span>Term</span>
            <select value={selectedScenario.years} onChange={(event) => updateScenario({ years: readNumber(event.target.value) })}>
              {[1, 3, 5, 10].map((year) => <option key={year} value={year}>{year} year{year === 1 ? "" : "s"}</option>)}
            </select>
          </label>

          <button className="growth-planner__advanced-toggle" type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((current) => !current)}>
            <span>More assumptions</span><span>{advancedOpen ? "−" : "+"}</span>
          </button>
          {advancedOpen ? (
            <div className="growth-planner__advanced">
              <label className="growth-planner__field"><span>Compounding</span><select value={selectedScenario.compoundingPerYear} onChange={(event) => updateScenario({ compoundingPerYear: readNumber(event.target.value) })}><option value="1">Annually</option><option value="2">Semiannually</option><option value="4">Quarterly</option><option value="12">Monthly</option></select></label>
              <label className="growth-planner__field"><span>Tax on earnings</span><div className="growth-planner__input-suffix"><input type="number" min="0" max="100" step="0.1" value={selectedScenario.taxRate} onChange={(event) => updateScenario({ taxRate: readNumber(event.target.value) })} /><span>%</span></div></label>
              <label className="growth-planner__field"><span>Annual fees</span><div className="growth-planner__input-suffix"><input type="number" min="0" max="100" step="0.1" value={selectedScenario.annualFeeRate} onChange={(event) => updateScenario({ annualFeeRate: readNumber(event.target.value) })} /><span>%</span></div></label>
              <label className="growth-planner__field"><span>Access to funds</span><select value={selectedScenario.liquidity} onChange={(event) => updateScenario({ liquidity: event.target.value as GrowthLiquidity })}>{Object.entries(GROWTH_LIQUIDITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="growth-planner__field"><span>Minimum holding</span><div className="growth-planner__input-suffix"><input type="number" min="0" step="1" value={selectedScenario.lockMonths} onChange={(event) => updateScenario({ lockMonths: readNumber(event.target.value) })} /><span>mo</span></div></label>
              <label className="growth-planner__field"><span>Early withdrawal penalty</span><div className="growth-planner__input-suffix"><input type="number" min="0" max="100" step="0.1" value={selectedScenario.earlyWithdrawalPenalty} onChange={(event) => updateScenario({ earlyWithdrawalPenalty: readNumber(event.target.value) })} /><span>%</span></div></label>
              <label className="growth-planner__check"><input type="checkbox" checked={selectedScenario.reinvestEarnings} onChange={(event) => updateScenario({ reinvestEarnings: event.target.checked })} /><span>Reinvest interest or coupons</span></label>
            </div>
          ) : null}
          <p className="growth-planner__assumption-note">Starter rates are illustrative only. Replace them with the terms you are considering; projections are not current offers or guaranteed returns.</p>
        </form>

        <article className="growth-planner__result glass">
          <p className="eyebrow">Projected value</p>
          <strong className="growth-planner__result-value">{formatCurrencyAmount(selectedResult.selectedProjection.endingValue, currency)}</strong>
          <span>after {selectedScenario.years} year{selectedScenario.years === 1 ? "" : "s"}</span>
          <svg className="growth-planner__chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${selectedScenario.name} projected growth over ${selectedScenario.years} years`}>
            <defs><linearGradient id="growth-planner-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#35b878" stopOpacity="0.26" /><stop offset="100%" stopColor="#35b878" stopOpacity="0" /></linearGradient></defs>
            {[0, 0.5, 1].map((ratio) => <line key={ratio} x1={chartLeft} x2={chartWidth - 18} y1={chartTop + plotHeight - ratio * plotHeight} y2={chartTop + plotHeight - ratio * plotHeight} />)}
            <polygon points={`${chartLeft},${chartTop + plotHeight} ${selectedLine} ${x(Math.max(selectedScenario.years, 5))},${chartTop + plotHeight}`} />
            <polyline points={selectedLine} />
            {[0, 1, 3, 5, selectedScenario.years].filter((year, index, all) => year <= Math.max(selectedScenario.years, 5) && all.indexOf(year) === index).map((year) => <text key={year} x={x(year)} y={chartHeight - 8} textAnchor="middle">{year === 0 ? "Now" : `${year}y`}</text>)}
          </svg>
          <div className="growth-planner__milestones">
            {[1, 3, 5].map((year) => {
              const projection = selectedResult.projections.find((item) => item.year === year) ?? getGrowthScenarioResult({ ...selectedScenario, years: year }).selectedProjection;
              return <div key={year}><span>{year} year{year === 1 ? "" : "s"}</span><strong>{formatCurrencyAmount(projection.endingValue, currency)}</strong></div>;
            })}
          </div>
          <dl className="growth-planner__summary">
            <div><dt>Estimated earnings</dt><dd>{formatCurrencyAmount(selectedResult.selectedProjection.earnings, currency)}</dd></div>
            <div><dt>Effective annual return</dt><dd>{(selectedResult.effectiveAnnualRate * 100).toFixed(2)}%</dd></div>
            <div><dt>Liquidity</dt><dd><span className={`growth-planner__liquidity growth-planner__liquidity--${selectedResult.liquidityLabel.toLowerCase()}`}>{selectedResult.liquidityLabel}</span></dd></div>
            <div><dt>Earliest access</dt><dd>{selectedResult.accessLabel}</dd></div>
          </dl>
          <Link className="button button-primary" href={adviserHref}>Ask Adviser about these scenarios</Link>
        </article>
      </div>

      <section className="growth-planner__comparison glass" aria-labelledby="growth-comparison-title">
        <div><p className="eyebrow">Compare scenarios</p><h3 id="growth-comparison-title">Value and access side by side</h3></div>
        <div className="growth-planner__comparison-grid">
          {results.map((result) => (
            <button type="button" key={result.scenario.id} onClick={() => setSelectedId(result.scenario.id)} className={result.scenario.id === selectedScenario.id ? "is-active" : ""}>
              <span>{result.scenario.name}</span>
              <strong>{formatCurrencyAmount(result.selectedProjection.endingValue, currency)}</strong>
              <small>{result.scenario.annualRate.toFixed(2)}% · {result.scenario.years}y · {result.liquidityLabel} liquidity</small>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

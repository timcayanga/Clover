export type GrowthProductType = "time_deposit" | "bond" | "savings" | "custom";
export type GrowthLiquidity = "maturity" | "limited" | "anytime";

export type GrowthScenario = {
  id: string;
  name: string;
  productType: GrowthProductType;
  principal: number;
  annualRate: number;
  years: number;
  compoundingPerYear: number;
  taxRate: number;
  annualFeeRate: number;
  reinvestEarnings: boolean;
  liquidity: GrowthLiquidity;
  lockMonths: number;
  earlyWithdrawalPenalty: number;
};

export type GrowthProjection = {
  year: number;
  endingValue: number;
  earnings: number;
};

export type GrowthScenarioResult = {
  scenario: GrowthScenario;
  projections: GrowthProjection[];
  selectedProjection: GrowthProjection;
  effectiveAnnualRate: number;
  liquidityLabel: "High" | "Medium" | "Low";
  accessLabel: string;
};

export const GROWTH_PRODUCT_LABELS: Record<GrowthProductType, string> = {
  time_deposit: "Time deposit",
  bond: "Bond",
  savings: "Savings",
  custom: "Custom",
};

export const GROWTH_LIQUIDITY_LABELS: Record<GrowthLiquidity, string> = {
  maturity: "At maturity",
  limited: "Limited access",
  anytime: "Anytime",
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(Number.isFinite(value) ? value : minimum, minimum), maximum);

export const normalizeGrowthScenario = (scenario: GrowthScenario): GrowthScenario => ({
  ...scenario,
  name: scenario.name.trim() || GROWTH_PRODUCT_LABELS[scenario.productType],
  principal: clamp(scenario.principal, 0, 1_000_000_000_000),
  annualRate: clamp(scenario.annualRate, -100, 1000),
  years: clamp(Math.round(scenario.years), 1, 50),
  compoundingPerYear: [1, 2, 4, 12].includes(scenario.compoundingPerYear) ? scenario.compoundingPerYear : 1,
  taxRate: clamp(scenario.taxRate, 0, 100),
  annualFeeRate: clamp(scenario.annualFeeRate, 0, 100),
  lockMonths: clamp(Math.round(scenario.lockMonths), 0, 600),
  earlyWithdrawalPenalty: clamp(scenario.earlyWithdrawalPenalty, 0, 100),
});

export const projectGrowthScenarioAtYear = (input: GrowthScenario, year: number): GrowthProjection => {
  const scenario = normalizeGrowthScenario(input);
  const horizon = clamp(year, 0, 50);
  const taxMultiplier = 1 - scenario.taxRate / 100;
  const netAnnualRate = (scenario.annualRate / 100) * taxMultiplier - scenario.annualFeeRate / 100;
  let endingValue: number;

  if (scenario.reinvestEarnings) {
    const periodicRate = netAnnualRate / scenario.compoundingPerYear;
    endingValue = scenario.principal * Math.pow(Math.max(0, 1 + periodicRate), scenario.compoundingPerYear * horizon);
  } else {
    endingValue = scenario.principal + scenario.principal * netAnnualRate * horizon;
  }

  const safeEndingValue = Math.max(0, Number.isFinite(endingValue) ? endingValue : scenario.principal);
  return { year: horizon, endingValue: safeEndingValue, earnings: safeEndingValue - scenario.principal };
};

export const getGrowthScenarioResult = (input: GrowthScenario): GrowthScenarioResult => {
  const scenario = normalizeGrowthScenario(input);
  const projectionYears = Array.from(new Set([1, 3, 5, scenario.years])).sort((left, right) => left - right);
  const projections = projectionYears.map((year) => projectGrowthScenarioAtYear(scenario, year));
  const selectedProjection = projections.find((projection) => projection.year === scenario.years) ?? projections[0];
  const effectiveAnnualRate =
    scenario.principal > 0 && selectedProjection.year > 0
      ? Math.pow(selectedProjection.endingValue / scenario.principal, 1 / selectedProjection.year) - 1
      : 0;
  const liquidityLabel = scenario.liquidity === "anytime" ? "High" : scenario.liquidity === "limited" ? "Medium" : "Low";
  const accessLabel = scenario.liquidity === "anytime"
    ? "Access anytime"
    : scenario.lockMonths > 0
      ? `${scenario.lockMonths} month${scenario.lockMonths === 1 ? "" : "s"} minimum`
      : scenario.liquidity === "maturity"
        ? `At ${scenario.years}-year maturity`
        : "Check product terms";

  return { scenario, projections, selectedProjection, effectiveAnnualRate, liquidityLabel, accessLabel };
};

export const buildGrowthAdviserPrompt = (scenarios: GrowthScenario[], currency: string) => {
  const comparisons = scenarios.map((scenario) => {
    const result = getGrowthScenarioResult(scenario);
    return `${result.scenario.name}: starting ${currency} ${result.scenario.principal.toFixed(2)}, ${result.scenario.annualRate.toFixed(2)}% stated annual rate, ${result.scenario.years} years, projected ending value ${currency} ${result.selectedProjection.endingValue.toFixed(2)}, ${result.liquidityLabel.toLowerCase()} liquidity (${result.accessLabel})`;
  });
  return `Compare these planning scenarios with my cash flow, emergency buffer, recurring obligations, budgets, and goals: ${comparisons.join("; ")}. Explain the tradeoffs and which option best fits my liquidity needs. Treat all rates as planning assumptions, not current product offers or guaranteed returns.`;
};

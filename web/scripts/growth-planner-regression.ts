import assert from "node:assert/strict";
import { buildGrowthAdviserPrompt, getGrowthScenarioResult, projectGrowthScenarioAtYear, type GrowthScenario } from "../lib/growth-planner";

const scenario: GrowthScenario = {
  id: "td",
  name: "Time deposit",
  productType: "time_deposit",
  principal: 100_000,
  annualRate: 5,
  years: 5,
  compoundingPerYear: 1,
  taxRate: 20,
  annualFeeRate: 0,
  reinvestEarnings: true,
  liquidity: "maturity",
  lockMonths: 60,
  earlyWithdrawalPenalty: 0,
};

const yearOne = projectGrowthScenarioAtYear(scenario, 1);
assert.equal(yearOne.endingValue, 104_000, "20% tax should turn a 5% gross rate into 4% net growth");

const result = getGrowthScenarioResult(scenario);
assert.equal(Math.round(result.selectedProjection.endingValue), 121_665);
assert.equal(result.liquidityLabel, "Low");
assert.equal(result.accessLabel, "60 months minimum");
assert.deepEqual(result.projections.map((projection) => projection.year), [1, 3, 5]);

const prompt = buildGrowthAdviserPrompt([scenario], "PHP");
assert.match(prompt, /planning assumptions/);
assert.match(prompt, /liquidity needs/);
assert.match(prompt, /recurring obligations/);

const noReinvestment = projectGrowthScenarioAtYear({ ...scenario, reinvestEarnings: false }, 5);
assert.equal(noReinvestment.endingValue, 120_000, "non-reinvested earnings should use simple growth");

console.log("Growth planner regression checks passed.");

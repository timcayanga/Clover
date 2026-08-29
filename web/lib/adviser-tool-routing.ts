import type { AdviserEverydayIntent } from "@/lib/adviser-everyday";

export const ADVISER_TOOL_NAMES = [
  "open_report",
  "check_affordability",
  "calculate_safe_to_spend",
  "plan_daily_spending",
  "build_purchase_savings_plan",
  "build_saving_plan",
  "build_money_growth_plan",
  "build_income_growth_plan",
  "evaluate_financial_product_fit",
  "plan_food_spending",
  "review_investments",
  "compare_safe_to_spend_scenarios",
  "get_adviser_scenario_history",
  "get_account_summary",
  "get_income_outlook",
  "get_adviser_changes",
  "get_goal_progress",
  "find_transactions",
  "get_cashflow_outlook",
  "get_split_bill_status",
  "get_investment_summary",
  "get_budget_status",
  "estimate_investment_contribution",
  "get_investment_readiness",
  "find_data_quality_issues",
  "prepare_write_action",
  "open_clover_area",
] as const;

export type AdviserToolName = (typeof ADVISER_TOOL_NAMES)[number];

type AdviserToolRoutingInput = {
  question: string;
  everydayIntent?: AdviserEverydayIntent | null;
  asksForOverallMoneyOverview?: boolean;
  asksForSuggestedGoal?: boolean;
  asksAboutSpecificPurchase?: boolean;
  includesPurchaseAmount?: boolean;
};

const EVERYDAY_TOOL: Record<AdviserEverydayIntent, AdviserToolName> = {
  daily_spending: "plan_daily_spending",
  purchase_savings: "build_purchase_savings_plan",
  saving: "build_saving_plan",
  money_growth: "build_money_growth_plan",
  income_growth: "build_income_growth_plan",
  investment_selection: "get_investment_readiness",
  investment_review: "review_investments",
  credit_card: "evaluate_financial_product_fit",
  bank_account: "evaluate_financial_product_fit",
  food_choice: "plan_food_spending",
};

const has = (value: string, pattern: RegExp) => pattern.test(value);

/**
 * Select only tools that are clearly required for the current question.
 * A general advice question can already be answered from the grounded workspace
 * context in the system message, so it should not pay for the full tool catalog.
 */
export const selectAdviserToolNames = ({
  question,
  everydayIntent = null,
  asksForOverallMoneyOverview = false,
  asksForSuggestedGoal = false,
  asksAboutSpecificPurchase = false,
  includesPurchaseAmount = false,
}: AdviserToolRoutingInput): AdviserToolName[] => {
  const normalized = question.trim().toLowerCase();
  if (!normalized) return [];

  const isExplicitWrite = has(
    normalized,
    /\b(?:add|create|record|edit|rename|change|update|set up|remember)\b[\s\S]*\b(?:goal|budget|transaction|account|investment|split bill|payday|buffer)\b|\b(?:split this bill)\b/
  );
  if (isExplicitWrite) {
    return ["prepare_write_action"];
  }

  const asksToOpenArea = has(normalized, /\b(?:open|go to|take me to|show me)\b/) && has(
    normalized,
    /\b(?:goals?|budgeting|investments?|transactions?|accounts?|recurring|split bills?)\b/
  );
  if (asksToOpenArea) {
    return ["open_clover_area"];
  }
  if (asksForSuggestedGoal) {
    return [];
  }
  if (everydayIntent) {
    return [EVERYDAY_TOOL[everydayIntent]];
  }
  if (asksForOverallMoneyOverview) {
    return ["get_account_summary"];
  }
  if (has(normalized, /\b(?:show|open|view|see)\b[\s\S]*\b(?:report|chart|graph)\b|\b(?:report|chart|graph)\b[\s\S]*\b(?:show|open|view|see)\b/)) {
    return ["open_report"];
  }
  if (asksAboutSpecificPurchase && includesPurchaseAmount) {
    return ["check_affordability"];
  }
  if (has(normalized, /\b(?:compare|which is better|either|between|options?)\b/) && /\d/.test(normalized)) {
    return ["compare_safe_to_spend_scenarios"];
  }
  if (has(normalized, /\b(?:previous|prior|last|earlier)\b[\s\S]*\b(?:scenario|comparison)\b|\b(?:scenario|comparison)\b[\s\S]*\b(?:history|again)\b/)) {
    return ["get_adviser_scenario_history"];
  }
  if (has(normalized, /\b(?:safe to spend|how much can i spend|how much room|spend until payday|spend before payday|left until payday)\b/)) {
    return ["calculate_safe_to_spend"];
  }
  if (has(normalized, /\b(?:how much|amount|contribute|set aside)\b[\s\S]*\b(?:invest|investment|portfolio)\b|\b(?:invest|investment)\b[\s\S]*\b(?:how much|amount|contribute|set aside)\b/)) {
    return ["estimate_investment_contribution"];
  }
  if (has(normalized, /\b(?:what|where|which)\b[\s\S]*\b(?:invest|investment|stock|fund|asset)\b/)) {
    return ["get_investment_readiness"];
  }
  if (has(normalized, /\b(?:portfolio|holding|holdings|investment account|investment balance|dividend|gain|loss)\b/)) {
    return ["get_investment_summary"];
  }
  if (has(normalized, /\b(?:goal progress|progress on my goal|on track for my goal|how is my goal)\b/)) {
    return ["get_goal_progress"];
  }
  if (has(normalized, /\b(?:what changed|what is new|what's new|since i last|changed recently)\b/)) {
    return ["get_adviser_changes"];
  }
  if (has(normalized, /\b(?:duplicate|uncategorized|needs review|review queue|missing category|missing categories)\b/)) {
    return ["find_data_quality_issues"];
  }
  if (has(normalized, /\b(?:split bill|shared expense|who owes|owe me|settlement)\b/)) {
    return ["get_split_bill_status"];
  }
  if (has(normalized, /\b(?:recurring|subscription|upcoming bill|bills coming|payment due|loan payment|cash ?flow)\b/)) {
    return ["get_cashflow_outlook"];
  }
  if (has(normalized, /\b(?:budget|spending limit|within my limit|over my limit)\b/)) {
    return ["get_budget_status"];
  }
  if (has(normalized, /\b(?:payday|salary date|next income|income timing)\b/)) {
    return ["get_income_outlook"];
  }
  if (has(normalized, /\b(?:transfer|transfers|transaction|transactions|merchant|spent on|where did i spend|what did i spend)\b/)) {
    return ["find_transactions"];
  }
  if (has(normalized, /\b(?:account|accounts|balance|balances|where is my money|where.*money.*held)\b/) && !has(normalized, /\b(?:afford|purchase|safe to spend)\b/)) {
    return ["get_account_summary"];
  }

  return [];
};

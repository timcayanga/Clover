export type AdviserEverydayIntent =
  | "daily_spending"
  | "purchase_savings"
  | "saving"
  | "money_growth"
  | "income_growth"
  | "investment_selection"
  | "investment_review"
  | "credit_card"
  | "bank_account"
  | "food_choice";

export type AdviserDataCoverage = "grounded" | "partial" | "missing";

const MONEY_AMOUNT_PATTERN = /(?:₱|php|usd|\$|€|£)\s*([\d,.]+(?:\.\d{1,2})?)|\b(\d[\d,]*(?:\.\d{1,2})?)\s*([km])?\b/i;

export const classifyEverydayQuestion = (question: string): AdviserEverydayIntent | null => {
  const normalized = question.trim().toLowerCase();

  if (!normalized) {
    return null;
  }
  if (/\b(?:food|meal|eat|lunch|dinner|breakfast|groceries?)\b/.test(normalized) && /\b(?:what|which|buy|eat|afford|budget|spend)\b/.test(normalized)) {
    return "food_choice";
  }
  if (/\b(?:stop|sell|exit|drop|get rid of|cut)\b.*\b(?:invest|investment|holding|fund|stock|crypto|portfolio)\b|\b(?:invest|investment|holding|fund|stock|crypto)\b.*\b(?:stop|sell|exit|drop|get rid of|cut)\b/.test(normalized)) {
    return "investment_review";
  }
  if (/\b(?:credit card|card should i get|card can i get|best card|apply for a card)\b/.test(normalized)) {
    return "credit_card";
  }
  if (/\b(?:bank account|which bank|what bank|open an account|savings account|checking account)\b/.test(normalized)) {
    return "bank_account";
  }
  if (/\b(?:save|saving|set aside)\b.*\b(?:buy|purchase|get)\b|\b(?:save|saving|set aside)\b.*\bfor\b.*\b(?:phone|car|laptop|computer|travel|trip|holiday|home|house|appliance|gadget)\b|\bhow much\b.*\b(?:phone|car|laptop|travel|trip|purchase)\b/.test(normalized)) {
    return "purchase_savings";
  }
  if (/\b(?:budget|spend|allowance|room)\b.*\b(?:today|tonight|this day)\b|\b(?:today|tonight)\b.*\b(?:budget|spend|allowance)\b/.test(normalized)) {
    return "daily_spending";
  }
  if (/\b(?:what|where|which)\b.*\b(?:invest|investment|fund|asset|portfolio)\b|\bwhat should i invest in\b/.test(normalized)) {
    return "investment_selection";
  }
  if (/\b(?:make|earn|increase|boost)\b.*\b(?:money|income|salary|cash)\b|\bside hustle\b/.test(normalized)) {
    return "income_growth";
  }
  if (/\b(?:grow|build)\b.*\b(?:money|wealth|net worth)\b/.test(normalized)) {
    return "money_growth";
  }
  if (/\b(?:how|help me|ways? to|should i)\b.*\b(?:save|saving)\b|\bsave more\b/.test(normalized)) {
    return "saving";
  }

  return null;
};

export const extractEverydayMoneyAmount = (question: string): number | null => {
  const match = question.match(MONEY_AMOUNT_PATTERN);
  if (!match) {
    return null;
  }

  const rawValue = (match[1] ?? match[2] ?? "").replace(/,/g, "");
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (!match[1] && !match[3] && value < 100) {
    return null;
  }

  const multiplier = match[3]?.toLowerCase() === "m" ? 1_000_000 : match[3]?.toLowerCase() === "k" ? 1_000 : 1;
  return value * multiplier;
};

export const getEverydayRoutingHint = (intent: AdviserEverydayIntent | null) => {
  switch (intent) {
    case "daily_spending":
      return "Use plan_daily_spending. Give a conservative target for today and a separate maximum, then explain the strongest limitation in one sentence.";
    case "purchase_savings":
      return "Use build_purchase_savings_plan. If the price is missing, ask only for the target price. If timing is missing, show useful 3, 6, and 12 month options instead of blocking.";
    case "saving":
      return "Use build_saving_plan. Prioritize one specific spending lever and one realistic automatic savings amount when the data supports it.";
    case "money_growth":
      return "Use build_money_growth_plan. Sequence cash protection, debt or obligations, saving, and diversified investing rather than jumping straight to a product.";
    case "income_growth":
      return "Use build_income_growth_plan. Use Clover's income pattern to size the gap, but do not invent the user's skills or job options; give practical paths and ask one optional preference question.";
    case "investment_selection":
      return "Use get_investment_readiness. Give educational asset-category guidance by time horizon and loss tolerance, never a personalized security pick.";
    case "investment_review":
      return "Use review_investments. Surface concentration, losses, maturity, or cash-pressure flags, but do not issue a sell instruction without cost, goal, tax, fee, and time-horizon context.";
    case "credit_card":
      return "Use evaluate_financial_product_fit with productType credit_card. Explain the card features that fit the user's spending and repayment capacity; never promise approval or invent current issuer terms.";
    case "bank_account":
      return "Use evaluate_financial_product_fit with productType bank_account. Recommend account criteria for the user's use case; do not invent current rates, fees, or named offers.";
    case "food_choice":
      return "Use plan_food_spending. Give a practical meal budget and a few flexible food formats, not medical or dietary advice. Ask about restrictions only if needed.";
    default:
      return null;
  }
};

type DailySpendingPlanInput = {
  safeToSpend: number;
  horizonDays: number;
  baselineMonthlySpend: number;
  todaySpend: number;
  activeBudgetRemaining?: number | null;
  activeBudgetDaysRemaining?: number | null;
  accountCount: number;
  transactionCount: number;
};

export const calculateDailySpendingPlan = (input: DailySpendingPlanInput) => {
  const horizonDays = Math.max(1, Math.round(input.horizonDays || 1));
  const safeDailyCeiling = Math.max(0, input.safeToSpend) / horizonDays;
  const historicalDailyPace = Math.max(0, input.baselineMonthlySpend) / 30;
  const budgetDailyPace =
    input.activeBudgetRemaining !== null &&
    input.activeBudgetRemaining !== undefined &&
    input.activeBudgetDaysRemaining &&
    input.activeBudgetDaysRemaining > 0
      ? Math.max(0, input.activeBudgetRemaining) / input.activeBudgetDaysRemaining
      : null;
  const groundedCaps = [
    input.accountCount > 0 ? safeDailyCeiling : null,
    historicalDailyPace > 0 ? historicalDailyPace : null,
    budgetDailyPace !== null ? budgetDailyPace : null,
  ].filter((value): value is number => value !== null);
  const recommendedBeforeTodaySpend =
    groundedCaps.length > 0
      ? Math.min(...groundedCaps)
      : 0;
  const recommendedToday =
    historicalDailyPace > 0 || budgetDailyPace !== null
      ? recommendedBeforeTodaySpend
      : recommendedBeforeTodaySpend * 0.8;
  const remainingToday = Math.max(0, recommendedToday - Math.max(0, input.todaySpend));
  const coverage: AdviserDataCoverage =
    input.accountCount > 0 && input.transactionCount >= 30 && input.baselineMonthlySpend > 0
      ? "grounded"
      : input.accountCount > 0 || input.transactionCount > 0
        ? "partial"
        : "missing";

  return {
    coverage,
    recommendedToday,
    alreadySpentToday: Math.max(0, input.todaySpend),
    remainingToday,
    safeDailyCeiling,
    historicalDailyPace: historicalDailyPace || null,
    budgetDailyPace,
    horizonDays,
    method:
      groundedCaps.length > 0
        ? "Uses the lowest supported limit from protected cash, recent daily spending, and active budgets."
        : "A numeric daily allowance needs an available balance or recent spending history.",
  };
};

type PurchaseSavingsPlanInput = {
  targetAmount: number;
  currentDedicatedSavings?: number | null;
  monthlySavingsCapacity?: number | null;
  targetMonths?: number | null;
  accountCount: number;
  transactionCount: number;
};

export const calculatePurchaseSavingsPlan = (input: PurchaseSavingsPlanInput) => {
  const targetAmount = Math.max(0, input.targetAmount);
  const currentDedicatedSavings = Math.max(0, input.currentDedicatedSavings ?? 0);
  const remainingTarget = Math.max(0, targetAmount - currentDedicatedSavings);
  const targetMonths =
    input.targetMonths && Number.isFinite(input.targetMonths)
      ? Math.max(1, Math.min(120, Math.round(input.targetMonths)))
      : null;
  const scenarioMonths = targetMonths ? [targetMonths] : [3, 6, 12];
  const monthlyCapacity =
    input.monthlySavingsCapacity !== null &&
    input.monthlySavingsCapacity !== undefined &&
    Number.isFinite(input.monthlySavingsCapacity)
      ? Math.max(0, input.monthlySavingsCapacity)
      : null;
  const coverage: AdviserDataCoverage =
    monthlyCapacity !== null && input.accountCount > 0 && input.transactionCount >= 30
      ? "grounded"
      : monthlyCapacity !== null || input.accountCount > 0 || input.transactionCount > 0
        ? "partial"
        : "missing";

  return {
    coverage,
    targetAmount,
    currentDedicatedSavings,
    remainingTarget,
    scenarios: scenarioMonths.map((months) => {
      const monthlyAmount = remainingTarget / months;
      return {
        months,
        monthlyAmount,
        fitsEstimatedCapacity: monthlyCapacity === null ? null : monthlyAmount <= monthlyCapacity,
        capacityGap: monthlyCapacity === null ? null : monthlyCapacity - monthlyAmount,
      };
    }),
    estimatedMonthlyCapacity: monthlyCapacity,
    note:
      monthlyCapacity === null
        ? "The timeline math is still useful, but Clover needs reliable income and spending history to judge whether the monthly amount fits."
        : "Capacity is an estimate from historical surplus and protected cash, not a guarantee of future income.",
  };
};

type InvestmentPosition = {
  name: string;
  symbol?: string | null;
  value: number;
  costBasis?: number | null;
  maturityDate?: string | null;
};

export const buildInvestmentReview = (positions: InvestmentPosition[]) => {
  const normalized = positions
    .map((position) => ({
      ...position,
      value: Math.max(0, Number(position.value) || 0),
      costBasis:
        position.costBasis !== null && position.costBasis !== undefined && Number.isFinite(Number(position.costBasis))
          ? Math.max(0, Number(position.costBasis))
          : null,
    }))
    .filter((position) => position.value > 0);
  const totalValue = normalized.reduce((sum, position) => sum + position.value, 0);

  return normalized
    .map((position) => {
      const concentration = totalValue > 0 ? position.value / totalValue : 0;
      const returnPercent =
        position.costBasis && position.costBasis > 0
          ? ((position.value - position.costBasis) / position.costBasis) * 100
          : null;
      const flags = [
        concentration >= 0.5 ? "high_concentration" : null,
        returnPercent !== null && returnPercent <= -20 ? "large_unrealized_loss" : null,
        position.maturityDate ? "has_maturity_date" : null,
      ].filter((flag): flag is string => Boolean(flag));
      return {
        ...position,
        concentration,
        returnPercent,
        flags,
      };
    })
    .sort((left, right) => right.concentration - left.concentration);
};

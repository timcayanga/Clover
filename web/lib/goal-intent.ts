import type { GoalKey } from "@/lib/goals";

const parseAmountMatch = (match: RegExpMatchArray | null) => {
  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const suffix = match[2]?.toLowerCase();
  return amount * (suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1);
};

export const parseGoalIntentAmount = (value: string) => {
  const currencyAmount = parseAmountMatch(
    value.match(/(?:₱|php\b|p(?=\s*\d))\s*([\d,]+(?:\.\d+)?)\s*(k|m)?/i)
  );
  if (currencyAmount !== null) {
    return currencyAmount;
  }

  const compactAmount = parseAmountMatch(value.match(/\b([\d,]+(?:\.\d+)?)\s*(k|m)\b/i));
  if (compactAmount !== null) {
    return compactAmount;
  }

  return parseAmountMatch(
    value.match(/\b(?:save|target|budget|goal|costs?|worth|amount)\s+(?:of\s+)?([\d,]+(?:\.\d+)?)\b/i)
  );
};

export const detectGoalIntent = (value: string): GoalKey | null => {
  const text = value.toLowerCase();
  if (/emergency|buffer|rainy day/.test(text)) return "build_emergency_fund";
  if (/invest|portfolio|stocks?|index fund|mutual fund|etf/.test(text)) return "invest_better";
  if (/debt|loan|credit card/.test(text)) return "pay_down_debt";
  if (/spend|track|overspend/.test(text)) return "track_spending";
  if (/save|car|vehicle|house|home|school|tuition|travel|trip|phone|laptop/.test(text)) return "save_more";
  return null;
};

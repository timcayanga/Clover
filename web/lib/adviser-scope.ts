export type AdviserScopeDecision = {
  allowed: boolean;
  reason: "financial" | "clover" | "financial_follow_up" | "out_of_scope";
};

const FINANCIAL_TERMS = /\b(?:account|accounts|balance|bank|banking|bill|bills|budget|budgets|cash|cashflow|cash flow|category|categories|credit card|currency|debt|debts|dividend|expense|expenses|fee|fees|goal|goals|income|installment|installments|insurance|interest|invest|investment|investments|loan|loans|merchant|money|mortgage|net worth|payment|payments|payday|portfolio|receipt|recurring|report|reports|save|saving|savings|spend|spending|statement|statements|stock|stocks|subscription|subscriptions|tax|transaction|transactions|transfer|transfers|wallet|wealth|withdrawal)\b/i;
const STRONG_FINANCIAL_TERMS = /\b(?:account|accounts|afford|balance|bank|banking|bill|bills|budget|budgets|cash|cashflow|cash flow|cost|credit card|currency|debt|debts|dividend|expense|expenses|fee|fees|income|installment|installments|insurance|interest|invest|investment|investments|loan|loans|merchant|money|mortgage|net worth|payment|payments|payday|portfolio|price|purchase|receipt|recurring|save|saving|savings|spend|spending|stock|stocks|subscription|subscriptions|tax|transaction|transactions|transfer|transfers|wallet|wealth|withdrawal)\b/i;
const CLOVER_ACTION_TERMS = /\b(?:add|change|create|delete|edit|find|open|record|remove|review|set|show|split|track|update|upload)\b[\s\S]{0,48}\b(?:account|bill|budget|category|goal|investment|payment|receipt|report|statement|transaction|transfer)\b/i;
const PERSONAL_FINANCE_CONTEXT = /\b(?:i|i'm|i am|me|my|mine|we|our|ours|clover)\b/i;
const ACCOUNT_GROUNDED_QUESTION = /\b(?:afford|available|due|earned|income|left|owe|paid|pay|save|saved|spend|spent|spending|worth)\b/i;
const SHORT_FOLLOW_UP = /^(?:and\s+)?(?:(?:why|how|when|where|which)(?:\s+(?:is|does|did|would|that|this|it))?|(?:what|how)\s+about\b.{0,50}|can you explain(?:\s+(?:that|this|it))?|explain (?:that|this|it)|show me|open it|do that|go ahead|yes|no|okay|ok|next month|next week|this month|this week)[\s?.!]*$/i;

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

const isFinancialMessage = (message: string) => {
  const normalized = normalize(message);
  if (!normalized) return false;
  if (/\bclover\b/i.test(normalized) && /\b(?:account|adviser|app|import|page|report|transaction|upload)\b/i.test(normalized)) return true;
  if (CLOVER_ACTION_TERMS.test(normalized)) return true;
  if (!FINANCIAL_TERMS.test(normalized)) return false;
  if (STRONG_FINANCIAL_TERMS.test(normalized) && (PERSONAL_FINANCE_CONTEXT.test(normalized) || ACCOUNT_GROUNDED_QUESTION.test(normalized))) return true;
  // Product-specific nouns are useful even when users omit "my", for example
  // "Why are Transfers up?" or "Open the monthly report".
  return /\b(?:balances?|budgets?|cash ?flow|categories|category|merchants?|recurring|transactions?|transfers?)\b/i.test(normalized);
};

export const classifyAdviserScope = (
  latestMessage: string,
  conversation: Array<{ role: "user" | "assistant"; content: string }> = []
): AdviserScopeDecision => {
  const latest = normalize(latestMessage);
  if (isFinancialMessage(latest)) {
    return { allowed: true, reason: /\bclover\b/i.test(latest) ? "clover" : "financial" };
  }

  const priorConversation = conversation.slice(0, -1).slice(-6);
  const hasFinancialContext = priorConversation.some((message) => isFinancialMessage(message.content));
  const looksLikeFollowUp = latest.length <= 80 && (SHORT_FOLLOW_UP.test(latest) || !/[a-z]{5,}/i.test(latest));
  if (hasFinancialContext && looksLikeFollowUp) {
    return { allowed: true, reason: "financial_follow_up" };
  }

  return { allowed: false, reason: "out_of_scope" };
};

export const ADVISER_OUT_OF_SCOPE_REPLY =
  "I can’t help with that kind of question, but I’d be happy to help with your finances in Clover. Try asking about your accounts, transactions, spending, bills, budgets, goals, or investments.";

export const ADVISER_OUT_OF_SCOPE_SUGGESTIONS = [
  { id: "scope-spending", group: "Spending", label: "Review my spending", prompt: "What changed in my spending this month?" },
  { id: "scope-bills", group: "Bills", label: "Check upcoming bills", prompt: "What bills do I have coming up?" },
  { id: "scope-cash", group: "Cash flow", label: "Check my cash flow", prompt: "How is my cash flow looking this month?" },
];

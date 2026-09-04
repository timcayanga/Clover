import { randomUUID } from "node:crypto";
import { GOAL_OPTIONS, type GoalKey } from "@/lib/goals";

export type AdviserPlanningSurface =
  | "general"
  | "accounts"
  | "transactions"
  | "recurring"
  | "budgeting"
  | "goals"
  | "investments";
export type AdviserPlanningKind = "budget" | "goal";

export type AdviserPlanningAction = {
  id: string;
  kind: "confirm";
  type: "create_budget" | "set_goal";
  label: string;
  description: string;
  payload: Record<string, unknown>;
};

export type AdviserPlanningDraft = {
  id: string;
  kind: AdviserPlanningKind;
  title: string;
  emoji: string;
  summary: string;
  payload: Record<string, unknown>;
  missingFields: string[];
  ready: boolean;
  action?: AdviserPlanningAction;
  savedHref?: string;
  savedLabel?: string;
};

type PlanningTurnInput = {
  question: string;
  surface?: AdviserPlanningSurface;
  activeDraft?: unknown;
  defaultCurrency?: string | null;
  workspaceId: string;
};

const CURRENCIES: Array<[RegExp, string]> = [
  [/(?:₱|\bphp\b|philippine peso)/i, "PHP"],
  [/(?:\$|\busd\b|us dollar)/i, "USD"],
  [/(?:€|\beur\b|euro)/i, "EUR"],
  [/(?:£|\bgbp\b|british pound)/i, "GBP"],
  [/(?:¥|\bcny\b|\brmb\b|yuan)/i, "CNY"],
  [/(?:฿|\bthb\b|baht)/i, "THB"],
];

const CADENCES: Array<[RegExp, string]> = [
  [/\b(?:every day|daily)\b/i, "daily"],
  [/\b(?:every two weeks|every 2 weeks|biweekly|fortnightly)\b/i, "biweekly"],
  [/\b(?:every week|weekly)\b/i, "weekly"],
  [/\b(?:every quarter|quarterly)\b/i, "quarterly"],
  [/\b(?:every year|yearly|annually|annual)\b/i, "annual"],
  [/\b(?:every month|monthly|per month)\b/i, "monthly"],
];

const GOAL_MATCHERS: Array<[RegExp, GoalKey]> = [
  [/\b(?:emergency|rainy day|safety net)\b/i, "build_emergency_fund"],
  [/\b(?:debt|loan|credit card payoff|pay off)\b/i, "pay_down_debt"],
  [/\b(?:invest|investment|portfolio)\b/i, "invest_better"],
  [/\b(?:track|control|understand)\b[\s\S]{0,24}\bspend/i, "track_spending"],
  [/\b(?:save|saving|savings|fund|purchase|trip|travel|holiday|vacation|house|home|car|phone|tuition)\b/i, "save_more"],
];

const cleanText = (value: unknown, maxLength = 120) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";
const cleanCurrency = (value: unknown, fallback: string) => {
  const currency = cleanText(value, 8).toUpperCase();
  return /^[A-Z]{3,8}$/.test(currency) ? currency : fallback;
};
const cleanAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000 ? amount : null;
};

const parseExistingDraft = (value: unknown): AdviserPlanningDraft | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<AdviserPlanningDraft>;
  if ((candidate.kind !== "budget" && candidate.kind !== "goal") || !candidate.payload || typeof candidate.payload !== "object" || Array.isArray(candidate.payload)) return null;
  return {
    id: cleanText(candidate.id, 80) || randomUUID(),
    kind: candidate.kind,
    title: cleanText(candidate.title) || (candidate.kind === "budget" ? "Budget draft" : "Goal draft"),
    emoji: cleanText(candidate.emoji, 8) || (candidate.kind === "budget" ? "💰" : "🎯"),
    summary: cleanText(candidate.summary, 180),
    payload: { ...candidate.payload },
    missingFields: Array.isArray(candidate.missingFields) ? candidate.missingFields.filter((item): item is string => typeof item === "string").slice(0, 4) : [],
    ready: candidate.ready === true,
  };
};

const parseAmount = (question: string) => {
  const matches = [...question.matchAll(/(?:₱|\$|€|£|¥|\b(?:php|usd|eur|gbp|cny|rmb|thb)\s*)?([\d][\d,]*(?:\.\d{1,2})?)(?:\s*([kKmM]))?/g)];
  for (const match of matches) {
    let amount = Number((match[1] ?? "").replaceAll(",", ""));
    if (match[2]?.toLowerCase() === "k") amount *= 1_000;
    if (match[2]?.toLowerCase() === "m") amount *= 1_000_000;
    if (amount > 0 && amount <= 1_000_000_000 && !(amount >= 1900 && amount <= 2100 && !/[₱$€£¥]|php|usd|eur|gbp|cny|rmb|thb/i.test(match[0]))) return amount;
  }
  return null;
};

const parseCurrency = (question: string, fallback: string) => CURRENCIES.find(([pattern]) => pattern.test(question))?.[1] ?? fallback;
const parseCadence = (question: string, fallback: string) => CADENCES.find(([pattern]) => pattern.test(question))?.[1] ?? fallback;
const parseGoalKey = (question: string) => GOAL_MATCHERS.find(([pattern]) => pattern.test(question))?.[1] ?? null;

const titleCase = (value: string) => value
  .replace(/[_-]+/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const parseBudgetName = (question: string, current = "") => {
  const named = question.match(/\b(?:name|rename|call)\s+(?:it|this|the budget)?\s*(?:to|as)?\s*["“']?([^"”'.,]{2,48})/i)?.[1]
    ?? question.match(/\b(?:budget|limit)\s+(?:for|on)\s+(?:my\s+)?([^.,]{2,48})/i)?.[1]
    ?? question.match(/\b(?:create|build|design|make|start)\s+(?:me\s+)?(?:a\s+)?([^.,]{2,40}?)\s+budget\b/i)?.[1]
    ?? question.match(/\b(grocer(?:y|ies)|food|dining|travel|trip|holiday|vacation|transport|shopping|rent|housing|utilities|entertainment|subscriptions?)\s+budget\b/i)?.[1];
  if (!named) return current;
  const cleaned = named
    .replace(/\b(?:every day|daily|weekly|monthly|quarterly|yearly|annual|annually)\b/gi, "")
    .replace(/\b(?:budget|spending limit)\b/gi, "")
    .trim();
  return cleaned ? titleCase(`${cleaned}${/budget$/i.test(cleaned) ? "" : " budget"}`) : current;
};

const planningIntent = (question: string, surface: AdviserPlanningSurface, activeDraft: AdviserPlanningDraft | null) => {
  if (activeDraft) {
    return /\b(?:change|make|set|use|rename|call|amount|limit|target|currency|cadence|daily|weekly|monthly|quarterly|yearly|annual|budget|goal|save|debt|invest|emergency)\b|[₱$€£¥]|\d/i.test(question);
  }
  const wantsPlan = /\b(?:create|build|design|plan|set up|make|start|help me|figure out)\b/i.test(question);
  if (!wantsPlan) return false;
  if (surface === "budgeting") return /\b(?:budget|limit|spend|save|plan)\b/i.test(question);
  if (surface === "goals") return /\b(?:goal|target|save|debt|invest|emergency|plan)\b/i.test(question);
  return /\b(?:budget|spending limit|financial goal|savings goal|emergency fund|pay off debt|investment goal)\b/i.test(question);
};

const goalLabel = (goalKey: GoalKey | null) => GOAL_OPTIONS.find((goal) => goal.value === goalKey)?.title ?? "Goal";

export const buildAdviserPlanningTurn = ({ question, surface = "general", activeDraft: rawDraft, defaultCurrency = "PHP", workspaceId }: PlanningTurnInput) => {
  const existing = parseExistingDraft(rawDraft);
  if (!planningIntent(question, surface, existing)) return null;

  const inferredKind: AdviserPlanningKind = existing?.kind
    ?? (surface === "goals" || /\b(?:goal|emergency fund|pay off debt|investment goal|savings goal)\b/i.test(question) ? "goal" : "budget");
  const fallbackCurrency = cleanCurrency(existing?.payload.currency, cleanCurrency(defaultCurrency, "PHP"));
  const amount = parseAmount(question) ?? cleanAmount(existing?.payload.targetAmount);
  const currency = parseCurrency(question, fallbackCurrency);
  const cadence = parseCadence(question, cleanText(existing?.payload.cadence, 16) || "monthly");
  const id = existing?.id ?? randomUUID();

  if (inferredKind === "budget") {
    const currentName = cleanText(existing?.payload.name);
    const name = parseBudgetName(question, currentName);
    const kind = /\b(?:savings target|save toward|saving for)\b/i.test(question) ? "savings_target" : cleanText(existing?.payload.kind, 24) || "spend_limit";
    const payload = { ...existing?.payload, workspaceId, name, kind, scope: "global", cadence, targetAmount: amount, currency };
    const missingFields = [!name ? "what the budget should cover" : null, !amount ? "a target amount" : null].filter((item): item is string => Boolean(item));
    const ready = missingFields.length === 0;
    const title = name || "New budget";
    const summary = `${cadence === "annual" ? "Yearly" : cadence === "quarterly" ? "Quarterly" : cadence === "weekly" ? "Weekly" : cadence === "daily" ? "Daily" : cadence === "biweekly" ? "Every 2 weeks" : "Monthly"} ${kind === "savings_target" ? "savings target" : "spending limit"}`;
    const action: AdviserPlanningAction | undefined = ready ? {
      id: `planning-${id}`,
      kind: "confirm",
      type: "create_budget",
      label: "Create budget",
      description: `Create ${title} after your review.`,
      payload,
    } : undefined;
    const draft: AdviserPlanningDraft = { id, kind: "budget", title, emoji: kind === "savings_target" ? "🌱" : "💰", summary, payload, missingFields, ready, action };
    const reply = ready
      ? `I’ve prepared a ${summary.toLowerCase()} for ${title}. Review the card below, or ask me to change the amount, currency, cadence, or name before you create it.`
      : name
        ? `What amount should I use for ${title}? You can include the currency and say whether the limit should be weekly, monthly, quarterly, or yearly.`
        : "What should this budget cover, and what amount should Clover use as the limit?";
    return { reply, draft };
  }

  const currentGoal = cleanText(existing?.payload.goal, 40) as GoalKey | "";
  const goal = parseGoalKey(question) ?? (GOAL_OPTIONS.some((option) => option.value === currentGoal) ? currentGoal : null);
  const purpose = cleanText(existing?.payload.goalPlan && typeof existing.payload.goalPlan === "object" ? (existing.payload.goalPlan as Record<string, unknown>).purpose : null)
    || (goal ? goalLabel(goal) : "");
  const goalPlan = { goalKey: goal, targetMode: "amount", cadence: cadence === "annual" ? "annual" : "monthly", targetAmount: amount, targetPercent: null, purpose: purpose || null };
  const payload = { ...existing?.payload, workspaceId, goal, targetAmount: amount, currency, goalPlan };
  const missingFields = [!goal ? "what you want to achieve" : null, !amount ? "a target amount" : null].filter((item): item is string => Boolean(item));
  const ready = missingFields.length === 0;
  const title = goal ? goalLabel(goal) : "New goal";
  const action: AdviserPlanningAction | undefined = ready ? {
    id: `planning-${id}`,
    kind: "confirm",
    type: "set_goal",
    label: "Save goal",
    description: `Save ${title} after your review.`,
    payload,
  } : undefined;
  const draft: AdviserPlanningDraft = { id, kind: "goal", title, emoji: "🎯", summary: goalPlan.cadence === "annual" ? "Yearly target" : "Monthly target", payload, missingFields, ready, action };
  const reply = ready
    ? `I’ve prepared your ${title.toLowerCase()} goal. Review the card below, or ask me to change the target or cadence before you save it.`
    : goal
      ? `What target amount should I use for ${title.toLowerCase()}? You can also tell me whether that amount is monthly or yearly.`
      : "What would you like to achieve—save more, build an emergency fund, pay down debt, or invest more consistently?";
  return { reply, draft };
};

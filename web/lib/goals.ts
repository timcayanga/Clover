export type GoalKey =
  | "save_more"
  | "pay_down_debt"
  | "track_spending"
  | "build_emergency_fund"
  | "invest_better";

export type FinancialExperienceLevel = "beginner" | "comfortable" | "advanced";

export type GoalDefinition = {
  value: GoalKey;
  title: string;
  description: string;
  signal: string;
  coachNote: string;
  targetRate: number;
};

export type GoalMilestone = {
  label: string;
  detail: string;
  threshold: number;
};

export type GoalPlaybook = GoalDefinition & {
  heroLead: string;
  heroSupport: string;
  weeklyFocus: string[];
  milestones: GoalMilestone[];
  alertTemplates: string[];
  historyMarkers: string[];
};

export type GoalProgressContext = {
  goalKey: GoalKey | null;
  targetAmount: number | null;
  currentNet: number;
  currentSpend: number;
  monthlyIncome: number | null;
  currentSavingsRate: number | null;
  previousSavingsRate: number | null;
  spendDelta: number | null;
  recurringShare: number;
};

export type GoalProgressSnapshot = {
  label: string;
  currentLabel: string;
  currentAmount: number;
  targetAmount: number | null;
  progressPercent: number | null;
  remainingAmount: number | null;
  achieved: boolean;
  bandLabel: string;
  bandTone: "positive" | "warning" | "negative" | "neutral";
  coachCopy: string;
  nextAction: string;
};

export type FinancialExperienceProfile = {
  title: string;
  onboardingLead: string;
  onboardingSupport: string;
  goalsLead: string;
  goalsSupport: string;
  goalsShellSubtitle: string;
  dashboardSubtitle: string;
  emptyStateTitle: string;
  emptyStateCopy: string;
  currentPositionCopy: string;
  actionStripCopy: string;
};

export const FINANCIAL_EXPERIENCE_OPTIONS: Array<{
  value: FinancialExperienceLevel;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    value: "beginner",
    title: "Still learning",
    description: "Keep the language simple and show me what matters first.",
    icon: "spark",
  },
  {
    value: "comfortable",
    title: "Comfortable",
    description: "I understand budgets, statements, and basic goal tracking.",
    icon: "path",
  },
  {
    value: "advanced",
    title: "Very comfortable",
    description: "Give me the numbers, trends, and short explanations.",
    icon: "chart",
  },
];

const FINANCIAL_EXPERIENCE_PROFILES: Record<FinancialExperienceLevel, FinancialExperienceProfile> = {
  beginner: {
    title: "Start simple",
    onboardingLead: "We’ll keep the setup light and explain the first useful step clearly.",
    onboardingSupport: "Choose the level that feels closest. Clover will keep the next screens beginner-friendly.",
    goalsLead: "Pick a lane, set a number, and let Clover explain the next step in plain language.",
    goalsSupport: "We’ll keep the coaching simple, with one clear move at a time and less jargon.",
    goalsShellSubtitle: "A calm, step-by-step view of your goal with simple guidance and a place to set the number.",
    dashboardSubtitle: "See your goal pace, report trend, and key insight at a glance without the jargon.",
    emptyStateTitle: "Import files to see Clover turn statements into a clear picture.",
    emptyStateCopy:
      "Start with a statement and Clover will build the dashboard, explain the review queue, and help you understand the month one step at a time. You can add an account or enter transactions manually if that suits you better.",
    currentPositionCopy:
      "Import a statement to unlock a simple view of your cash flow, review queue, and recent activity.",
    actionStripCopy: "Bring in a statement first so Clover can show the numbers in a friendly, guided way.",
  },
  comfortable: {
    title: "Balanced detail",
    onboardingLead: "Tell Clover your comfort level, and it will keep the next screens useful without being noisy.",
    onboardingSupport: "You can still move quickly, but the app will lean into clearer progress tracking and summaries.",
    goalsLead: "Set the lane and the number, then let Clover keep the month honest.",
    goalsSupport: "You’ll get a clearer mix of coaching, progress, and pattern tracking.",
    goalsShellSubtitle: "A visual goal view with the target, progress, and next step kept easy to scan.",
    dashboardSubtitle: "A quick visual summary of goals, reports, and insights with the small follow-up items tucked away.",
    emptyStateTitle: "Import files to wake up the dashboard.",
    emptyStateCopy:
      "Upload a statement to populate balances, review items, trends, and goal progress. You can also connect an account or enter transactions manually if that is your preferred starting point.",
    currentPositionCopy:
      "Import a statement to unlock live cash flow, review items, and recent activity.",
    actionStripCopy: "Bring in a statement to populate the dashboard and reveal the next useful action.",
  },
  advanced: {
    title: "Advanced mode",
    onboardingLead: "Clover will keep things concise and focus on the numbers, not the hand-holding.",
    onboardingSupport: "Choose the level closest to you; the app will trim the explanations and get to the signal faster.",
    goalsLead: "Set the target and let the numbers do the talking.",
    goalsSupport: "You’ll see tighter summaries, quicker scans, and less explanatory copy.",
    goalsShellSubtitle: "A concise goal view with the target, pace, and trend signals front and center.",
    dashboardSubtitle: "See the goal pace, report trend, and main insight signals in one quick glance.",
    emptyStateTitle: "Import files to load the numbers fast.",
    emptyStateCopy:
      "Start with a statement if you want Clover to populate the dashboard, review queue, and goal signals immediately. You can still add an account or enter transactions manually if needed.",
    currentPositionCopy:
      "Import a statement to populate cash flow, review queue, and trend signals quickly.",
    actionStripCopy: "Statement import is the fastest path to a full dashboard and stronger goal signals.",
  },
};

export const getFinancialExperienceProfile = (experience: string | null): FinancialExperienceProfile => {
  if (experience === "comfortable") {
    return FINANCIAL_EXPERIENCE_PROFILES.comfortable;
  }

  if (experience === "advanced") {
    return FINANCIAL_EXPERIENCE_PROFILES.advanced;
  }

  return FINANCIAL_EXPERIENCE_PROFILES.beginner;
};

export const getFinancialExperienceDefinition = (experience: string | null) =>
  FINANCIAL_EXPERIENCE_OPTIONS.find((option) => option.value === experience) ?? FINANCIAL_EXPERIENCE_OPTIONS[0];

export const GOAL_OPTIONS: GoalDefinition[] = [
  {
    value: "save_more",
    title: "Save more",
    description: "Build a stronger buffer by keeping more of every paycheck on purpose.",
    signal: "Protect the first 10% before lifestyle creep gets a vote.",
    coachNote: "Small wins compound fast here. Your job is rhythm, not perfection.",
    targetRate: 20,
  },
  {
    value: "pay_down_debt",
    title: "Pay down debt",
    description: "Turn extra cash flow into faster principal reduction and less interest over time.",
    signal: "Every trimmed expense becomes fuel for the payoff plan.",
    coachNote: "This is a momentum goal. The cleaner the month, the more power you unlock.",
    targetRate: 18,
  },
  {
    value: "track_spending",
    title: "Track spending",
    description: "Stay fully aware of where money is going so surprises stop running the show.",
    signal: "Clear categories make the next decision easier.",
    coachNote: "You are building visibility muscle here. That pays off everywhere else.",
    targetRate: 15,
  },
  {
    value: "build_emergency_fund",
    title: "Build an emergency fund",
    description: "Stack cash reserves so future surprises feel manageable instead of stressful.",
    signal: "Consistency matters more than the size of any single transfer.",
    coachNote: "You are building resilience. Keep the transfers boring and automatic.",
    targetRate: 25,
  },
  {
    value: "invest_better",
    title: "Invest better",
    description: "Create room for steady investing after your day-to-day needs are covered.",
    signal: "Investing gets easier when spending is predictable and intentional.",
    coachNote: "The next level is not chasing every move. It is making the habit repeatable.",
    targetRate: 20,
  },
];

export const goalLabels: Record<GoalKey, string> = {
  save_more: "Save more",
  pay_down_debt: "Pay down debt",
  track_spending: "Track spending",
  build_emergency_fund: "Build an emergency fund",
  invest_better: "Invest better",
};

export const goalMoneyPrompts: Record<GoalKey, string> = {
  save_more: "How much do you want to save each month?",
  pay_down_debt: "How much do you want to put toward debt each month?",
  track_spending: "What monthly spending cap do you want to stay under?",
  build_emergency_fund: "How much do you want to add to your emergency fund each month?",
  invest_better: "How much do you want to invest each month?",
};

export const goalMoneyLabels: Record<GoalKey, string> = {
  save_more: "Monthly savings target",
  pay_down_debt: "Monthly payoff target",
  track_spending: "Monthly spending cap",
  build_emergency_fund: "Monthly emergency contribution",
  invest_better: "Monthly investing target",
};

export const goalProgressLabels: Record<GoalKey, string> = {
  save_more: "Saved so far this month",
  pay_down_debt: "Available for debt this month",
  track_spending: "Still available in the budget",
  build_emergency_fund: "Set aside so far this month",
  invest_better: "Ready to invest this month",
};

export const getGoalDefinition = (goalKey: string | null) =>
  GOAL_OPTIONS.find((definition) => definition.value === goalKey) ?? GOAL_OPTIONS[0];

export const GOAL_PLAYBOOKS: GoalPlaybook[] = [
  {
    ...GOAL_OPTIONS[0],
    heroLead: "Build the buffer first, then let the rest of the month breathe.",
    heroSupport: "You win this lane by keeping a steady savings rhythm and avoiding small leaks.",
    weeklyFocus: ["Move money early", "Protect one no-spend window", "Review the biggest leak"],
    milestones: [
      { label: "First buffer layer", detail: "Hit a small savings cushion and make it repeatable.", threshold: 35 },
      { label: "Monthly pace", detail: "Stay on track for a full month at your target savings rate.", threshold: 65 },
      { label: "Meaningful cushion", detail: "Stack enough reserve to handle a real surprise.", threshold: 90 },
    ],
    alertTemplates: [
      "You are ahead of pace this month. Keep the savings transfer automatic.",
      "Spending is starting to crowd the buffer. Trim one leak before it becomes a habit.",
    ],
    historyMarkers: [
      "You chose to save more in onboarding.",
      "The current month is telling you the buffer is growing.",
      "The next win is making the routine boring and automatic.",
    ],
  },
  {
    ...GOAL_OPTIONS[1],
    heroLead: "Turn extra cash flow into a clearer path out of debt.",
    heroSupport: "The strongest move here is consistency. Each small win reduces future pressure.",
    weeklyFocus: ["Attack the smallest leak", "Keep one extra payment ready", "Protect the payoff window"],
    milestones: [
      { label: "First dent", detail: "Make a visible reduction in the balance or payment drag.", threshold: 30 },
      { label: "Halfway feel", detail: "You can feel the monthly pressure easing.", threshold: 60 },
      { label: "Momentum lock-in", detail: "The payoff plan starts to feel like the default.", threshold: 88 },
    ],
    alertTemplates: [
      "You have extra room this month. Point it at principal before it disappears.",
      "A few spend categories are competing with the payoff plan. Reset the week early.",
    ],
    historyMarkers: [
      "You picked debt payoff as the main mission.",
      "The payoff lane rewards every extra peso with less interest later.",
      "The next milestone is reducing one category just enough to feel the difference.",
    ],
  },
  {
    ...GOAL_OPTIONS[2],
    heroLead: "Get crisp visibility, then let clarity make the next decision easier.",
    heroSupport: "This lane improves as the books get cleaner and patterns become obvious.",
    weeklyFocus: ["Clear uncategorized rows", "Confirm duplicates", "Review the top category"],
    milestones: [
      { label: "Better visibility", detail: "Most of the month is categorized and readable.", threshold: 35 },
      { label: "Pattern recognition", detail: "The main spend stories are easy to spot at a glance.", threshold: 70 },
      { label: "Coach mode", detail: "You can steer the month with confidence instead of guessing.", threshold: 92 },
    ],
    alertTemplates: [
      "Uncategorized items are piling up. Clear them while the context is still fresh.",
      "Duplicates are muddying the picture. Clean those first to keep the story honest.",
    ],
    historyMarkers: [
      "You chose clarity over guesswork.",
      "Your review queue is the fastest path to better insight.",
      "The next win is making the month easy to read end to end.",
    ],
  },
  {
    ...GOAL_OPTIONS[3],
    heroLead: "Build resilience by turning consistency into a habit.",
    heroSupport: "Your mission is not one huge transfer. It is a repeated move that becomes automatic.",
    weeklyFocus: ["Move savings early", "Keep an emergency buffer untouched", "Avoid short-term detours"],
    milestones: [
      { label: "Starter cushion", detail: "A small reserve begins to feel real.", threshold: 35 },
      { label: "Three-month confidence", detail: "The reserve covers a meaningful chunk of surprises.", threshold: 68 },
      { label: "Strong footing", detail: "The cushion feels dependable instead of fragile.", threshold: 90 },
    ],
    alertTemplates: [
      "This month is ahead of schedule. Keep the reserve transfer untouched.",
      "A spending spike could weaken the buffer. Protect one line item right away.",
    ],
    historyMarkers: [
      "You chose stability and peace of mind.",
      "The reserve grows best when the transfer is predictable.",
      "The next step is making the buffer feel boring in the best way.",
    ],
  },
  {
    ...GOAL_OPTIONS[4],
    heroLead: "Create room for investing by keeping the rest of the plan tidy.",
    heroSupport: "This lane works best when cash flow is predictable and the month is free of surprises.",
    weeklyFocus: ["Keep a clean surplus", "Avoid impulse spending", "Protect the investing window"],
    milestones: [
      { label: "Repeatable surplus", detail: "There is enough left over to invest with confidence.", threshold: 40 },
      { label: "Smooth cadence", detail: "The habit is becoming easy to repeat every month.", threshold: 72 },
      { label: "Long-term mode", detail: "Investing feels like part of the normal rhythm.", threshold: 90 },
    ],
    alertTemplates: [
      "You have room to invest this month. Keep the surplus from leaking away.",
      "A few spending choices are eating the investing runway. Reset before month end.",
    ],
    historyMarkers: [
      "You chose to raise the quality of your money habits.",
      "The investing lane improves when the month is calm and deliberate.",
      "The next milestone is protecting a repeatable surplus.",
    ],
  },
];

export const getGoalPlaybook = (goalKey: string | null) =>
  GOAL_PLAYBOOKS.find((definition) => definition.value === goalKey) ?? GOAL_PLAYBOOKS[0];

export const getGoalMoneyPrompt = (goalKey: GoalKey | null) =>
  goalKey ? goalMoneyPrompts[goalKey] : "How much do you want this goal to move each month?";

export const getGoalMoneyLabel = (goalKey: GoalKey | null) =>
  goalKey ? goalMoneyLabels[goalKey] : "Monthly goal target";

export const getGoalProgressLabel = (goalKey: GoalKey | null) =>
  goalKey ? goalProgressLabels[goalKey] : "Progress this month";

export const getGoalProgressSnapshot = ({
  goalKey,
  targetAmount,
  currentNet,
  currentSpend,
  monthlyIncome,
  currentSavingsRate,
  previousSavingsRate,
  spendDelta,
  recurringShare,
}: GoalProgressContext): GoalProgressSnapshot => {
  const baseTarget = targetAmount !== null && Number.isFinite(targetAmount) ? Math.max(0, targetAmount) : null;
  const netSurplus = Math.max(0, currentNet);
  const savingsBase = netSurplus;
  const behaviorIsImproving = currentSavingsRate !== null && previousSavingsRate !== null ? currentSavingsRate > previousSavingsRate : false;
  const spendingIsRising = spendDelta !== null ? spendDelta > 0 : false;
  const recurringPressure = recurringShare > 0.25;

  if (!goalKey || baseTarget === null) {
    return {
      label: getGoalProgressLabel(goalKey),
      currentLabel: getGoalProgressLabel(goalKey),
      currentAmount: goalKey === "track_spending" ? Math.max(0, currentSpend) : netSurplus,
      targetAmount: baseTarget,
      progressPercent: null,
      remainingAmount: null,
      achieved: false,
      bandLabel: "Set a target",
      bandTone: "neutral",
      coachCopy:
        monthlyIncome !== null
          ? "You have enough recent activity to estimate a strong target. Set one to unlock live progress tracking."
          : "Set a monthly target to unlock live progress tracking.",
      nextAction: "Set a monthly amount so Clover can measure real progress.",
    };
  }

  if (goalKey === "track_spending") {
    const remaining = Math.max(0, baseTarget - currentSpend);
    const overBudget = currentSpend - baseTarget;
    const progressPercent = baseTarget > 0 ? clamp((remaining / baseTarget) * 100, 0, 100) : null;
    const achieved = currentSpend <= baseTarget;

    return {
      label: "Budget left",
      currentLabel: "Still available",
      currentAmount: remaining,
      targetAmount: baseTarget,
      progressPercent,
      remainingAmount: remaining,
      achieved,
      bandLabel: achieved ? "Under budget" : "Over budget",
      bandTone: achieved ? "positive" : "negative",
      coachCopy: achieved
        ? behaviorIsImproving
          ? "You are under the cap and your spending trend is improving. That is the kind of month that builds confidence."
          : "You are under the cap. Protect the progress by keeping one more flexible category in check."
        : `You are over the cap by ${formatCompactCurrency(overBudget)}. Trim one leak and you can close the gap.`,
      nextAction: achieved
        ? "Keep the biggest categories under review so the cap holds through month-end."
        : spendingIsRising
          ? "Pause the biggest flexible category and close the gap before the month drifts further."
          : "Trim one category today, then recheck the remaining budget tomorrow.",
    };
  }

  const currentAmount = goalKey === "pay_down_debt" ? netSurplus : savingsBase;
  const progressPercent = baseTarget > 0 ? clamp((currentAmount / baseTarget) * 100, 0, 100) : null;
  const remainingAmount = Math.max(0, baseTarget - currentAmount);
  const achieved = currentAmount >= baseTarget;
  const bandLabel =
    progressPercent !== null
      ? progressPercent >= 100
        ? "Goal reached"
        : progressPercent >= 75
          ? "Ahead of pace"
          : progressPercent >= 50
            ? "On pace"
            : progressPercent >= 25
              ? "Building momentum"
              : "Early"
      : "Set a target";
  const bandTone =
    progressPercent !== null
      ? progressPercent >= 75
        ? "positive"
        : progressPercent >= 50
          ? "neutral"
          : progressPercent >= 25
            ? "warning"
            : "negative"
      : "neutral";

  return {
    label:
      goalKey === "save_more"
        ? "Saved this month"
        : goalKey === "pay_down_debt"
          ? "Available for debt"
          : goalKey === "build_emergency_fund"
            ? "Set aside so far"
            : "Ready to invest",
    currentLabel:
      goalKey === "save_more"
        ? "Current savings"
        : goalKey === "pay_down_debt"
          ? "Debt runway"
          : goalKey === "build_emergency_fund"
            ? "Emergency buffer"
            : "Investable surplus",
    currentAmount,
    targetAmount: baseTarget,
    progressPercent,
    remainingAmount,
    achieved,
    bandLabel,
    bandTone,
    coachCopy:
      goalKey === "save_more"
        ? achieved
          ? behaviorIsImproving
            ? "You reached your savings target and your savings rhythm is improving. That is a strong month."
            : "You reached your savings target. Keep the transfer automatic so it stays easy."
          : recurringPressure
            ? "Recurring spending is eating into your savings runway. Trim one automatic cost and keep the transfer intact."
            : "Every extra peso saved now makes the next month easier."
        : goalKey === "pay_down_debt"
          ? achieved
            ? "You created enough room to hit the debt target. Nice work."
            : spendingIsRising
              ? "Spending is crowding the payoff plan. Pull one flexible category back and send the difference to debt."
              : "This is the money you can point at principal before it gets absorbed elsewhere."
          : goalKey === "build_emergency_fund"
            ? achieved
              ? behaviorIsImproving
                ? "Your emergency fund target is covered and your saving rhythm is holding steady."
                : "Your emergency fund target is covered for this month."
              : recurringPressure
                ? "Recurring spending is squeezing the reserve transfer. Protect the transfer first, then reset one subscription."
                : "You are building resilience one consistent transfer at a time."
            : achieved
              ? "You have a clean surplus to invest. Keep the habit steady."
              : spendingIsRising
                ? "Spending pressure is reducing the investing runway. Cut one flexible category before month-end."
                : "You are protecting the investing runway by keeping the month tidy.",
    nextAction:
      goalKey === "save_more"
        ? achieved
          ? "Protect the savings transfer and keep one small leak closed."
          : recurringPressure
            ? "Trim one recurring cost and move that amount into savings immediately."
            : "Move money earlier in the month so savings gets first claim."
        : goalKey === "pay_down_debt"
          ? achieved
            ? "Keep sending every extra peso to principal before it disappears."
            : spendingIsRising
              ? "Pause one discretionary category and redirect the savings to debt."
              : "Keep one extra payment ready so you can close the gap faster."
        : goalKey === "build_emergency_fund"
          ? achieved
            ? "Leave the transfer alone and let the buffer compound."
            : recurringPressure
              ? "Trim one fixed cost first, then refill the buffer automatically."
              : "Automate the reserve transfer so the goal stays boring and steady."
        : achieved
          ? "Keep the surplus clean and move the investable amount on schedule."
          : spendingIsRising
            ? "Reduce one flexible spend category and protect the investing window."
            : "Keep cash flow calm so the next investable dollar survives the month.",
  };
};

const formatCompactCurrency = (value: number) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const getSuggestedGoalAmount = (goalKey: GoalKey | null, monthlyIncome: number | null) => {
  if (!goalKey || monthlyIncome === null || Number.isNaN(monthlyIncome) || monthlyIncome <= 0) {
    return null;
  }

  const targetRate = getGoalDefinition(goalKey).targetRate;
  return Math.max(0, Math.round(monthlyIncome * (targetRate / 100)));
};

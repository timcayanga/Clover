export type GoalKey =
  | "save_more"
  | "pay_down_debt"
  | "track_spending"
  | "build_emergency_fund"
  | "invest_better";

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

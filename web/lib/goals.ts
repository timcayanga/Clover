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

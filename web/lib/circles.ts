export const circleTypes = [
  "household",
  "couple",
  "family",
  "travel",
  "friends",
  "goal",
  "custom",
] as const;
export type CircleTypeValue = (typeof circleTypes)[number];

export const circleRoles = ["organizer", "member", "participant"] as const;
export type CircleRoleValue = (typeof circleRoles)[number];

export const circleVisibilities = ["summary", "item", "circle_owned"] as const;
export type CircleVisibilityValue = (typeof circleVisibilities)[number];

export type CircleTemplate = {
  type: CircleTypeValue;
  title: string;
  description: string;
  suggestedName: string;
  starterActions: string[];
};

export const circleTemplates: CircleTemplate[] = [
  {
    type: "household",
    title: "Household",
    description:
      "Coordinate rent, groceries, utilities, and monthly contributions.",
    suggestedName: "Our Household",
    starterActions: [
      "Add a recurring bill",
      "Set contribution targets",
      "Share an expense",
    ],
  },
  {
    type: "couple",
    title: "Couple",
    description:
      "Plan shared bills and goals while keeping personal accounts private.",
    suggestedName: "Our Finances",
    starterActions: [
      "Create a shared goal",
      "Add shared bills",
      "Set a contribution target",
    ],
  },
  {
    type: "family",
    title: "Family",
    description:
      "Track family support, tuition, medical costs, and recurring commitments.",
    suggestedName: "Family Support",
    starterActions: [
      "Add a family commitment",
      "Set contribution shares",
      "Create a support goal",
    ],
  },
  {
    type: "travel",
    title: "Travel",
    description:
      "Save for a trip, share expenses, and settle balances together.",
    suggestedName: "Our Trip",
    starterActions: [
      "Create a trip budget",
      "Set a savings goal",
      "Split an expense",
    ],
  },
  {
    type: "friends",
    title: "Friends or barkada",
    description:
      "Keep recurring group expenses and settlements easy to follow.",
    suggestedName: "Our Barkada",
    starterActions: ["Add people", "Split an expense", "Set a group budget"],
  },
  {
    type: "goal",
    title: "Shared goal",
    description:
      "Work toward a wedding, vehicle, tuition, home, or other milestone.",
    suggestedName: "Our Goal",
    starterActions: [
      "Set a target",
      "Choose a target date",
      "Record a contribution",
    ],
  },
  {
    type: "custom",
    title: "Start from scratch",
    description: "Create a flexible Circle and turn on only what you need.",
    suggestedName: "My Circle",
    starterActions: ["Invite people", "Add an expense", "Create a goal"],
  },
];

export type CircleMemberSummary = {
  id: string;
  userId: string | null;
  displayName: string;
  email: string | null;
  role: CircleRoleValue;
  status: "invited" | "active" | "left" | "removed";
  contributionTarget: number | null;
  contributionCadence: string;
  contributedThisMonth: number;
};

export type CircleBudgetSummary = {
  id: string;
  name: string;
  targetAmount: number;
  spentAmount: number;
  remainingAmount: number;
  progressPercent: number;
  currency: string;
  cadence: string;
  categoryName: string | null;
  isActive: boolean;
};

export type CircleGoalSummary = {
  id: string;
  name: string;
  purpose: string | null;
  targetAmount: number;
  currentAmount: number;
  remainingAmount: number;
  progressPercent: number;
  currency: string;
  targetDate: string | null;
  status: "active" | "paused" | "completed" | "archived";
  estimatedCompletionDate: string | null;
  estimateConfidence: number | null;
  estimateReason: string | null;
};

export type CircleCommitmentSummary = {
  id: string;
  title: string;
  amount: number | null;
  currency: string;
  recurrence: string;
  nextDueDate: string | null;
  notes: string | null;
  isActive: boolean;
  assignedMemberId: string | null;
  assignedMemberName: string | null;
};

export type CircleContributionSummary = {
  id: string;
  memberId: string | null;
  memberName: string | null;
  goalId: string | null;
  amount: number;
  currency: string;
  contributionDate: string;
  note: string | null;
};

export type CircleExpenseSummary = {
  id: string;
  kind: "split_bill" | "shared_transaction";
  title: string;
  amount: number;
  currency: string;
  date: string;
  visibility: CircleVisibilityValue;
  href: string;
  settled: boolean | null;
};

export type CircleInvestmentSummary = {
  id: string;
  accountId: string;
  name: string;
  institution: string | null;
  balance: number | null;
  currency: string;
  visibility: CircleVisibilityValue;
  includeHoldings: boolean;
};

export type CircleActivitySummary = {
  id: string;
  action: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
};

export type CircleInvitationSummary = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: CircleRoleValue;
  status: string;
  shareUrl: string;
  expiresAt: string;
};

export type CircleInsight = {
  id: string;
  title: string;
  detail: string;
  confidence: number;
  reason: string;
  tone: "positive" | "attention" | "neutral";
};

export type CircleSummary = {
  id: string;
  name: string;
  type: CircleTypeValue;
  description: string | null;
  avatarUrl: string | null;
  color: string;
  currency: string;
  role: CircleRoleValue;
  isOwner: boolean;
  splitBillGroupId: string | null;
  memberCount: number;
  pendingCount: number;
  expenseTotalThisMonth: number;
  contributionTotalThisMonth: number;
  updatedAt: string;
  members: CircleMemberSummary[];
  budgets: CircleBudgetSummary[];
  goals: CircleGoalSummary[];
  commitments: CircleCommitmentSummary[];
  contributions: CircleContributionSummary[];
  expenses: CircleExpenseSummary[];
  investmentShares: CircleInvestmentSummary[];
  activities: CircleActivitySummary[];
  invitations: CircleInvitationSummary[];
  insights: CircleInsight[];
};

export type CirclesWorkspaceData = {
  circles: CircleSummary[];
  currentUserId: string;
  currentUserName: string;
  personalTransactions: Array<{
    id: string;
    title: string;
    amount: number;
    currency: string;
    date: string;
    workspaceName: string;
  }>;
  investmentAccounts: Array<{
    id: string;
    name: string;
    institution: string | null;
    balance: number | null;
    currency: string;
  }>;
};

export const clampPercent = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value)));

export const getMonthBounds = (date = new Date()) => ({
  start: new Date(date.getFullYear(), date.getMonth(), 1),
  end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
});

export const calculateGoalForecast = (params: {
  currentAmount: number;
  targetAmount: number;
  contributions: Array<{ amount: number; contributionDate: Date }>;
  now?: Date;
}) => {
  const now = params.now ?? new Date();
  const remaining = Math.max(0, params.targetAmount - params.currentAmount);
  if (remaining === 0) {
    return {
      estimatedCompletionDate: now,
      confidence: 100,
      reason: "The goal has already reached its target.",
    };
  }

  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - 120);
  const recent = params.contributions.filter(
    (entry) => entry.contributionDate >= lookbackStart && entry.amount > 0,
  );
  if (recent.length < 2) {
    return { estimatedCompletionDate: null, confidence: null, reason: null };
  }

  const oldest = recent.reduce(
    (earliest, entry) =>
      entry.contributionDate < earliest ? entry.contributionDate : earliest,
    recent[0].contributionDate,
  );
  const observedDays = Math.max(
    30,
    (now.getTime() - oldest.getTime()) / 86_400_000,
  );
  const monthlyPace =
    recent.reduce((sum, entry) => sum + entry.amount, 0) /
    (observedDays / 30.4375);
  if (!Number.isFinite(monthlyPace) || monthlyPace <= 0) {
    return { estimatedCompletionDate: null, confidence: null, reason: null };
  }

  const monthsRemaining = remaining / monthlyPace;
  const estimatedCompletionDate = new Date(now);
  estimatedCompletionDate.setDate(
    estimatedCompletionDate.getDate() + Math.ceil(monthsRemaining * 30.4375),
  );
  const confidence = recent.length >= 6 ? 85 : recent.length >= 4 ? 75 : 60;

  return {
    estimatedCompletionDate,
    confidence,
    reason: `Estimate uses ${recent.length} contributions from the last 120 days and a monthly pace of ${monthlyPace.toFixed(2)}.`,
  };
};

export const buildCircleInsights = (params: {
  currency: string;
  expenseTotalThisMonth: number;
  contributionTotalThisMonth: number;
  budgets: CircleBudgetSummary[];
  goals: CircleGoalSummary[];
  members: CircleMemberSummary[];
}): CircleInsight[] => {
  const format = (amount: number) =>
    new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: params.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  const insights: CircleInsight[] = [];
  const overBudget = params.budgets.find(
    (budget) => budget.spentAmount > budget.targetAmount,
  );
  if (overBudget) {
    insights.push({
      id: `budget:${overBudget.id}`,
      title: `${overBudget.name} is over its target`,
      detail: `${format(overBudget.spentAmount - overBudget.targetAmount)} above the current ${overBudget.cadence} budget.`,
      confidence: 100,
      reason:
        "Calculated from confirmed Circle expenses and explicitly shared transactions.",
      tone: "attention",
    });
  }

  const closestGoal = params.goals
    .filter((goal) => goal.status === "active")
    .sort((left, right) => right.progressPercent - left.progressPercent)[0];
  if (closestGoal) {
    insights.push({
      id: `goal:${closestGoal.id}`,
      title: `${closestGoal.name} is ${closestGoal.progressPercent}% funded`,
      detail: `${format(closestGoal.remainingAmount)} remains before the Circle reaches its target.`,
      confidence: 100,
      reason:
        "Calculated from the goal starting amount and recorded Circle contributions.",
      tone: closestGoal.progressPercent >= 75 ? "positive" : "neutral",
    });
  }

  const behindMember = params.members.find(
    (member) =>
      member.status === "active" &&
      member.contributionTarget !== null &&
      member.contributedThisMonth < member.contributionTarget,
  );
  if (behindMember?.contributionTarget) {
    insights.push({
      id: `member:${behindMember.id}`,
      title: `${behindMember.displayName} has a contribution remaining`,
      detail: `${format(behindMember.contributionTarget - behindMember.contributedThisMonth)} remains against this month’s agreed target.`,
      confidence: 100,
      reason:
        "Calculated from the member’s explicit target and recorded contributions for this month.",
      tone: "attention",
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: "monthly-pulse",
      title: "Your Circle is ready to coordinate",
      detail: `${format(params.expenseTotalThisMonth)} in shared expenses and ${format(params.contributionTotalThisMonth)} in recorded contributions this month.`,
      confidence: 100,
      reason: "Calculated from Circle-owned records for the current month.",
      tone: "neutral",
    });
  }

  return insights.slice(0, 3);
};

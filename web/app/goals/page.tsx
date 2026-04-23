import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { GoalsEditor } from "@/components/goals-editor";
import { GoalsChecklist } from "@/components/goals-checklist";
import { GoalGlyph, GoalIllustration } from "@/components/goals-visuals";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { GOAL_OPTIONS, getGoalDefinition, getGoalPlaybook, type GoalKey } from "@/lib/goals";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Goals",
};

const selectedWorkspaceKey = "clover.selected-workspace-id.v1";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const monthFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  year: "numeric",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

type GoalTransaction = {
  date: Date;
  amount: unknown;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  account: {
    name: string;
  };
  category: {
    name: string;
  } | null;
};

type MonthBucket = {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

type GoalSummary = {
  income: number;
  expense: number;
  transfer: number;
  expenseCategories: Map<string, number>;
};

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatSignedCurrency = (value: number) => `${value < 0 ? "-" : ""}${currencyFormatter.format(Math.abs(value))}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const formatShortDate = (value: Date) => shortDateFormatter.format(value);
const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeMerchant = (value: string) => value.trim().toLowerCase();
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const getMonthBuckets = (anchor: Date) => {
  const buckets: MonthBucket[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    buckets.push({
      key: toIsoMonth(date),
      label: toMonthLabel(date),
      income: 0,
      expense: 0,
      net: 0,
    });
  }
  return buckets;
};

const getChecklistIcon = (focus: string) => {
  if (focus === "Move money early" || focus === "Move savings early") {
    return "target" as const;
  }
  if (focus === "Protect one no-spend window" || focus === "Keep an emergency buffer untouched") {
    return "shield" as const;
  }
  if (focus === "Review the biggest leak" || focus === "Review the top category" || focus === "Keep a clean surplus") {
    return "chart" as const;
  }
  if (focus === "Attack the smallest leak" || focus === "Avoid impulse spending" || focus === "Avoid short-term detours") {
    return "spark" as const;
  }
  return "path" as const;
};

const getCoachMessage = (goalScore: number) => {
  if (goalScore >= 85) {
    return {
      badge: "Strong momentum",
      title: "You are operating like someone who knows exactly where they are going.",
      body: "The biggest win now is staying consistent. You already have the structure, so the game is about protecting the streak.",
    };
  }

  if (goalScore >= 70) {
    return {
      badge: "Good pace",
      title: "You have a solid rhythm, and the slope is working for you.",
      body: "Keep tightening one small habit at a time. That is how a good month turns into a reliable pattern.",
    };
  }

  if (goalScore >= 50) {
    return {
      badge: "Building phase",
      title: "You are laying the foundation in the right order.",
      body: "This is the point where a little more clarity and one sharper habit can make the progress feel much lighter.",
    };
  }

  return {
    badge: "Early momentum",
    title: "You are in the build-up stage, and that is completely fine.",
    body: "The opportunity is clear: remove one drag, repeat one win, and the trend will start to move in your favor quickly.",
  };
};

const createGoalChart = (buckets: MonthBucket[]) => {
  const chartWidth = 520;
  const chartHeight = 170;
  const chartPadding = 18;
  const chartXSpan = chartWidth - chartPadding * 2;
  const chartYSpan = chartHeight - chartPadding * 2;
  const netValues = buckets.map((bucket) => bucket.net);
  const chartMax = Math.max(...netValues, 1);
  const chartMin = Math.min(...netValues, 0);
  const chartRange = Math.max(chartMax - chartMin, 1);
  const points = buckets.map((bucket, index) => {
    const x = chartPadding + (index / Math.max(buckets.length - 1, 1)) * chartXSpan;
    const normalized = (bucket.net - chartMin) / chartRange;
    const y = chartPadding + (1 - normalized) * chartYSpan;
    return { ...bucket, x, y };
  });

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");

  return { chartWidth, chartHeight, chartPadding, points, path };
};

export default async function GoalsPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);

  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const cookieStore = await cookies();
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const workspaceInclude = {
    accounts: true,
    importFiles: {
      orderBy: { uploadedAt: "desc" },
    },
  } as const;

  const selectedWorkspace =
    (selectedWorkspaceCookieId
      ? await prisma.workspace.findFirst({
          where: {
            id: selectedWorkspaceCookieId,
            userId: user.id,
          },
          include: workspaceInclude,
        })
      : null) ??
    (await prisma.workspace.findFirst({
      where: { userId: user.id },
      include: workspaceInclude,
      orderBy: { createdAt: "asc" },
    }));

  const resolvedWorkspace =
    selectedWorkspace ??
      (await ensureStarterWorkspace(user).then(async (starterWorkspace) => {
      const starterWorkspaceData = await prisma.workspace.findUnique({
        where: { id: starterWorkspace.id },
        include: workspaceInclude,
      });
      if (!starterWorkspaceData) {
        redirect("/dashboard");
      }
      return starterWorkspaceData;
    }));

  if (!resolvedWorkspace) {
    redirect("/dashboard");
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [currentWindowTransactionsQuery, previousWindowTransactionsQuery, ninetyDayTransactionsQuery, sixMonthTransactionsQuery] =
    await Promise.all([
      prisma.transaction.findMany({
        where: {
          workspaceId: resolvedWorkspace.id,
          isExcluded: false,
          date: { gte: thirtyDaysAgo },
        },
        select: {
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          account: {
            select: {
              name: true,
            },
          },
          category: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { date: "desc" },
        take: 500,
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: resolvedWorkspace.id,
          isExcluded: false,
          date: {
            gte: sixtyDaysAgo,
            lt: thirtyDaysAgo,
          },
        },
        select: {
          amount: true,
          type: true,
          category: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: resolvedWorkspace.id,
          isExcluded: false,
          date: { gte: ninetyDaysAgo },
        },
        select: {
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          account: {
            select: {
              name: true,
            },
          },
          category: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { date: "desc" },
        take: 500,
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: resolvedWorkspace.id,
          isExcluded: false,
          date: { gte: sixMonthsAgo },
        },
        select: {
          date: true,
          amount: true,
          type: true,
        },
      }),
    ]);

  const currentWindowTransactions = currentWindowTransactionsQuery as GoalTransaction[];
  const previousWindowTransactions = previousWindowTransactionsQuery as Array<Pick<GoalTransaction, "amount" | "type" | "category">>;
  const ninetyDayTransactions = ninetyDayTransactionsQuery as GoalTransaction[];
  const sixMonthTransactions = sixMonthTransactionsQuery as Array<Pick<GoalTransaction, "date" | "amount" | "type">>;
  const selectedGoalKey = user.primaryGoal?.trim() ?? null;
  const selectedGoal = getGoalDefinition(selectedGoalKey);
  const playbook = getGoalPlaybook(selectedGoalKey);
  const isEmptyWorkspace = resolvedWorkspace.accounts.length <= 1 && resolvedWorkspace.importFiles.length === 0 && currentWindowTransactions.length === 0;

  const currentSummary = currentWindowTransactions.reduce<GoalSummary>(
    (accumulator, transaction) => {
      const amount = Number(transaction.amount);
      if (transaction.type === "income") {
        accumulator.income += amount;
      } else if (transaction.type === "expense") {
        accumulator.expense += amount;
      } else {
        accumulator.transfer += amount;
      }

      if (transaction.type === "expense") {
        const categoryName = transaction.category?.name ?? "Uncategorized";
        accumulator.expenseCategories.set(
          categoryName,
          (accumulator.expenseCategories.get(categoryName) ?? 0) + Math.abs(amount)
        );
      }

      return accumulator;
    },
    {
      income: 0,
      expense: 0,
      transfer: 0,
      expenseCategories: new Map<string, number>(),
    }
  );

  const previousSummary = previousWindowTransactions.reduce<GoalSummary>(
    (accumulator, transaction) => {
      const amount = Number(transaction.amount);
      if (transaction.type === "income") {
        accumulator.income += amount;
      } else if (transaction.type === "expense") {
        accumulator.expense += amount;
        const categoryName = transaction.category?.name ?? "Uncategorized";
        accumulator.expenseCategories.set(
          categoryName,
          (accumulator.expenseCategories.get(categoryName) ?? 0) + Math.abs(amount)
        );
      } else {
        accumulator.transfer += amount;
      }
      return accumulator;
    },
    {
      income: 0,
      expense: 0,
      transfer: 0,
      expenseCategories: new Map<string, number>(),
    }
  );

  const monthBuckets = getMonthBuckets(now);
  sixMonthTransactions.forEach((transaction) => {
    const bucket = monthBuckets.find((entry) => entry.key === toIsoMonth(transaction.date));
    if (!bucket) {
      return;
    }

    const amount = Number(transaction.amount);
    if (transaction.type === "income") {
      bucket.income += amount;
    } else if (transaction.type === "expense") {
      bucket.expense += Math.abs(amount);
    }
    bucket.net = bucket.income - bucket.expense;
  });

  const currentNet = currentSummary.income - currentSummary.expense;
  const previousNet = previousSummary.income - previousSummary.expense;
  const currentSpend = currentSummary.expense;
  const currentSavingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
  const previousSavingsRate = previousSummary.income > 0 ? (previousSummary.income - previousSummary.expense) / previousSummary.income : null;
  const spendDelta = previousSummary.expense > 0 ? ((currentSummary.expense - previousSummary.expense) / previousSummary.expense) * 100 : null;
  const savingsRateDelta =
    currentSavingsRate !== null && previousSavingsRate !== null ? (currentSavingsRate - previousSavingsRate) * 100 : null;
  const netDelta = currentNet - previousNet;
  const uncategorizedTransactions = currentWindowTransactions.filter(
    (transaction) => !transaction.category?.name || !transaction.merchantClean
  );

  const duplicateGroups = new Map<string, GoalTransaction[]>();
  currentWindowTransactions.forEach((transaction) => {
    const merchant = normalizeMerchant(transaction.merchantClean ?? transaction.merchantRaw);
    const key = [
      transaction.date.toISOString().slice(0, 10),
      transaction.account.name.toLowerCase(),
      transaction.type,
      Number(transaction.amount).toFixed(2),
      merchant,
    ].join("|");

    const existing = duplicateGroups.get(key) ?? [];
    existing.push(transaction);
    duplicateGroups.set(key, existing);
  });

  const possibleDuplicateGroups = Array.from(duplicateGroups.values()).filter((group) => group.length > 1);

  const recurringMerchantSpend = new Map<
    string,
    {
      label: string;
      amount: number;
      count: number;
    }
  >();

  ninetyDayTransactions.forEach((transaction) => {
    if (transaction.type !== "expense") {
      return;
    }

    const label = transaction.merchantClean ?? transaction.merchantRaw;
    const key = normalizeMerchant(label);
    const existing = recurringMerchantSpend.get(key) ?? {
      label,
      amount: 0,
      count: 0,
    };
    existing.amount += Math.abs(Number(transaction.amount));
    existing.count += 1;
    recurringMerchantSpend.set(key, existing);
  });

  const recurringMerchants = Array.from(recurringMerchantSpend.values())
    .filter((merchant) => merchant.count > 1)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  const recurringDrag = recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0);
  const recurringShare = currentSpend > 0 ? recurringDrag / currentSpend : 0;
  const uncategorizedShare = currentSpend > 0
    ? uncategorizedTransactions.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount)), 0) / currentSpend
    : 0;
  const cleanlinessScore = clamp(Math.round(100 - uncategorizedShare * 120 - possibleDuplicateGroups.length * 7), 20, 100);
  const trendScore = currentNet >= previousNet ? 18 : 8;
  const consistencyScore = previousSavingsRate !== null && currentSavingsRate !== null && currentSavingsRate >= previousSavingsRate ? 14 : 7;
  const targetRate = selectedGoal.targetRate;
  const savingsScore =
    currentSavingsRate === null ? 16 : clamp(Math.round((currentSavingsRate * 100 / targetRate) * 55), 12, 65);
  const dragPenalty = clamp(Math.round(recurringShare * 100 * 0.35 + Math.max(0, recurringMerchants.length - 1) * 4), 0, 22);
  const goalScore = clamp(Math.round(savingsScore + trendScore + consistencyScore + cleanlinessScore * 0.2 - dragPenalty), 12, 98);
  const coach = getCoachMessage(goalScore);
  const currentMonthLabel = monthFormatter.format(now);
  const onboardingDate = user.onboardingCompletedAt ? new Date(user.onboardingCompletedAt) : null;

  const progressLabel =
    goalScore >= 85 ? "Coach mode: you are ahead of the curve" : goalScore >= 70 ? "On pace and looking sharp" : goalScore >= 50 ? "Building good momentum" : "Early, but absolutely moving";

  const weeklyProgress = clamp(goalScore + (currentSavingsRate !== null && currentSavingsRate >= targetRate / 100 ? 8 : 0) - (recurringShare > 0.25 ? 6 : 0), 12, 100);

  const chart = createGoalChart(monthBuckets);
  const paceBars = [
    {
      label: "Current pace",
      value: currentSavingsRate === null ? 0 : currentSavingsRate * 100,
      note: currentSavingsRate === null ? "Need more income context" : `Running at ${formatPercent(currentSavingsRate * 100)}`,
      tone: currentSavingsRate !== null && currentSavingsRate * 100 >= targetRate ? "positive" : "neutral",
    },
    {
      label: "Goal line",
      value: targetRate,
      note: `The lane you set for ${selectedGoal.title.toLowerCase()}`,
      tone: "neutral",
    },
    {
      label: "Last window",
      value: previousSavingsRate === null ? 0 : previousSavingsRate * 100,
      note: previousSavingsRate === null ? "No prior baseline" : `Previous pace was ${formatPercent(previousSavingsRate * 100)}`,
      tone: previousSavingsRate !== null && previousSavingsRate * 100 >= targetRate ? "positive" : "negative",
    },
  ];

  const dayBuckets = Array.from({ length: 28 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (27 - index));
    return {
      key: toIsoDate(date),
      day: date.getDate(),
      count: 0,
      net: 0,
      expense: 0,
      income: 0,
    };
  });

  const dayBucketMap = new Map(dayBuckets.map((bucket) => [bucket.key, bucket]));
  currentWindowTransactions.forEach((transaction) => {
    const bucket = dayBucketMap.get(toIsoDate(transaction.date));
    if (!bucket) {
      return;
    }

    const amount = Number(transaction.amount);
    bucket.count += 1;
    if (transaction.type === "income") {
      bucket.income += amount;
    } else if (transaction.type === "expense") {
      bucket.expense += Math.abs(amount);
    }
    bucket.net = bucket.income - bucket.expense;
  });

  const dailyHeatmap = dayBuckets.map((bucket) => {
    const activityScore = bucket.count === 0 ? 0 : Math.min(4, Math.round(bucket.count / 2 + (bucket.net > 0 ? 1 : 0)));
    return {
      ...bucket,
      intensity: activityScore,
    };
  });

  const goalSnapshot = [
    {
      label: "Current net",
      value: formatSignedCurrency(currentNet),
      note: currentNet >= previousNet ? "Up vs prior period" : "Down vs prior period",
    },
    {
      label: "Savings rate",
      value: currentSavingsRate === null ? "N/A" : formatPercent(currentSavingsRate * 100),
      note: `Target ${targetRate}% for ${selectedGoal.title.toLowerCase()}`,
    },
    {
      label: "Clean data",
      value: `${Math.round(cleanlinessScore)}%`,
      note: `${uncategorizedTransactions.length} items still need attention`,
    },
    {
      label: "Momentum",
      value: goalScore.toString(),
      note: progressLabel,
    },
  ];

  const milestoneCards = playbook.milestones.map((milestone) => {
    const percent = clamp((goalScore / milestone.threshold) * 100, 8, 100);
    const reached = goalScore >= milestone.threshold;
    return {
      ...milestone,
      percent,
      reached,
    };
  });

  const weeklySignals = [
    {
      label: "Spend",
      value: spendDelta === null ? "N/A" : formatPercent(spendDelta),
      note: spendDelta === null ? "No prior comparison" : (spendDelta > 0 ? "Up vs prior month" : "Down vs prior month"),
      tone: spendDelta === null ? "neutral" : spendDelta > 0 ? "negative" : "positive",
    },
    {
      label: "Savings",
      value: savingsRateDelta === null ? "N/A" : formatPercent(savingsRateDelta),
      note: savingsRateDelta === null ? "No prior comparison" : savingsRateDelta >= 0 ? "Improving momentum" : "Needs a reset",
      tone: savingsRateDelta === null ? "neutral" : savingsRateDelta >= 0 ? "positive" : "negative",
    },
    {
      label: "Net",
      value: formatSignedCurrency(netDelta),
      note: currentNet >= previousNet ? "Up vs last period" : "Down vs last period",
      tone: netDelta >= 0 ? "positive" : "negative",
    },
    {
      label: "Cleanliness",
      value: `${Math.round(cleanlinessScore)}%`,
      note: uncategorizedTransactions.length === 0 ? "Nice and tidy" : `${uncategorizedTransactions.length} items to clear`,
      tone: cleanlinessScore >= 80 ? "positive" : cleanlinessScore >= 60 ? "neutral" : "negative",
    },
  ];

  const historyEntries = [
    {
      label: "Onboarding",
      detail: onboardingDate ? `${selectedGoal.title} started on ${formatShortDate(onboardingDate)}` : `You chose ${selectedGoal.title.toLowerCase()} during onboarding.`,
    },
    {
      label: currentMonthLabel,
      detail: playbook.historyMarkers[1],
    },
    {
      label: "Next checkpoint",
      detail: playbook.historyMarkers[2],
    },
  ];

  const goalAlerts = [
    {
      text: goalScore >= 80 ? playbook.alertTemplates[0] : playbook.alertTemplates[1],
      icon: goalScore >= 80 ? "spark" : "chart",
    },
    uncategorizedTransactions.length > 0
      ? {
          text: `${uncategorizedTransactions.length} uncategorized transaction${uncategorizedTransactions.length === 1 ? "" : "s"} are softening the signal.`,
          icon: "target" as const,
        }
      : {
          text: "The review queue is looking clean right now.",
          icon: "shield" as const,
        },
    recurringShare > 0.25
      ? {
          text: "Recurring spending is taking up a meaningful slice of the month.",
          icon: "chart" as const,
        }
      : {
          text: "Recurring spending is under control and not blocking progress.",
          icon: "spark" as const,
        },
  ];

  const checklistItems = playbook.weeklyFocus.map((focus) => ({
    title: focus,
    body:
      focus === "Move money early"
        ? "Set the transfer before the month gets noisy."
        : focus === "Protect one no-spend window"
          ? "Make one part of the week friction-free."
          : focus === "Review the biggest leak"
            ? "Use the biggest category as your first improvement target."
            : focus === "Attack the smallest leak"
              ? "Pick the easiest category to shrink first."
              : focus === "Keep one extra payment ready"
                ? "Leave a little surplus ready for principal."
                : focus === "Protect the payoff window"
                  ? "Keep the payoff amount out of reach until it clears."
                  : focus === "Clear uncategorized rows"
                    ? "Make the month easier to read in one pass."
                    : focus === "Confirm duplicates"
                      ? "Remove double-counted noise before it distorts the trend."
                      : focus === "Review the top category"
                        ? "Check the biggest bucket for a quick win."
                        : focus === "Move savings early"
                          ? "Lock the habit in before other spending gets a vote."
                          : focus === "Keep an emergency buffer untouched"
                            ? "Protect the reserve from short-term decisions."
                            : focus === "Avoid short-term detours"
                              ? "Stay steady and keep the runway intact."
                            : focus === "Keep a clean surplus"
                                ? "Preserve room for investing by trimming leakage."
                                : focus === "Avoid impulse spending"
                                  ? "The best investable dollars are the ones that survive the week."
                                  : "Protect the investing window",
    href: "/transactions",
    label: "Review now",
    icon: getChecklistIcon(focus),
  }));

  const targetArc = `${Math.round(goalScore)}%`;

  return (
    <CloverShell
      active="goals"
      title="Goals"
      kicker="Goal coaching"
      subtitle="A visual, encouraging view of the goal you set in onboarding, with the next best move front and center."
      showTopbar={false}
    >
      {isEmptyWorkspace ? (
        <div style={{ marginBottom: 20 }}>
          <EmptyDataCta
            eyebrow={user.dataWipedAt ? "Fresh start" : "No data yet"}
            title="Set a new goal once your data comes back."
            copy="Import a statement first so Clover can rebuild your goal view with real activity, progress, and next steps."
            importHref="/dashboard?import=1"
            accountHref="/accounts"
            transactionHref="/transactions?manual=1"
          />
        </div>
      ) : null}
      <section className="goals-story">
        <article className="goals-hero glass">
          <div className="goals-hero__copy">
            <div className="goals-hero__header">
              <span className="pill pill-accent">Onboarding goals</span>
              <span className="pill pill-subtle">{selectedGoal.title}</span>
            </div>
            <h3>{playbook.heroLead}</h3>
            <p>{playbook.heroSupport}</p>

            <div className="goals-hero__summary">
              <span className={`pill ${goalScore >= 70 ? "pill-good" : goalScore >= 50 ? "pill-accent" : "pill-warning"}`}>
                {coach.badge}
              </span>
              <span>{selectedGoal.signal}</span>
              <span>{playbook.weeklyFocus[0]}</span>
            </div>

            <div className="goals-progress">
              <div className="goals-progress__head">
                <strong>{progressLabel}</strong>
                <span>{targetArc} of 100</span>
              </div>
              <div className="goals-progress__bar" aria-hidden="true">
                <div className="goals-progress__fill" style={{ width: `${goalScore}%` }} />
              </div>
              <p>{coach.body}</p>
            </div>
          </div>

          <div className="goals-hero__visual">
            <GoalIllustration
              goalKey={(selectedGoalKey ?? "save_more") as GoalKey}
              title={`${selectedGoal.title} in motion`}
              subtitle={playbook.heroSupport}
              progress={goalScore}
            />

            <div className="goals-hero__ring-card">
              <div className="goals-hero__ring" role="img" aria-label={`Goal progress at ${goalScore}%`}>
                <svg viewBox="0 0 240 240">
                  <defs>
                    <linearGradient id="goals-ring-gradient" x1="0" x2="1" y1="0" y2="1">
                      <stop offset="0%" stopColor="rgba(34,197,94,0.25)" />
                      <stop offset="100%" stopColor="rgba(3,168,192,0.92)" />
                    </linearGradient>
                  </defs>
                  <circle cx="120" cy="120" r="84" className="goals-ring__track" />
                  <circle
                    cx="120"
                    cy="120"
                    r="84"
                    className="goals-ring__progress"
                    stroke="url(#goals-ring-gradient)"
                    style={{
                      strokeDasharray: `${2 * Math.PI * 84 * (goalScore / 100)} ${2 * Math.PI * 84}`,
                    }}
                  />
                </svg>
                <div className="goals-hero__ring-copy">
                  <strong>{goalScore}%</strong>
                  <span>{selectedGoal.title}</span>
                </div>
              </div>

              <div className="goals-hero__stats">
                {goalSnapshot.map((item) => (
                  <div key={item.label} className="goals-stat">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.note}</small>
                  </div>
                ))}
              </div>
            </div>

            <article className="goals-pace-card glass">
              <div className="goals-panel__head">
                <div>
                  <p className="eyebrow">Pace check</p>
                  <h4>Target vs current rhythm</h4>
                </div>
                <div className="goals-panel__stat">
                  <strong>{formatPercent(targetRate)}</strong>
                  <span>Goal line</span>
                </div>
              </div>

              <div className="goals-pace__bars">
                {paceBars.map((bar) => (
                  <div key={bar.label} className={`goals-pace__bar ${bar.tone}`}>
                    <div className="goals-pace__label">
                      <span>{bar.label}</span>
                      <strong>{formatPercent(bar.value)}</strong>
                    </div>
                    <div className="goals-pace__track" aria-hidden="true">
                      <div className="goals-pace__fill" style={{ width: `${clamp(bar.value, 8, 100)}%` }} />
                    </div>
                    <small>{bar.note}</small>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </article>

        <article className="goals-chart-panel glass">
          <div className="goals-panel__head">
            <div>
              <p className="eyebrow">Momentum line</p>
              <h4>Your last six months at a glance</h4>
            </div>
            <div className="goals-panel__stat">
              <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
              <span>{currentNet >= previousNet ? "A stronger lane than last month" : "A softer lane than last month"}</span>
            </div>
          </div>

          <div className="goals-chart">
            <svg viewBox={`0 0 ${chart.chartWidth} ${chart.chartHeight}`} role="img" aria-label="Net cash flow trend over the last six months">
              <defs>
                <linearGradient id="goals-chart-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(3,168,192,0.26)" />
                  <stop offset="100%" stopColor="rgba(3,168,192,0.04)" />
                </linearGradient>
              </defs>
              <path
                d={`${chart.path} L ${chart.points[chart.points.length - 1].x.toFixed(1)} ${chart.chartHeight - chart.chartPadding} L ${
                  chart.points[0].x.toFixed(1)
                } ${chart.chartHeight - chart.chartPadding} Z`}
                fill="url(#goals-chart-fill)"
              />
              <path d={chart.path} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              {chart.points.map((point) => (
                <circle key={point.key} cx={point.x} cy={point.y} r="5.5" fill="white" stroke="var(--accent)" strokeWidth="3" />
              ))}
            </svg>

            <div className="goals-chart__labels">
              {chart.points.map((point) => (
                <div key={point.key} className="goals-chart__label">
                  <span>{point.label}</span>
                  <strong>{formatSignedCurrency(point.net)}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>

        <section className="goals-visual-grid">
          <article className="goals-heatmap glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Consistency grid</p>
                <h4>The last 28 days in color</h4>
              </div>
              <div className="goals-panel__stat">
                <strong>{dailyHeatmap.filter((day) => day.count > 0).length}</strong>
                <span>Active days</span>
              </div>
            </div>

            <div className="goals-heatmap__legend">
              <span>Quiet</span>
              <span>Steady</span>
              <span>Strong</span>
              <span>Locked in</span>
            </div>

            <div className="goals-heatmap__grid" role="img" aria-label="Daily activity heatmap for the last 28 days">
              {dailyHeatmap.map((day) => (
                <div
                  key={day.key}
                  className={`goals-heatmap__cell is-${day.intensity}`}
                  title={`${day.key}: ${day.count} transaction${day.count === 1 ? "" : "s"}${day.net !== 0 ? `, net ${formatSignedCurrency(day.net)}` : ""}`}
                >
                  <span>{day.day}</span>
                  <small>{day.count > 0 ? day.count : "·"}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="goals-drivers glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Momentum drivers</p>
                <h4>What is helping or hurting the lane</h4>
              </div>
              <div className="goals-panel__stat">
                <strong>{formatPercent(recurringShare * 100)}</strong>
                <span>Recurring share</span>
              </div>
            </div>

            <div className="goals-drivers__bars">
              {recurringMerchants.length > 0 ? (
                recurringMerchants.map((merchant) => {
                  const share = recurringDrag > 0 ? (merchant.amount / recurringDrag) * 100 : 0;
                  return (
                    <div key={merchant.label} className="goals-driver">
                      <div className="goals-driver__head">
                        <div className="goals-driver__icon" aria-hidden="true">
                          <GoalGlyph goalKey={selectedGoal.value} />
                        </div>
                        <div>
                          <strong>{merchant.label}</strong>
                          <span>{merchant.count} transactions</span>
                        </div>
                      </div>
                      <div className="goals-driver__track" aria-hidden="true">
                        <div className="goals-driver__fill" style={{ width: `${clamp(share, 8, 100)}%` }} />
                      </div>
                      <small>{formatCurrency(merchant.amount)}</small>
                    </div>
                  );
                })
              ) : (
                <div className="goals-driver goals-driver--empty">
                  <div className="goals-driver__head">
                    <div className="goals-driver__icon" aria-hidden="true">
                      <GoalGlyph goalKey={selectedGoal.value} />
                    </div>
                    <div>
                      <strong>No recurring drag yet</strong>
                      <span>Nothing is repeating enough to crowd the plan.</span>
                    </div>
                  </div>
                  <small>That makes the lane easier to steer.</small>
                </div>
              )}
            </div>
          </article>
        </section>

        <section className="goals-lanes">
          <div className="goals-lanes__head">
            <div>
              <p className="eyebrow">Onboarding goals</p>
              <h4>All the lanes Clover can coach you through</h4>
            </div>
            <p className="goals-lanes__summary">
              These are the same focus areas Clover asked about during onboarding. Your active lane is highlighted so
              you can see how the current month supports it.
            </p>
          </div>

          <div className="goals-lane-grid">
            {GOAL_OPTIONS.map((goal) => {
              const isActive = goal.value === selectedGoalKey;
              return (
                <article key={goal.value} className={`goals-lane glass ${isActive ? "is-active" : ""}`}>
                  <div className="goals-lane__top">
                    <div className="goals-lane__icon" aria-hidden="true">
                      <GoalGlyph goalKey={goal.value} />
                    </div>
                    <div className="goals-lane__badge-row">
                      <span className={`pill ${isActive ? "pill-good" : "pill-subtle"}`}>{isActive ? "Current focus" : "Available focus"}</span>
                      <span className="goals-lane__score">{goal.targetRate}% pace target</span>
                    </div>
                  </div>
                  <h5>{goal.title}</h5>
                  <p>{goal.description}</p>
                  <div className="goals-lane__footer">
                    <span>{goal.signal}</span>
                    {isActive ? <strong>{selectedGoal.coachNote}</strong> : <strong>{goal.coachNote}</strong>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="goals-intel-grid">
          <article className="goals-history glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Goal history</p>
                <h4>Your path so far</h4>
              </div>
              <div className="goals-panel__stat">
                <strong>{playbook.historyMarkers.length}</strong>
                <span>Coach checkpoints</span>
              </div>
            </div>

            <div className="goals-history__timeline">
              {historyEntries.map((entry) => (
                <div key={entry.label} className="goals-history__item">
                  <span className="goals-history__label">{entry.label}</span>
                  <strong>{entry.detail}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="goals-milestones glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Milestones</p>
                <h4>What progress looks like here</h4>
              </div>
              <div className="goals-panel__stat">
                <strong>{Math.round(weeklyProgress)}%</strong>
                <span>Weekly pace</span>
              </div>
            </div>

            <div className="goals-milestones__list">
              {milestoneCards.map((milestone) => (
                <div key={milestone.label} className={`goals-milestone ${milestone.reached ? "is-reached" : ""}`}>
                  <div className="goals-milestone__head">
                    <strong>
                      <span className="goals-milestone__icon" aria-hidden="true">
                        <GoalGlyph goalKey={selectedGoal.value} />
                      </span>
                      {milestone.label}
                    </strong>
                    <span>{milestone.reached ? "Reached" : `${Math.round(milestone.percent)}%`}</span>
                  </div>
                  <p>{milestone.detail}</p>
                  <div className="goals-milestone__bar" aria-hidden="true">
                    <div className="goals-milestone__fill" style={{ width: `${milestone.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="goals-weekly glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Weekly change</p>
                <h4>What shifted since the last check</h4>
              </div>
              <div className="goals-panel__stat">
                <strong className={goalScore >= 70 ? "positive" : "negative"}>{goalScore}</strong>
                <span>Coach score</span>
              </div>
            </div>

            <div className="goals-weekly__grid">
              {weeklySignals.map((signal) => (
                <div key={signal.label} className={`goals-weekly__card ${signal.tone}`}>
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <small>{signal.note}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <GoalsChecklist items={checklistItems} />

          <article className="goals-alerts glass">
            <div className="goals-panel__head">
              <div>
                <p className="eyebrow">Goal alerts</p>
                <h4>Coach notes for this moment</h4>
              </div>
              <div className="goals-panel__stat">
                <strong>{goalAlerts.length}</strong>
                <span>Active messages</span>
              </div>
            </div>

            <div className="goals-alerts__list">
              {goalAlerts.map((alert, index) => (
                <div key={`${alert.text}-${index}`} className="goals-alerts__item">
                  <span className="goals-alerts__dot" aria-hidden="true">
                    <GoalGlyph goalKey={selectedGoal.value} />
                </span>
                <p>{alert.text}</p>
              </div>
            ))}
          </div>
        </article>

        <GoalsEditor goals={GOAL_OPTIONS} currentGoal={selectedGoalKey} />

        <article className="goals-actions glass">
          <div className="goals-panel__head">
            <div>
              <p className="eyebrow">Next move</p>
              <h4>Keep the momentum moving</h4>
            </div>
            <div className="goals-panel__stat">
              <strong>{formatPercent(Math.max(0, goalScore - 50))}</strong>
              <span>Above the build line</span>
            </div>
          </div>

          <div className="goals-action-grid">
            <article className="goals-action">
              <div>
                <strong>Review transactions</strong>
                <span>Clear out the rough edges so the goal score keeps telling the truth.</span>
              </div>
              <Link className="pill-link pill-link--inline" href="/transactions">
                Open transactions
              </Link>
            </article>
            <article className="goals-action">
              <div>
                <strong>Open insights</strong>
                <span>Compare the coach view with the broader trend line whenever you need context.</span>
              </div>
              <Link className="pill-link pill-link--inline" href="/insights">
                Open insights
              </Link>
            </article>
            <article className="goals-action">
              <div>
                <strong>Inspect spending</strong>
                <span>Use the biggest category as the easiest lever for a quick win.</span>
              </div>
              <Link className="pill-link pill-link--inline" href="/reports">
                Open reports
              </Link>
            </article>
          </div>
        </article>
      </section>
    </CloverShell>
  );
}

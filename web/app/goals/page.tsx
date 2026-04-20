import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { GoalsEditor } from "@/components/goals-editor";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { GOAL_OPTIONS, getGoalDefinition } from "@/lib/goals";

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

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatSignedCurrency = (value: number) => `${value < 0 ? "-" : ""}${currencyFormatter.format(Math.abs(value))}`;
const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const toMonthLabel = (date: Date) => monthFormatter.format(date);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeMerchant = (value: string) => value.trim().toLowerCase();

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
    (await ensureStarterWorkspace(user.clerkUserId, user.email, user.verified).then(async (starterWorkspace) => {
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

  const currentSummary = currentWindowTransactions.reduce(
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

  const previousSummary = previousWindowTransactions.reduce(
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

  const progressLabel =
    goalScore >= 85 ? "Coach mode: you are ahead of the curve" : goalScore >= 70 ? "On pace and looking sharp" : goalScore >= 50 ? "Building good momentum" : "Early, but absolutely moving";

  const chart = createGoalChart(monthBuckets);
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

  const targetArc = `${Math.round(goalScore)}%`;
  const nextSteps = [
    {
      title: "Protect the first win",
      body: "Use a repeatable transfer or a weekly review so your goal keeps getting attention before the month gets noisy.",
      href: "/transactions",
      label: "Review transactions",
    },
    {
      title: "Trim one recurring drag",
      body: recurringMerchants[0]
        ? `Start with ${recurringMerchants[0].label} if you want a fast morale boost and more breathing room.`
        : "Look for the subscription, bill, or habit that is easiest to simplify right now.",
      href: "/reports",
      label: "Open reports",
    },
    {
      title: "Keep the goal in sight",
      body: "The cleaner the categories and duplicates, the more confident the next progress check will feel.",
      href: "/insights",
      label: "Open insights",
    },
  ];

  return (
    <CloverShell
      active="goals"
      title="Goals"
      kicker="Goal coaching"
      subtitle="A visual, encouraging view of the goal you set in onboarding, with the next best move front and center."
      showTopbar={false}
    >
      <section className="goals-story">
        <article className="goals-hero glass">
          <div className="goals-hero__copy">
            <div className="goals-hero__header">
              <span className="pill pill-accent">Onboarding goals</span>
              <span className="pill pill-subtle">{selectedGoal.title}</span>
            </div>
            <h3>
              {goalScore >= 70
                ? `You are building real momentum toward ${selectedGoal.title.toLowerCase()}.`
                : `You are still early in the climb toward ${selectedGoal.title.toLowerCase()}, and that is a good place to be.`}
            </h3>
            <p>
              Clover uses the same goal you picked during onboarding to keep the story focused. You can see the pace,
              the pressure points, and the exact habit that will move the needle next.
            </p>

            <div className="goals-hero__summary">
              <span className={`pill ${goalScore >= 70 ? "pill-good" : goalScore >= 50 ? "pill-accent" : "pill-warning"}`}>
                {coach.badge}
              </span>
              <span>{selectedGoal.signal}</span>
              <span>{selectedGoal.coachNote}</span>
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
                      <span>{goal.title.slice(0, 1)}</span>
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

        <GoalsEditor goals={GOAL_OPTIONS} currentGoal={selectedGoalKey} />

        <article className="goals-actions glass">
          <div className="goals-panel__head">
            <div>
              <p className="eyebrow">Next move</p>
              <h4>What to do this week</h4>
            </div>
            <div className="goals-panel__stat">
              <strong>{formatPercent(Math.max(0, goalScore - 50))}</strong>
              <span>Above the build line</span>
            </div>
          </div>

          <div className="goals-action-grid">
            {nextSteps.map((step) => (
              <article key={step.title} className="goals-action">
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </div>
                <Link className="pill-link pill-link--inline" href={step.href}>
                  {step.label}
                </Link>
              </article>
            ))}
          </div>
        </article>
      </section>
    </CloverShell>
  );
}

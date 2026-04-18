import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace, seedWorkspaceDefaults } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { ReportsReviewQueue, type ReportsQueueItem } from "@/components/reports-review-queue";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";

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
});

type ReportTransaction = {
  id: string;
  date: Date;
  amount: unknown;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description: string | null;
  account: {
    name: string;
  };
  category: {
    name: string;
  } | null;
  importFileId: string | null;
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

const formatShortDate = (value: Date) => shortDateFormatter.format(value);

const normalizeMerchant = (value: string) => value.trim().toLowerCase();

const goalLabels: Record<string, string> = {
  save_more: "Save more",
  pay_down_debt: "Pay down debt",
  track_spending: "Track spending",
  build_emergency_fund: "Build an emergency fund",
  invest_better: "Invest better",
};

const bucketMonth = (date: Date, buckets: MonthBucket[]) => buckets.find((bucket) => bucket.key === toIsoMonth(date));

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

export default async function ReportsPage() {
  const headerList = await headers();
  const hostname = (headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "")
    .split(",")[0]
    .split(":")[0]
    .toLowerCase();
  const isStagingHost = hostname === "staging.clover.ph";

  if (isStagingHost) {
    const sampleMonthBuckets = [
      { key: "2026-01", label: "Jan 2026", income: 38000, expense: 11200, net: 26800 },
      { key: "2026-02", label: "Feb 2026", income: 40250, expense: 9800, net: 30450 },
      { key: "2026-03", label: "Mar 2026", income: 41750, expense: 12100, net: 29650 },
      { key: "2026-04", label: "Apr 2026", income: 45000, expense: 3266, net: 41734 },
    ];

    const sampleTopCategories = [
      { label: "Food & Dining", amount: 3266, color: "#0ea5c8" },
      { label: "Transport", amount: 1880, color: "#36b6e0" },
      { label: "Subscriptions", amount: 970, color: "#7dd3fc" },
      { label: "Groceries", amount: 740, color: "#8b5cf6" },
      { label: "Utilities", amount: 510, color: "#14b8a6" },
    ] as const;

    const sampleReviewItems: ReportsQueueItem[] = [
      {
        title: "Ride share charge needs a category",
        description: "Assign this imported transport transaction so the spending report stays tidy.",
        tags: ["No category", "Imported transactions", "₱180.00"],
        actions: [
          { label: "Review transaction", href: "/transactions" },
          { label: "Open imports", href: "/imports", variant: "secondary" },
        ],
      },
      {
        title: "Coffee stop is still uncategorized",
        description: "A small manual expense is still waiting for classification.",
        tags: ["Manual entry", "No category", "₱120.00"],
        actions: [
          { label: "Review transaction", href: "/transactions" },
          { label: "Open settings", href: "/settings", variant: "secondary" },
        ],
      },
      {
        title: "Supermarket duplicates need confirmation",
        description: "This matched pair should be checked before it affects totals.",
        tags: ["Duplicate set", "Imported transactions", "₱1,460.00"],
        actions: [
          { label: "Review duplicates", href: "/transactions" },
          { label: "Open transactions", href: "/transactions", variant: "secondary" },
        ],
      },
    ];

    const sampleTotalSpend = sampleTopCategories.reduce((sum, category) => sum + category.amount, 0);
    const activeAccounts = [
      { name: "BPI Checking" },
      { name: "Union Savings" },
      { name: "GCash Wallet" },
    ];
    const totalAccountBalance = 41734;
    const importedTransactions = 42;
    const manualTransactions = 7;
    const importedAmount = 38700;
    const manualAmount = 2034;
    const chartWidth = 520;
    const chartHeight = 220;
    const chartPadding = 24;
    const chartXSpan = chartWidth - chartPadding * 2;
    const chartYSpan = chartHeight - chartPadding * 2;
    const cashFlowValues = sampleMonthBuckets.map((bucket) => bucket.net);
    const cashFlowMax = Math.max(...cashFlowValues);
    const cashFlowMin = Math.min(...cashFlowValues);
    const cashFlowRange = Math.max(cashFlowMax - cashFlowMin, 1);
    const cashFlowPoints = sampleMonthBuckets.map((bucket, index) => {
      const x = chartPadding + (index / Math.max(sampleMonthBuckets.length - 1, 1)) * chartXSpan;
      const normalized = (bucket.net - cashFlowMin) / cashFlowRange;
      const y = chartPadding + (1 - normalized) * chartYSpan;
      return { ...bucket, x, y };
    });
    const cashFlowPath = cashFlowPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ");
    const donutRadius = 72;
    const donutCircumference = 2 * Math.PI * donutRadius;
    let donutOffset = 0;

    return (
      <CloverShell
        active="insights"
        kicker="Insights"
        title="Turn your statements into clear next steps."
        subtitle="These sample reports are shown in staging so the page feels complete even before live workspace data is available."
        showTopbar={false}
        actions={
          <>
            <Link className="pill-link" href="/transactions">
              Transactions
            </Link>
            <Link className="pill-link" href="/imports">
              Imports
            </Link>
          </>
        }
      >
        <section className="reports-summary-grid reports-summary-grid--three">
          <article className="metric compact glass">
            <span>Net cash flow</span>
            <strong className="positive">₱41,734.00</strong>
            <small>Positive over the last 30 days · sample staging data</small>
          </article>
          <article className="metric compact glass">
            <span>Inflow</span>
            <strong>₱45,000.00</strong>
            <small>Income over the last 30 days · sample staging data</small>
          </article>
          <article className="metric compact glass">
            <span>Outflow</span>
            <strong>₱3,266.00</strong>
            <small>Expenses over the last 30 days · sample staging data</small>
          </article>
        </section>

        <section className="reports-grid reports-grid--primary">
          <article className="report-card glass report-card--wide">
            <div className="report-card__head">
              <div>
                <h4>Cash flow</h4>
              </div>
              <div className="report-card__stat">
                <strong className="positive">₱41,734.00</strong>
                <span>₱45,000.00 in · ₱3,266.00 out</span>
              </div>
            </div>

            <div className="report-chart">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="report-chart__svg" role="img" aria-label="Cash flow line chart">
                <defs>
                  <linearGradient id="cash-flow-gradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(14,165,233,0.28)" />
                    <stop offset="100%" stopColor="rgba(14,165,233,0.02)" />
                  </linearGradient>
                </defs>
                <path
                  d={`${cashFlowPath} L ${cashFlowPoints[cashFlowPoints.length - 1].x.toFixed(1)} ${chartHeight - chartPadding} L ${cashFlowPoints[0].x.toFixed(1)} ${chartHeight - chartPadding} Z`}
                  fill="url(#cash-flow-gradient)"
                />
                <path d={cashFlowPath} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                {cashFlowPoints.map((point) => (
                  <circle key={point.key} cx={point.x} cy={point.y} r="6" fill="white" stroke="var(--accent)" strokeWidth="3" />
                ))}
              </svg>

              <div className="report-chart__labels">
                {cashFlowPoints.map((point) => (
                  <div key={point.key} className="report-chart__label">
                    <span>{point.label}</span>
                    <strong>{formatCurrency(point.net)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Spending by category</h4>
              </div>
              <div className="report-card__stat">
                <strong>₱3,266.00</strong>
                <span>{sampleTopCategories.length} categories · 100% of spend</span>
              </div>
            </div>

            <div className="report-donut">
              <div className="report-donut__chart" aria-label="Spending donut chart" role="img">
                <svg viewBox="0 0 240 240">
                  <circle cx="120" cy="120" r={donutRadius} className="report-donut__track" />
                  {sampleTopCategories.map((category) => {
                    const share = (category.amount / sampleTotalSpend) * 100;
                    const segmentLength = (share / 100) * donutCircumference;
                    const dashArray = `${segmentLength} ${donutCircumference}`;
                    const dashOffset = -donutOffset;
                    donutOffset += segmentLength;
                    return (
                      <circle
                        key={category.label}
                        cx="120"
                        cy="120"
                        r={donutRadius}
                        className="report-donut__segment"
                        style={{
                          stroke: category.color,
                          strokeDasharray: dashArray,
                          strokeDashoffset: dashOffset,
                        }}
                      />
                    );
                  })}
                </svg>
                <div className="report-donut__center">
                  <strong>100%</strong>
                  <span>spent</span>
                </div>
              </div>

              <div className="report-donut__legend">
                {sampleTopCategories.map((category) => {
                  const share = (category.amount / sampleTotalSpend) * 100;
                  return (
                    <div key={category.label} className="report-donut__legend-item">
                      <span className="report-donut__swatch" style={{ background: category.color }} />
                      <div className="report-donut__meta">
                        <strong>{category.label}</strong>
                        <span>
                          {formatCurrency(category.amount)} · {share.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        </section>

        <section className="reports-grid reports-grid--secondary reports-grid--equal">
          <article className="report-card report-card--balanced glass">
            <ReportsReviewQueue items={sampleReviewItems} />
          </article>

          <article className="report-card report-card--balanced glass">
            <div className="report-card__head">
              <div>
                <h4>Data health</h4>
              </div>
              <div className="report-card__stat">
                <strong>{formatCurrency(totalAccountBalance)}</strong>
                <span>{activeAccounts.length} account{activeAccounts.length === 1 ? "" : "s"} with balances</span>
              </div>
            </div>

            <div className="report-insight-grid">
              <div className="report-insight">
                <span>Imported transactions</span>
                <strong>{importedTransactions}</strong>
                <small>{formatCurrency(importedAmount)} total</small>
              </div>
              <div className="report-insight">
                <span>Manual transactions</span>
                <strong>{manualTransactions}</strong>
                <small>{formatCurrency(manualAmount)} total</small>
              </div>
            </div>

            <div className="report-subsection">
              <p className="eyebrow">Latest import</p>
              <div className="report-list">
                <div className="report-list__item">
                  <div className="report-list__meta">
                    <strong>April_statement.csv</strong>
                    <span>{formatShortDate(new Date("2026-04-17T12:00:00"))} · done</span>
                  </div>
                  <div className="report-tags">
                    <span className="pill pill-good">done</span>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </section>
      </CloverShell>
    );
  }

  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const starterWorkspace = await ensureStarterWorkspace(user.clerkUserId, user.email, user.verified);
  await seedWorkspaceDefaults(starterWorkspace.id);

  const workspaces = await prisma.workspace.findMany({
    where: { userId: user.id },
    include: {
      accounts: true,
      importFiles: {
        orderBy: { uploadedAt: "desc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const selectedWorkspace =
    workspaces[0] ??
    (await prisma.workspace.findUnique({
      where: { id: starterWorkspace.id },
      include: {
        accounts: true,
        importFiles: {
          orderBy: { uploadedAt: "desc" },
        },
      },
    }));

  if (!selectedWorkspace) {
    redirect("/dashboard");
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      currentWindowTransactions,
      previousWindowTransactions,
      sixMonthTransactions,
      duplicateWindowTransactions,
      importedTransactionStats,
      manualTransactionStats,
    ] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          workspaceId: selectedWorkspace.id,
          isExcluded: false,
          date: { gte: thirtyDaysAgo },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          description: true,
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
          importFileId: true,
        },
        orderBy: { date: "desc" },
        take: 500,
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: selectedWorkspace.id,
          isExcluded: false,
          date: {
            gte: sixtyDaysAgo,
            lt: thirtyDaysAgo,
          },
        },
        select: {
          amount: true,
          type: true,
        },
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: selectedWorkspace.id,
          isExcluded: false,
          date: { gte: sixMonthsAgo },
        },
        select: {
          date: true,
          amount: true,
          type: true,
        },
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: selectedWorkspace.id,
          isExcluded: false,
          date: { gte: thirtyDaysAgo },
        },
        select: {
          id: true,
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
        },
        orderBy: { date: "desc" },
        take: 250,
      }),
      prisma.transaction.aggregate({
        where: {
          workspaceId: selectedWorkspace.id,
          isExcluded: false,
          importFileId: { not: null },
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          workspaceId: selectedWorkspace.id,
          isExcluded: false,
          importFileId: null,
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

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

        const categoryName = transaction.category?.name ?? "Uncategorized";
        if (transaction.type === "expense") {
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
        } else {
          accumulator.transfer += amount;
        }
        return accumulator;
      },
      {
        income: 0,
        expense: 0,
        transfer: 0,
      }
    );

    const monthBuckets = getMonthBuckets(now);
    sixMonthTransactions.forEach((transaction) => {
      const bucket = bucketMonth(transaction.date, monthBuckets);
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

    const activeAccounts = selectedWorkspace.accounts.filter((account) => account.balance !== null);
    const totalAccountBalance = activeAccounts.reduce((sum, account) => sum + Number(account.balance ?? 0), 0);
    const uncategorizedTransactions = currentWindowTransactions.filter(
      (transaction) => !transaction.category?.name || !transaction.merchantClean
    );

    const duplicateGroups = new Map<string, (typeof duplicateWindowTransactions)[number][]>();
    duplicateWindowTransactions.forEach((transaction) => {
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

    const possibleDuplicateGroups = Array.from(duplicateGroups.values())
      .filter((group) => group.length > 1)
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);

    const importFiles = selectedWorkspace.importFiles;
    const importStatusCounts = importFiles.reduce(
      (counts, file) => {
        counts[file.status] += 1;
        return counts;
      },
      {
        processing: 0,
        done: 0,
        failed: 0,
        deleted: 0,
      }
    );

    const latestImport = importFiles[0];
    const actionableCount =
      uncategorizedTransactions.length + possibleDuplicateGroups.length + importStatusCounts.processing + importStatusCounts.failed;

    const nextStep =
      uncategorizedTransactions.length > 0
        ? {
            title: `${uncategorizedTransactions.length} transaction${uncategorizedTransactions.length === 1 ? "" : "s"} need review`,
            body: "Finish assigning categories and merchant names so the reports stay clean.",
            href: "/transactions",
            label: "Review transactions",
          }
        : possibleDuplicateGroups.length > 0
          ? {
              title: `${possibleDuplicateGroups.length} possible duplicate set${possibleDuplicateGroups.length === 1 ? "" : "s"} found`,
              body: "Check the repeated rows before they affect cash flow and category totals.",
              href: "/transactions",
              label: "Check duplicates",
            }
          : importStatusCounts.failed > 0
            ? {
                title: `${importStatusCounts.failed} import${importStatusCounts.failed === 1 ? "" : "s"} failed`,
                body: "Inspect the failed file(s) before importing more data.",
                href: "/imports",
                label: "Fix imports",
              }
            : importStatusCounts.processing > 0
              ? {
                  title: `${importStatusCounts.processing} import${importStatusCounts.processing === 1 ? "" : "s"} are still processing`,
                  body: "Wait for the upload pipeline to finish, then review the parsed rows.",
                  href: "/imports",
                  label: "Open imports",
                }
              : {
                  title: "No urgent clean-up items",
                  body: "Your current data looks tidy. You can still review spending and cash flow trends below.",
                  href: "/transactions",
                  label: "Open transactions",
                };

    const topCategories = Array.from(currentSummary.expenseCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const maxCategorySpend = topCategories[0]?.[1] ?? 0;
    const maxMonthlyNet = Math.max(...monthBuckets.map((bucket) => Math.abs(bucket.net)), 1);

    const currentNet = currentSummary.income - currentSummary.expense;
    const previousNet = previousSummary.income - previousSummary.expense;
    const currentSpend = currentSummary.expense;
    const previousSpend = previousSummary.expense;
    const savingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
    const spendDelta = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;
    const incomeDelta = previousSummary.income > 0 ? ((currentSummary.income - previousSummary.income) / previousSummary.income) * 100 : null;
    const topCategoryShare = currentSpend > 0 ? maxCategorySpend / currentSpend : null;
    const importedTransactions = importedTransactionStats._count.id;
    const manualTransactions = manualTransactionStats._count.id;
    const importedAmount = Number(importedTransactionStats._sum.amount ?? 0);
    const manualAmount = Number(manualTransactionStats._sum.amount ?? 0);
    const goalKey = user.primaryGoal?.trim() ?? null;
    const goalLabel = goalKey ? goalLabels[goalKey] ?? goalKey : null;

    const merchantSpend = new Map<
      string,
      {
        label: string;
        amount: number;
        count: number;
      }
    >();

    currentWindowTransactions.forEach((transaction) => {
      if (transaction.type !== "expense") {
        return;
      }

      const label = transaction.merchantClean ?? transaction.merchantRaw;
      const key = normalizeMerchant(label);
      const existing = merchantSpend.get(key) ?? { label, amount: 0, count: 0 };
      existing.amount += Math.abs(Number(transaction.amount));
      existing.count += 1;
      merchantSpend.set(key, existing);
    });

    const recurringMerchants = Array.from(merchantSpend.values())
      .filter((merchant) => merchant.count > 1)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    const trendDirection = currentNet >= previousNet ? "improving" : "softening";
    const spendDirection = spendDelta === null ? null : spendDelta > 0 ? "up" : spendDelta < 0 ? "down" : "flat";

    const goalSummary = goalLabel
      ? currentNet >= 0
        ? `Your ${goalLabel.toLowerCase()} goal has room to move forward because the last 30 days ended positive.`
        : `Your ${goalLabel.toLowerCase()} goal needs a tighter spending pattern or higher income to move faster.`
      : "Set a primary goal so Clover can compare your cash flow and spending against something specific.";

    const aiHeadline = goalLabel
      ? currentNet >= 0
        ? `You are currently ${trendDirection}, and the numbers are supportive of ${goalLabel.toLowerCase()}.`
        : `You are currently ${trendDirection}, but spending is still limiting ${goalLabel.toLowerCase()}.`
      : currentNet >= 0
        ? "Your cash flow is trending positively, and the next step is making that progress more intentional."
        : "Your cash flow is under pressure, so the highest-impact move is to slow spending and clear the review queue.";

    const aiSummary =
      spendDirection === null
        ? "There is enough fresh activity to identify direction, but a prior comparison period is missing in one or more areas."
        : currentNet >= 0
          ? `Spending is ${spendDirection} while net cash flow remains positive, which points to a stable month with room for optimization.`
          : `Spending is ${spendDirection} and cash flow is negative, which suggests the fastest win is a tighter expense pattern.`;

    const aiSignals = [
      {
        label: "Cash flow",
        value: formatSignedCurrency(currentNet),
        detail:
          previousNet === 0
            ? "No prior baseline to compare"
            : `${currentNet >= previousNet ? "Ahead of" : "Behind"} the prior 30 days`,
        tone: currentNet >= 0 ? "good" : "danger",
      },
      {
        label: "Savings rate",
        value: savingsRate === null ? "N/A" : formatPercent(savingsRate * 100),
        detail: goalLabel ? `Evaluated against ${goalLabel.toLowerCase()}` : "Add a goal for a clearer target",
        tone: savingsRate !== null && savingsRate >= 0.2 ? "good" : "subtle",
      },
      {
        label: "Top spend share",
        value: topCategoryShare === null ? "N/A" : formatPercent(topCategoryShare * 100),
        detail: topCategories[0]?.[0] ?? "No top category yet",
        tone: topCategoryShare !== null && topCategoryShare < 0.45 ? "good" : "subtle",
      },
      {
        label: "Review load",
        value: `${uncategorizedTransactions.length + possibleDuplicateGroups.length}`,
        detail: `${uncategorizedTransactions.length} uncategorized, ${possibleDuplicateGroups.length} duplicate set${possibleDuplicateGroups.length === 1 ? "" : "s"}`,
        tone:
          uncategorizedTransactions.length + possibleDuplicateGroups.length > 0
            ? "danger"
            : "good",
      },
    ] as const;

    const aiActions = [
      {
        title: goalLabel ? `Tighten the path toward ${goalLabel.toLowerCase()}` : "Set a goal to give this page a target",
        body: goalLabel
          ? "Use the goal as the benchmark when you judge spend, savings, and monthly momentum."
          : "A target gives the page a clear direction, so insights can explain progress instead of only trends.",
        href: goalLabel ? "/settings" : "/onboarding",
        label: goalLabel ? "Review goal" : "Set goal",
      },
      {
        title: "Clean the review queue",
        body: "Fix uncategorized transactions and duplicate rows so the next round of insights stays sharper.",
        href: "/transactions",
        label: "Open transactions",
      },
      {
        title: "Check the highest-spend category",
        body: "If one category dominates, that is usually the easiest place to find a real improvement.",
        href: "/transactions",
        label: "Inspect spending",
      },
    ];

    const goalNextStep = goalLabel
      ? {
          title: `Keep ${goalLabel.toLowerCase()} in view`,
          body: "Use goal-aware insights to see whether spending and cash flow are helping or slowing you down.",
          href: "/settings",
          label: "Open settings",
        }
      : {
          title: "Choose a goal to sharpen the insights",
          body: "A goal gives the page a destination, so every trend can be evaluated against progress instead of noise.",
          href: "/onboarding",
          label: "Set a goal",
        };

    return (
      <CloverShell
        active="insights"
        kicker="Insights"
        title="Turn your statements into clear next steps."
        subtitle="These insights are generated from imported statements, parsed transactions, and manual entries so you can see what changed, why it changed, and what to do next."
        actions={
          <>
            <Link className="pill-link" href="/transactions">
              Transactions
            </Link>
            <Link className="pill-link" href="/imports">
              Imports
            </Link>
          </>
        }
      >
        <section className="reports-hero">
          <div className="reports-hero__copy glass">
            <span className="pill pill-accent">Goal-aware insights</span>
            <h3>A calm view of your money that explains what changed and what it means.</h3>
            <p>
              The page focuses on the minimum useful set: cash flow, spending patterns, review work, and goal
              alignment. That keeps the experience readable while still giving you the full picture.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href={nextStep.href}>
                {nextStep.label}
              </Link>
              <Link className="button button-secondary" href="/transactions">
                Open transactions
              </Link>
              <Link className="button button-secondary" href="/settings">
                Review settings
              </Link>
            </div>
          </div>

          <article className="reports-next glass">
            <p className="eyebrow">Goal lens</p>
            <h4>{goalNextStep.title}</h4>
            <p>{goalSummary}</p>
            <div className="reports-next__meta">
              <span>{goalLabel ?? "No primary goal set"}</span>
              <span>{savingsRate === null ? "Savings rate unavailable" : `${formatPercent(savingsRate * 100)} savings rate`}</span>
            </div>
            <Link className="button button-primary button-pill" href={goalNextStep.href}>
              {goalNextStep.label}
            </Link>
            <div className="reports-next__meta">
              <span>
                {actionableCount} item{actionableCount === 1 ? "" : "s"} need attention
              </span>
              <span>{selectedWorkspace.accounts.length} account{selectedWorkspace.accounts.length === 1 ? "" : "s"}</span>
            </div>
          </article>
        </section>

        <section className="reports-ai-grid">
          <article className="report-ai-card report-ai-card--featured glass">
            <p className="eyebrow">AI brief</p>
            <h3>{aiHeadline}</h3>
            <p>{aiSummary}</p>
            <div className="report-ai-card__actions">
              <Link className="button button-primary button-pill" href={aiActions[0].href}>
                {aiActions[0].label}
              </Link>
              <Link className="button button-secondary button-pill" href="/transactions">
                Open transactions
              </Link>
            </div>
          </article>

          <article className="report-ai-card glass">
            <div className="report-card__head">
              <div>
                <h4>Signals</h4>
              </div>
            </div>
            <div className="report-ai-signal-grid">
              {aiSignals.map((signal) => (
                <div key={signal.label} className={`report-ai-signal report-ai-signal--${signal.tone}`}>
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                  <small>{signal.detail}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="report-ai-card glass">
            <div className="report-card__head">
              <div>
                <h4>Next moves</h4>
              </div>
            </div>
            <div className="report-list">
              {aiActions.map((action) => (
                <div key={action.title} className="report-list__item report-list__item--compact">
                  <div className="report-list__meta">
                    <strong>{action.title}</strong>
                    <span>{action.body}</span>
                  </div>
                  <Link className="pill-link pill-link--inline" href={action.href}>
                    {action.label}
                  </Link>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="reports-summary-grid">
          <article className="metric compact glass">
            <span>Net cash flow</span>
            <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
            <small>
              {currentNet >= 0 ? "Positive" : "Negative"} over the last 30 days ·{" "}
              {previousNet === 0 ? "No prior baseline" : `${currentNet >= previousNet ? "above" : "below"} the prior period`}
            </small>
          </article>
          <article className="metric compact glass">
            <span>Savings rate</span>
            <strong>{savingsRate === null ? "N/A" : formatPercent(savingsRate * 100)}</strong>
            <small>
              {goalLabel ? `${goalLabel} is the lens here` : "Add a goal to track progress against"}
            </small>
          </article>
          <article className="metric compact glass">
            <span>Top category</span>
            <strong>{topCategories[0]?.[0] ?? "N/A"}</strong>
            <small>
              {topCategoryShare === null ? "No spending data yet" : `${formatPercent(topCategoryShare * 100)} of total spend`}
            </small>
          </article>
          <article className="metric compact glass">
            <span>Needs review</span>
            <strong>{uncategorizedTransactions.length + possibleDuplicateGroups.length}</strong>
            <small>
              {uncategorizedTransactions.length} uncategorized · {possibleDuplicateGroups.length} duplicate set
              {possibleDuplicateGroups.length === 1 ? "" : "s"}
            </small>
          </article>
        </section>

        <section className="reports-grid reports-grid--primary">
          <article className="report-card glass report-card--wide">
            <div className="report-card__head">
              <div>
                <h4>Cash flow</h4>
              </div>
              <div className="report-card__stat">
                <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
                <span>
                  {currentSummary.income > 0 ? `${formatCurrency(currentSummary.income)} in` : "No income"}
                  {" · "}
                  {currentSummary.expense > 0 ? `${formatCurrency(currentSummary.expense)} out` : "No spending"}
                </span>
              </div>
            </div>

            <div className="report-insight-grid">
              <div className="report-insight">
                <span>Current 30 days</span>
                <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
                <small>
                  {incomeDelta === null ? "No previous baseline" : `${formatPercent(incomeDelta)} vs the prior 30 days`}
                </small>
              </div>
              <div className="report-insight">
                <span>Previous 30 days</span>
                <strong className={previousNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(previousNet)}</strong>
                <small>
                  {previousNet === 0 ? "No prior benchmark" : `${previousNet >= 0 ? "Positive" : "Negative"} cash flow`}
                </small>
              </div>
            </div>

            <div className="report-subsection">
              <p className="eyebrow">Why it changed</p>
              <div className="report-list">
                <div className="report-list__item">
                  <div className="report-list__meta">
                    <strong>Spending</strong>
                    <span>{spendDelta === null ? "No prior comparison period" : `${formatPercent(spendDelta)} vs the previous 30 days`}</span>
                  </div>
                </div>
                <div className="report-list__item">
                  <div className="report-list__meta">
                    <strong>Income</strong>
                    <span>{incomeDelta === null ? "No prior comparison period" : `${formatPercent(incomeDelta)} vs the previous 30 days`}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="report-timeline">
              {monthBuckets.map((bucket) => {
                const width = Math.max((Math.abs(bucket.net) / maxMonthlyNet) * 100, bucket.net === 0 ? 6 : 18);
                return (
                  <div key={bucket.key} className="report-timeline__row">
                    <div className="report-timeline__label">{bucket.label}</div>
                    <div className="report-timeline__track" aria-hidden="true">
                      <span
                        className={`report-timeline__fill ${bucket.net >= 0 ? "report-timeline__fill--positive" : "report-timeline__fill--negative"}`}
                        style={{ width: `${Math.min(width, 100)}%` }}
                      />
                    </div>
                    <div className={`report-timeline__value ${bucket.net >= 0 ? "positive" : "negative"}`}>
                      {formatCurrency(bucket.net)}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Spending by category</h4>
              </div>
              <div className="report-card__stat">
                <strong>{formatCurrency(currentSpend)}</strong>
                <span>
                  {topCategories.length > 0 ? `${topCategories.length} leading categories` : "No spending yet"}
                </span>
              </div>
            </div>

            <div className="report-list">
              {topCategories.length > 0 ? (
                topCategories.map(([categoryName, amount]) => {
                  const share = maxCategorySpend > 0 ? (amount / maxCategorySpend) * 100 : 0;
                  return (
                    <div key={categoryName} className="report-list__item">
                      <div className="report-list__meta">
                        <strong>{categoryName}</strong>
                        <span>{formatCurrency(amount)}</span>
                      </div>
                      <div className="report-list__track" aria-hidden="true">
                        <span className="report-list__fill" style={{ width: `${Math.max(share, 8)}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">No categorized expenses yet.</div>
              )}
            </div>

            <div className="report-subsection">
              <p className="eyebrow">Recurring merchants</p>
              <div className="report-list">
                {recurringMerchants.length > 0 ? (
                  recurringMerchants.map((merchant) => (
                    <div key={merchant.label} className="report-list__item">
                      <div className="report-list__meta">
                        <strong>{merchant.label}</strong>
                        <span>
                          {merchant.count} transaction{merchant.count === 1 ? "" : "s"} · {formatCurrency(merchant.amount)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No repeat merchants surfaced in the current period.</div>
                )}
              </div>
            </div>
          </article>
        </section>

        <section className="reports-grid reports-grid--secondary">
          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Review queue</h4>
              </div>
              <div className="report-card__stat">
                <strong>{uncategorizedTransactions.length + possibleDuplicateGroups.length}</strong>
                <span>actionable items</span>
              </div>
            </div>

            <div className="report-subsection">
              <p className="eyebrow">Uncategorized</p>
              <div className="report-list">
                {uncategorizedTransactions.length > 0 ? (
                  uncategorizedTransactions.slice(0, 4).map((transaction) => (
                    <div key={transaction.id} className="report-list__item">
                      <div className="report-list__meta">
                        <strong>{transaction.merchantClean ?? transaction.merchantRaw}</strong>
                        <span>
                          {transaction.account.name} · {formatShortDate(transaction.date)} · {formatCurrency(Number(transaction.amount))}
                        </span>
                      </div>
                      <div className="report-tags">
                        {!transaction.category?.name ? <span className="pill pill-subtle">No category</span> : null}
                        {!transaction.merchantClean ? <span className="pill pill-subtle">Merchant name missing</span> : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No uncategorized transactions right now.</div>
                )}
              </div>
            </div>

            <div className="report-subsection">
              <p className="eyebrow">Possible duplicates</p>
              <div className="report-list">
                {possibleDuplicateGroups.length > 0 ? (
                  possibleDuplicateGroups.map((group) => {
                    const representative = group[0];
                    const total = group.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
                    return (
                      <div key={`${representative.id}-${group.length}`} className="report-list__item">
                        <div className="report-list__meta">
                          <strong>{representative.merchantClean ?? representative.merchantRaw}</strong>
                          <span>
                            {group.length} matches · {representative.account.name} · {formatShortDate(representative.date)}
                          </span>
                        </div>
                        <div className="report-tags">
                          <span className="pill pill-subtle">{formatCurrency(total)}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-state">No likely duplicates surfaced in the current data set.</div>
                )}
              </div>
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Data health</h4>
              </div>
              <div className="report-card__stat">
                <strong>{formatCurrency(totalAccountBalance)}</strong>
                <span>{activeAccounts.length} account{activeAccounts.length === 1 ? "" : "s"} with balances</span>
              </div>
            </div>

            <div className="report-insight-grid">
              <div className="report-insight">
                <span>Imported transactions</span>
                <strong>{importedTransactions}</strong>
                <small>{formatCurrency(importedAmount)} total</small>
              </div>
              <div className="report-insight">
                <span>Manual transactions</span>
                <strong>{manualTransactions}</strong>
                <small>{formatCurrency(manualAmount)} total</small>
              </div>
            </div>

            <div className="report-subsection">
              <p className="eyebrow">Goal lens</p>
              <div className="report-list">
                <div className="report-list__item">
                  <div className="report-list__meta">
                    <strong>{goalLabel ?? "No goal set yet"}</strong>
                    <span>{goalSummary}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="report-status-list">
              <div className="report-status-list__item">
                <span>Done</span>
                <strong>{importStatusCounts.done}</strong>
              </div>
              <div className="report-status-list__item">
                <span>Processing</span>
                <strong>{importStatusCounts.processing}</strong>
              </div>
              <div className="report-status-list__item">
                <span>Failed</span>
                <strong>{importStatusCounts.failed}</strong>
              </div>
              <div className="report-status-list__item">
                <span>Deleted</span>
                <strong>{importStatusCounts.deleted}</strong>
              </div>
            </div>

            <div className="report-subsection">
              <p className="eyebrow">Latest import</p>
              {latestImport ? (
                <div className="report-list">
                  <div className="report-list__item">
                    <div className="report-list__meta">
                      <strong>{latestImport.fileName}</strong>
                      <span>
                        {formatShortDate(new Date(latestImport.uploadedAt))} · {latestImport.status}
                      </span>
                    </div>
                    <div className="report-tags">
                      <span className={`pill pill-${latestImport.status === "done" ? "good" : latestImport.status === "failed" ? "danger" : "subtle"}`}>
                        {latestImport.status}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state">No import files available yet.</div>
              )}
            </div>
          </article>
        </section>
      </CloverShell>
    );
  } catch (error) {
    console.error("Reports page failed to load", error);

    return (
      <CloverShell
        active="reports"
        kicker="Insights"
        title="Turn your statements into clear next steps."
        subtitle="The insights page could not load right now, but your workspace and transactions are still available."
        actions={
          <>
            <Link className="pill-link" href="/transactions">
              Transactions
            </Link>
            <Link className="pill-link" href="/imports">
              Imports
            </Link>
          </>
        }
      >
        <section className="report-card glass">
          <p className="eyebrow">Reports unavailable</p>
          <h4>We hit a temporary server issue while building this page.</h4>
          <p className="panel-muted">
            Try again in a moment. If the problem keeps happening, the imports or database connection may need a quick check.
          </p>
        </section>
      </CloverShell>
    );
  }
}

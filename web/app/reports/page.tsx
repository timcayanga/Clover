import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { EmptyDataCta } from "@/components/empty-data-cta";
import { ReportsReviewQueue, type ReportsQueueItem } from "@/components/reports-review-queue";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { selectedWorkspaceKey } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Reports",
};

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

type WindowSummary = {
  income: number;
  expense: number;
  transfer: number;
  expenseCategories: Map<string, number>;
};

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

type WorkspaceAccountSnapshot = {
  id: string;
  name: string;
  balance: unknown;
  currency: string;
  type: string;
};

type RecurringMerchant = {
  label: string;
  amount: number;
  dates: Date[];
  count: number;
  cadenceLabel: string;
  nextDueDate: Date | null;
};

type ReportsRange = "30d" | "90d" | "ytd";

const reportsRangeLabels: Record<ReportsRange, string> = {
  "30d": "30 days",
  "90d": "90 days",
  ytd: "Year to date",
};

const normalizeReportsRange = (value: string | undefined): ReportsRange => {
  if (value === "90d" || value === "ytd") {
    return value;
  }

  return "30d";
};

const getReportWindow = (anchor: Date, range: ReportsRange) => {
  const currentStart = new Date(anchor);
  if (range === "30d") {
    currentStart.setDate(currentStart.getDate() - 30);
  } else if (range === "90d") {
    currentStart.setDate(currentStart.getDate() - 90);
  } else {
    currentStart.setMonth(0, 1);
    currentStart.setHours(0, 0, 0, 0);
  }

  const previousStart = new Date(currentStart);
  if (range === "30d") {
    previousStart.setDate(previousStart.getDate() - 30);
  } else if (range === "90d") {
    previousStart.setDate(previousStart.getDate() - 90);
  } else {
    const durationDays = Math.max(Math.round((anchor.getTime() - currentStart.getTime()) / 86400000), 1);
    previousStart.setDate(previousStart.getDate() - durationDays);
  }

  return { currentStart, previousStart };
};

const formatCurrency = (value: number) => currencyFormatter.format(value);

const formatSignedCurrency = (value: number) => `${value < 0 ? "-" : ""}${currencyFormatter.format(Math.abs(value))}`;

const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;

const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const toMonthLabel = (date: Date) => monthFormatter.format(date);

const formatShortDate = (value: Date) => shortDateFormatter.format(value);

const normalizeMerchant = (value: string) => value.trim().toLowerCase();

const buildTransactionsHref = (params: Record<string, string>) => `/transactions?${new URLSearchParams(params).toString()}`;

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

async function ReportsPageView({
  active = "reports",
  searchParams,
}: {
  active?: "reports" | "insights";
  searchParams?: { range?: string };
}) {
  const headerList = await headers();
  const cookieStore = await cookies();
  const hostname = (headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "")
    .split(",")[0]
    .split(":")[0]
    .toLowerCase();
  const isStagingHost = hostname === "staging.clover.ph";
  const selectedWorkspaceCookieId = cookieStore.get(selectedWorkspaceKey)?.value ?? "";
  const selectedRange = normalizeReportsRange(searchParams?.range);
  const selectedRangeLabel = reportsRangeLabels[selectedRange];
  const rangeWindowText = selectedRangeLabel.toLowerCase();

  if (false && isStagingHost) {
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
      { label: "Entertainment", amount: 820, color: "#f59e0b" },
      { label: "Groceries", amount: 740, color: "#8b5cf6" },
      { label: "Utilities", amount: 510, color: "#14b8a6" },
    ] as const;

    const sampleRecurringPayments: Array<{ label: string; amount: number; count: number }> = [
      { label: "Cloud storage", amount: 499, count: 2 },
      { label: "Music streaming", amount: 199, count: 2 },
      { label: "Delivery pass", amount: 149, count: 2 },
    ];

    const sampleTopMerchants: Array<{ label: string; amount: number; count: number }> = [
      { label: "Food Mart", amount: 1240, count: 4 },
      { label: "Ride Share", amount: 980, count: 5 },
      { label: "Coffee Shop", amount: 640, count: 6 },
      { label: "Online Store", amount: 510, count: 3 },
      { label: "Gym", amount: 399, count: 2 },
    ];

    const sampleCurrentMonth = sampleMonthBuckets[sampleMonthBuckets.length - 1];
    const samplePreviousMonth = sampleMonthBuckets[sampleMonthBuckets.length - 2];
    const sampleMonthlyChange = sampleCurrentMonth.net - samplePreviousMonth.net;
    const sampleFreshness = "Sample staging data refreshed";

    const sampleReviewItems: ReportsQueueItem[] = [
      {
        title: "Ride share charge needs a category",
        description: "Assign this imported transport transaction so the spending report stays tidy.",
        tags: ["No category", "Imported transactions", "₱180.00"],
        categoryOptions: ["Transport", "Food & Dining", "Groceries", "Utilities", "Subscriptions", "Entertainment"],
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
        active={active}
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
        <section className="reports-range-switch glass">
          <div className="reports-range-switch__copy">
            <span className="eyebrow">Range</span>
            <p>{selectedRangeLabel}</p>
          </div>
          <div className="reports-range-switch__controls" role="tablist" aria-label="Report range">
            {(["30d", "90d", "ytd"] as const).map((range) => (
              <Link key={range} className={`pill pill-interactive ${selectedRange === range ? "pill-is-selected" : ""}`} href={`?range=${range}`}>
                {reportsRangeLabels[range]}
              </Link>
            ))}
          </div>
        </section>

        <section className="reports-freshness">
          <span className="pill pill-subtle">{sampleFreshness}</span>
        </section>

        <section className="reports-summary-grid reports-summary-grid--three">
          <article className="metric compact glass">
            <span>Net cash flow</span>
            <strong className="positive">₱41,734.00</strong>
            <small>Positive over the last {rangeWindowText} · sample staging data</small>
          </article>
          <article className="metric compact glass">
            <span>Inflow</span>
            <strong>₱45,000.00</strong>
            <small>Income over the last {rangeWindowText} · sample staging data</small>
          </article>
          <article className="metric compact glass">
            <span>Outflow</span>
            <strong>₱3,266.00</strong>
            <small>Expenses over the last {rangeWindowText} · sample staging data</small>
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
                  <Link key={point.key} href={buildTransactionsHref({ month: point.key })} className="report-chart__label report-list__item--link">
                    <span>{point.label}</span>
                    <strong>{formatCurrency(point.net)}</strong>
                  </Link>
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
                    <Link
                      key={category.label}
                      href={buildTransactionsHref({ category: category.label })}
                      className="report-donut__legend-item report-list__item--link"
                    >
                      <span className="report-donut__swatch" style={{ background: category.color }} />
                      <div className="report-donut__meta">
                        <strong>{category.label}</strong>
                        <span>
                          {formatCurrency(category.amount)} · {share.toFixed(0)}%
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </article>
        </section>

        <section className="reports-grid reports-grid--free">
          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Recurring payments</h4>
              </div>
              <div className="report-card__stat">
                <strong>{sampleRecurringPayments.length}</strong>
                <span>fixed costs surfaced</span>
              </div>
            </div>

            <div className="report-list">
              {sampleRecurringPayments.map((payment) => (
                <Link
                  key={payment.label}
                  href={buildTransactionsHref({ merchant: payment.label, review: "1" })}
                  className="report-list__item report-list__item--link"
                >
                  <div className="report-list__meta">
                    <strong>{payment.label}</strong>
                    <span>
                      {payment.count} payments · {formatCurrency(payment.amount)}
                    </span>
                  </div>
                  <div className="report-tags">
                    <span className="pill pill-subtle">Subscription</span>
                  </div>
                </Link>
              ))}
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Top merchants</h4>
              </div>
              <div className="report-card__stat">
                <strong>{sampleTopMerchants.length}</strong>
                <span>where spending concentrates</span>
              </div>
            </div>

            <div className="report-list">
              {sampleTopMerchants.map((merchant) => (
                <Link
                  key={merchant.label}
                  href={buildTransactionsHref({ merchant: merchant.label })}
                  className="report-list__item report-list__item--link"
                >
                  <div className="report-list__meta">
                    <strong>{merchant.label}</strong>
                    <span>
                      {merchant.count} transaction{merchant.count === 1 ? "" : "s"} · {formatCurrency(merchant.amount)}
                    </span>
                  </div>
                  <div className="report-list__track" aria-hidden="true">
                    <span className="report-list__fill" style={{ width: `${Math.max((merchant.amount / sampleTopMerchants[0].amount) * 100, 10)}%` }} />
                  </div>
                </Link>
              ))}
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Monthly summary</h4>
              </div>
              <div className="report-card__stat">
                <strong className={sampleCurrentMonth.net >= 0 ? "positive" : "negative"}>{formatSignedCurrency(sampleCurrentMonth.net)}</strong>
                <span>
                  {sampleCurrentMonth.label} · {sampleMonthlyChange >= 0 ? "up" : "down"} vs last month
                </span>
              </div>
            </div>

            <div className="report-insight-grid">
              <div className="report-insight">
                <span>Total income</span>
                <strong>{formatCurrency(sampleCurrentMonth.income)}</strong>
                <small>{sampleCurrentMonth.label}</small>
              </div>
              <div className="report-insight">
                <span>Total spending</span>
                <strong>{formatCurrency(sampleCurrentMonth.expense)}</strong>
                <small>All tracked expenses</small>
              </div>
              <div className="report-insight">
                <span>Net result</span>
                <strong className={sampleCurrentMonth.net >= 0 ? "positive" : "negative"}>{formatSignedCurrency(sampleCurrentMonth.net)}</strong>
                <small>Income minus spending</small>
              </div>
              <div className="report-insight">
                <span>Change vs last month</span>
                <strong className={sampleMonthlyChange >= 0 ? "positive" : "negative"}>{formatSignedCurrency(sampleMonthlyChange)}</strong>
                <small>{samplePreviousMonth.label}</small>
              </div>
            </div>
            <div className="report-subsection report-subsection--compact">
              <Link className="pill-link pill-link--inline" href={buildTransactionsHref({ month: sampleCurrentMonth.key })}>
                Open {sampleCurrentMonth.label}
              </Link>
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
  const existingUser = await prisma.user.findUnique({
    where: { clerkUserId: session.userId },
  });
  const user = existingUser ?? (await getOrCreateCurrentUser(session.userId));
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  let selectedWorkspaceId: string =
    (
      (selectedWorkspaceCookieId
        ? await prisma.workspace.findFirst({
            where: {
              id: selectedWorkspaceCookieId,
              userId: user.id,
            },
            select: { id: true },
          })
        : null) ??
      (await prisma.workspace.findFirst({
        where: { userId: user.id },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      }))
    )?.id ?? "";

  if (!selectedWorkspaceId) {
    const starterWorkspace = await ensureStarterWorkspace(user);
    const starterWorkspaceId = starterWorkspace?.id;
    if (!starterWorkspaceId) {
      console.error("Reports starter workspace could not be resolved", {
        clerkUserId: user.clerkUserId,
        userId: user.id,
      });
      redirect("/dashboard");
    }
    const starterWorkspaceData = await prisma.workspace.findUnique({
      where: { id: starterWorkspaceId },
      select: { id: true },
    });
    if (!starterWorkspaceData?.id) {
      console.error("Reports starter workspace lookup failed", {
        clerkUserId: user.clerkUserId,
        userId: user.id,
        starterWorkspaceId,
      });
      redirect("/dashboard");
    }
    selectedWorkspaceId = starterWorkspaceData.id;
  }

  try {
    const now = new Date();
    const { currentStart: currentWindowStart, previousStart: previousWindowStart } = getReportWindow(now, selectedRange);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      currentWindowTransactions,
      previousWindowTransactions,
      sixMonthTransactions,
      importedTransactionStats,
      manualTransactionStats,
      accountStats,
      workspaceAccountSnapshots,
      latestImport,
      processingImportCount,
      doneImportCount,
      failedImportCount,
      deletedImportCount,
    ] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          date: { gte: currentWindowStart },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          importFileId: true,
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
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          date: {
            gte: previousWindowStart,
            lt: currentWindowStart,
          },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          type: true,
          merchantRaw: true,
          merchantClean: true,
          importFileId: true,
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
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: selectedWorkspaceId,
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
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          date: { gte: currentWindowStart },
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
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          importFileId: { not: null },
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: {
          workspaceId: selectedWorkspaceId,
          isExcluded: false,
          importFileId: null,
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.account.aggregate({
        where: {
          workspaceId: selectedWorkspaceId,
        },
        _sum: { balance: true },
        _count: { id: true, balance: true },
      }),
      prisma.account.findMany({
        where: {
          workspaceId: selectedWorkspaceId,
        },
        select: {
          id: true,
          name: true,
          balance: true,
          currency: true,
          type: true,
        },
        orderBy: [{ balance: "desc" }, { updatedAt: "desc" }],
        take: 5,
      }) as Promise<WorkspaceAccountSnapshot[]>,
      prisma.importFile.findFirst({
        where: { workspaceId: selectedWorkspaceId },
        orderBy: { uploadedAt: "desc" },
        select: {
          fileName: true,
          status: true,
          uploadedAt: true,
        },
      }),
      prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "processing" } }),
      prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "done" } }),
      prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "failed" } }),
      prisma.importFile.count({ where: { workspaceId: selectedWorkspaceId, status: "deleted" } }),
    ]);

    const importStatusCounts = {
      processing: Number(processingImportCount ?? 0),
      done: Number(doneImportCount ?? 0),
      failed: Number(failedImportCount ?? 0),
      deleted: Number(deletedImportCount ?? 0),
    };
    const isFreshResetWorkspace =
      user.dataWipedAt !== null && Number(accountStats._count.id ?? 0) <= 1 && Object.values(importStatusCounts).every((count) => count === 0);
    const latestImportSummary = latestImport as unknown as
      | {
          fileName: string;
          status: string;
          uploadedAt: Date;
        }
      | null;
    const isEmptyWorkspace =
      Number(accountStats._count.id ?? 0) <= 1 &&
      currentWindowTransactions.length === 0 &&
      Object.values(importStatusCounts).every((count) => count === 0);

    const currentSummary: WindowSummary = currentWindowTransactions.reduce(
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
      } as WindowSummary
    );

    const previousSummary: WindowSummary = previousWindowTransactions.reduce(
      (accumulator, row) => {
        const amount = Number(row.amount ?? 0);
        if (row.type === "income") {
          accumulator.income += amount;
        } else if (row.type === "expense") {
          accumulator.expense += amount;
        } else {
          accumulator.transfer += amount;
        }

        if (row.type === "expense") {
          const categoryName = row.category?.name ?? "Uncategorized";
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
      } as WindowSummary
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

    const accountStatsSummary = accountStats as unknown as {
      _sum: { balance: number | null };
      _count: { id: number; balance: number };
    };
    const workspaceAccountSummaries = (workspaceAccountSnapshots as unknown as WorkspaceAccountSnapshot[]).map((account) => ({
      id: account.id,
      name: account.name,
      balance: account.balance,
      currency: account.currency,
      type: account.type,
    }));
    const totalAccountBalance = Number(accountStatsSummary._sum.balance ?? 0);
    const activeAccountCount = accountStatsSummary._count.balance;
    const accountCount = accountStatsSummary._count.id;
    const uncategorizedTransactions = currentWindowTransactions.filter(
      (transaction) => !transaction.category?.name || !transaction.merchantClean
    );

    const duplicateGroups = new Map<string, (typeof currentWindowTransactions)[number][]>();
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

    const possibleDuplicateGroups = Array.from(duplicateGroups.values())
      .filter((group) => group.length > 1)
      .sort((a, b) => b.length - a.length)
      .slice(0, 3);

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

    const recurringMerchantHistory = new Map<
      string,
      {
        label: string;
        amount: number;
        dates: Date[];
      }
    >();

    [...previousWindowTransactions, ...currentWindowTransactions].forEach((transaction) => {
      if (transaction.type !== "expense") {
        return;
      }

      const label = transaction.merchantClean ?? transaction.merchantRaw;
      const key = normalizeMerchant(label);
      const existing = recurringMerchantHistory.get(key) ?? { label, amount: 0, dates: [] };
      existing.amount += Math.abs(Number(transaction.amount));
      existing.dates.push(transaction.date);
      recurringMerchantHistory.set(key, existing);
    });

    const recurringMerchants: RecurringMerchant[] = Array.from(recurringMerchantHistory.values())
      .filter((merchant) => merchant.dates.length > 1)
      .map((merchant) => {
        const sortedDates = [...merchant.dates].sort((a, b) => a.getTime() - b.getTime());
        const intervals = sortedDates
          .slice(1)
          .map((date, index) => (date.getTime() - sortedDates[index].getTime()) / 86400000)
          .filter((days) => Number.isFinite(days) && days > 0);
        const averageGapDays = intervals.length > 0 ? intervals.reduce((sum, days) => sum + days, 0) / intervals.length : null;
        const cadenceLabel =
          averageGapDays === null
            ? "Repeat merchant"
            : averageGapDays <= 10
              ? "Weekly"
              : averageGapDays <= 17
                ? "Biweekly"
                : averageGapDays <= 40
                  ? "Monthly"
                  : "Periodic";
        const nextDueDate =
          averageGapDays === null ? null : new Date(sortedDates[sortedDates.length - 1].getTime() + averageGapDays * 86400000);

        return {
          ...merchant,
          count: merchant.dates.length,
          cadenceLabel,
          nextDueDate,
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);

    const topCategories = Array.from(currentSummary.expenseCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const maxCategorySpend = topCategories[0]?.[1] ?? 0;

    const currentNet = currentSummary.income - currentSummary.expense;
    const previousNet = previousSummary.income - previousSummary.expense;
    const currentSpend = currentSummary.expense;
    const previousSpend = previousSummary.expense;
    const savingsRate = currentSummary.income > 0 ? currentNet / currentSummary.income : null;
    const spendDelta = previousSpend > 0 ? ((currentSpend - previousSpend) / previousSpend) * 100 : null;
    const incomeDelta = previousSummary.income > 0 ? ((currentSummary.income - previousSummary.income) / previousSummary.income) * 100 : null;
    const topCategoryShare = currentSpend > 0 ? maxCategorySpend / currentSpend : null;
    const importedTransactionStatsSummary = importedTransactionStats as unknown as {
      _count: { id: number };
      _sum: { amount: number | null };
    };
    const manualTransactionStatsSummary = manualTransactionStats as unknown as {
      _count: { id: number };
      _sum: { amount: number | null };
    };
    const importedTransactions = importedTransactionStatsSummary._count.id;
    const manualTransactions = manualTransactionStatsSummary._count.id;
    const importedAmount = Number(importedTransactionStatsSummary._sum.amount ?? 0);
    const manualAmount = Number(manualTransactionStatsSummary._sum.amount ?? 0);
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

    const topMerchants = Array.from(merchantSpend.values()).sort((a, b) => b.amount - a.amount).slice(0, 5);
    const currentMonthBucket = monthBuckets[monthBuckets.length - 1];
    const previousMonthBucket = monthBuckets[monthBuckets.length - 2] ?? monthBuckets[monthBuckets.length - 1];
    const monthlyNetChange = currentMonthBucket.net - previousMonthBucket.net;
    const reportChartWidth = 560;
    const reportChartHeight = 220;
    const reportChartPadding = 24;
    const reportChartXSpan = reportChartWidth - reportChartPadding * 2;
    const reportChartYSpan = reportChartHeight - reportChartPadding * 2;
    const reportCashFlowValues = monthBuckets.map((bucket) => bucket.net);
    const reportCashFlowMax = Math.max(...reportCashFlowValues);
    const reportCashFlowMin = Math.min(...reportCashFlowValues);
    const reportCashFlowRange = Math.max(reportCashFlowMax - reportCashFlowMin, 1);
    const reportCashFlowPoints = monthBuckets.map((bucket, index) => {
      const x = reportChartPadding + (index / Math.max(monthBuckets.length - 1, 1)) * reportChartXSpan;
      const normalized = (bucket.net - reportCashFlowMin) / reportCashFlowRange;
      const y = reportChartPadding + (1 - normalized) * reportChartYSpan;
      return { ...bucket, x, y };
    });
    const reportCashFlowPath = reportCashFlowPoints
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
      .join(" ");
    const reportCategoryPalette = ["#0ea5c8", "#36b6e0", "#7dd3fc", "#14b8a6", "#f59e0b", "#8b5cf6"];
    const reportCategorySegments = topCategories.map(([categoryName, amount], index) => ({
      categoryName,
      amount,
      share: currentSpend > 0 ? amount / currentSpend : 0,
      color: reportCategoryPalette[index % reportCategoryPalette.length],
    }));
    const currentTrackedCategorySpend = topCategories.reduce((sum, [, amount]) => sum + amount, 0);
    const currentOtherSpend = Math.max(currentSpend - currentTrackedCategorySpend, 0);
    const recurringSavingsPotential = recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0) * 0.2;
    const topRecurringMerchant = recurringMerchants[0] ?? null;
    const averageRecurringSpend = recurringMerchants.length > 0
      ? recurringMerchants.reduce((sum, merchant) => sum + merchant.amount, 0) / recurringMerchants.length
      : 0;
    const topBalanceAccount = workspaceAccountSummaries.find((account) => account.balance !== null) ?? null;
    const topBalanceAccountName = topBalanceAccount?.name ?? null;
    const accountBalanceCoverage = accountCount > 0 ? activeAccountCount / accountCount : 0;
    const topBalanceAccountBalance = topBalanceAccount ? Number(topBalanceAccount.balance ?? 0) : 0;
    const accountConcentrationShare = totalAccountBalance > 0 && topBalanceAccountBalance > 0 ? topBalanceAccountBalance / totalAccountBalance : null;
    const confidenceScore = Math.max(
      58,
      Math.min(
        99,
        60 +
          currentWindowTransactions.length * 0.12 +
          doneImportCount * 1.5 +
          activeAccountCount * 1.5 -
          failedImportCount * 8 -
          actionableCount * 2.5 -
          (1 - accountBalanceCoverage) * 8
      )
    );
    const confidenceLabel =
      confidenceScore >= 85 ? "High confidence" : confidenceScore >= 70 ? "Good confidence" : "Watch closely";
    const confidenceCopy =
      confidenceScore >= 85
        ? "The report has enough clean signal to support confident decisions."
        : confidenceScore >= 70
          ? "The report is dependable, though a few review items still deserve attention."
          : "A few missing balances or review items are reducing signal quality.";
    const attentionItems = [
      {
        title: nextStep.title,
        body: nextStep.body,
        href: nextStep.href,
        label: nextStep.label,
      },
      {
        title: `${Math.round(confidenceScore)}% data confidence`,
        body: confidenceCopy,
        href: "/transactions",
        label: "Open transactions",
      },
      {
        title: topBalanceAccountName
          ? `${topBalanceAccountName} carries ${formatCurrency(topBalanceAccountBalance)}`
          : "No account balance trend yet",
        body:
          topBalanceAccountName && accountConcentrationShare !== null
            ? `${formatPercent(accountConcentrationShare * 100)} of tracked balance sits in the strongest account`
            : "Add or refresh account balances to surface concentration and coverage.",
        href: topBalanceAccountName ? buildTransactionsHref({ account: topBalanceAccountName }) : "/accounts",
        label: topBalanceAccountName ? "View account" : "Open accounts",
      },
    ];
    const reportReviewQueueItems: ReportsQueueItem[] = [];
    const primaryUncategorizedTransaction = uncategorizedTransactions[0];
    const primaryDuplicateGroup = possibleDuplicateGroups[0];
    const topCategoryOptions = topCategories.map(([categoryName]) => categoryName);
    if (primaryUncategorizedTransaction) {
      reportReviewQueueItems.push({
        title: `${primaryUncategorizedTransaction.merchantClean ?? primaryUncategorizedTransaction.merchantRaw} needs a category`,
        description: `${primaryUncategorizedTransaction.account.name} · ${formatShortDate(primaryUncategorizedTransaction.date)} · ${formatCurrency(Number(primaryUncategorizedTransaction.amount))}`,
        tags: [
          "No category",
          primaryUncategorizedTransaction.importFileId ? "Imported transaction" : "Manual entry",
          formatCurrency(Number(primaryUncategorizedTransaction.amount)),
        ],
        categoryOptions: topCategoryOptions.length > 0 ? topCategoryOptions : ["Food & Dining", "Transport", "Groceries", "Utilities", "Subscriptions", "Entertainment"],
        actions: [
          { label: "Review transaction", href: buildTransactionsHref({ review: primaryUncategorizedTransaction.id }) },
          { label: "Open transactions", href: "/transactions", variant: "secondary" },
        ],
      });
    }
    if (primaryDuplicateGroup) {
      const representative = primaryDuplicateGroup[0];
      const duplicateTotal = primaryDuplicateGroup.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
      reportReviewQueueItems.push({
        title: `${representative.merchantClean ?? representative.merchantRaw} appears more than once`,
        description: `${primaryDuplicateGroup.length} matching rows · ${representative.account.name} · ${formatShortDate(representative.date)}`,
        tags: ["Potential duplicate", `${primaryDuplicateGroup.length} matches`, formatCurrency(duplicateTotal)],
        actions: [
          { label: "Review duplicates", href: buildTransactionsHref({ review: representative.id }) },
          { label: "Open transactions", href: "/transactions", variant: "secondary" },
        ],
      });
    }
    if (importStatusCounts.failed > 0 || importStatusCounts.processing > 0) {
      reportReviewQueueItems.push({
        title:
          importStatusCounts.failed > 0
            ? `${importStatusCounts.failed} import${importStatusCounts.failed === 1 ? "" : "s"} failed`
            : `${importStatusCounts.processing} import${importStatusCounts.processing === 1 ? "" : "s"} still processing`,
        description:
          importStatusCounts.failed > 0
            ? "Open the import pipeline to resolve the file that did not finish cleanly."
            : "Wait for the pipeline to finish so the newest rows can roll into the reports.",
        tags: [
          importStatusCounts.failed > 0 ? "Failed import" : "Processing import",
          `${importStatusCounts.done} done`,
          `${importStatusCounts.processing} processing`,
        ],
        actions: [
          { label: "Open imports", href: "/imports" },
          { label: "Open transactions", href: "/transactions", variant: "secondary" },
        ],
      });
    }

    const trendDirection = currentNet >= previousNet ? "improving" : "softening";
    const spendDirection = spendDelta === null ? null : spendDelta > 0 ? "up" : spendDelta < 0 ? "down" : "flat";

    const goalSummary = goalLabel
      ? currentNet >= 0
        ? `Your ${goalLabel.toLowerCase()} goal has room to move forward because the last ${rangeWindowText} ended positive.`
        : `Your ${goalLabel.toLowerCase()} goal needs a tighter spending pattern or higher income to move faster.`
      : "Set a primary goal so Clover can compare your cash flow and spending against something specific.";
    const comparisonCopy =
      selectedRange === "ytd"
        ? "Compared with the same span earlier in the year"
        : `Compared with the previous ${rangeWindowText}`;

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
            : `${currentNet >= previousNet ? "Ahead of" : "Behind"} the prior ${rangeWindowText}`,
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
        href: "/goals",
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
          href: "/goals",
          label: "Open goals",
        }
      : {
          title: "Choose a goal to sharpen the insights",
          body: "A goal gives the page a destination, so every trend can be evaluated against progress instead of noise.",
          href: "/goals",
          label: "Set a goal",
        };

    return (
      <CloverShell
        active={active}
        kicker="Reports"
        title="A clearer report on where your money stands."
        subtitle="Cash flow, spending concentration, recurring costs, and review items are pulled directly from your uploaded transactions and accounts."
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
        <PostHogEvent
          event="report_viewed"
          onceKey={analyticsOnceKey("report_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            report_type: selectedRange,
            workspace_id: selectedWorkspaceId,
            transaction_count: currentWindowTransactions.length,
            import_count:
              Number(doneImportCount ?? 0) +
              Number(processingImportCount ?? 0) +
              Number(failedImportCount ?? 0) +
              Number(deletedImportCount ?? 0),
          }}
        />
        <PostHogEvent
          event="first_report_viewed"
          onceKey={analyticsOnceKey("first_report_viewed", "session")}
          properties={{
            report_type: selectedRange,
            workspace_id: selectedWorkspaceId,
          }}
        />
        <PostHogEvent
          event="report_filtered"
          onceKey={analyticsOnceKey("report_filtered", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            report_type: selectedRange,
            workspace_id: selectedWorkspaceId,
            view: "reports",
            filter_type: "range",
          }}
        />
        <PostHogEvent
          event="insight_generated"
          onceKey={analyticsOnceKey("insight_generated", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            goal: goalLabel ?? null,
            current_net: currentNet,
            savings_rate: savingsRate === null ? null : Math.round(savingsRate * 100),
          }}
        />
        <PostHogEvent
          event="insight_opened"
          onceKey={analyticsOnceKey("insight_opened", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            insight_type: "reports_overview",
          }}
        />
        <PostHogEvent
          event="cashflow_viewed"
          onceKey={analyticsOnceKey("cashflow_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            chart_type: "line",
          }}
        />
        <PostHogEvent
          event="category_mix_viewed"
          onceKey={analyticsOnceKey("category_mix_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            chart_type: "donut",
          }}
        />
        <PostHogEvent
          event="top_sources_viewed"
          onceKey={analyticsOnceKey("top_sources_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            chart_type: "list",
          }}
        />
        <PostHogEvent
          event="trend_line_viewed"
          onceKey={analyticsOnceKey("trend_line_viewed", `workspace:${selectedWorkspaceId}:${selectedRange}`)}
          properties={{
            workspace_id: selectedWorkspaceId,
            report_type: selectedRange,
            chart_type: "timeline",
          }}
        />
        {isEmptyWorkspace ? (
          <div style={{ marginBottom: 20 }}>
          <EmptyDataCta
            eyebrow={isFreshResetWorkspace ? "Fresh start" : "No data yet"}
            title="Your reports are ready for a new import."
            copy="Import a statement first, and Clover will populate cash flow, spending, review items, and goal-aware summaries for you."
            importHref="/dashboard?import=1"
            accountHref="/accounts"
            transactionHref="/transactions?manual=1"
          />
          </div>
        ) : null}
        <section className="reports-hero">
          <div className="reports-hero__copy glass">
            <span className="pill pill-accent">Decision-ready reports</span>
            <h3>A clearer view of your money, with the numbers that matter most.</h3>
            <p>
              Every report is grounded in the transactions you uploaded, then sharpened with comparisons, labels, and
              actions that point to the next useful step.
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
              <span>{accountCount} account{accountCount === 1 ? "" : "s"}</span>
            </div>
          </article>
        </section>

        <section className="reports-attention-strip">
          {attentionItems.map((item) => (
            <article key={item.title} className="reports-attention-card glass">
              <span className="eyebrow">Attention</span>
              <h4>{item.title}</h4>
              <p>{item.body}</p>
              <Link className="pill-link pill-link--inline" href={item.href}>
                {item.label}
              </Link>
            </article>
          ))}
        </section>

        <section className="reports-range-switch glass">
          <div className="reports-range-switch__copy">
            <span className="eyebrow">Range</span>
            <p>{selectedRangeLabel}</p>
            <small>
              {comparisonCopy} · {latestImportSummary ? `Fresh data from ${latestImportSummary.fileName}` : "No imports available yet"}
            </small>
          </div>
          <div className="reports-range-switch__controls" role="tablist" aria-label="Report range">
            {(["30d", "90d", "ytd"] as const).map((range) => (
              <Link key={range} className={`pill pill-interactive ${selectedRange === range ? "pill-is-selected" : ""}`} href={`?range=${range}`}>
                {reportsRangeLabels[range]}
              </Link>
            ))}
          </div>
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
              {currentNet >= 0 ? "Positive" : "Negative"} over the last {rangeWindowText} ·{" "}
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
                <span>Current period</span>
                <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
                <small>
                  {incomeDelta === null ? "No previous baseline" : `${formatPercent(incomeDelta)} vs the prior ${rangeWindowText}`}
                </small>
              </div>
              <div className="report-insight">
                <span>Previous period</span>
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
                    <span>{spendDelta === null ? "No prior comparison period" : `${formatPercent(spendDelta)} vs the previous ${rangeWindowText}`}</span>
                  </div>
                </div>
                <div className="report-list__item">
                  <div className="report-list__meta">
                    <strong>Income</strong>
                    <span>{incomeDelta === null ? "No prior comparison period" : `${formatPercent(incomeDelta)} vs the previous ${rangeWindowText}`}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="report-chart">
              <svg viewBox={`0 0 ${reportChartWidth} ${reportChartHeight}`} className="report-chart__svg" role="img" aria-label="Cash flow line chart">
                <defs>
                  <linearGradient id="report-cash-flow-gradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgba(14,165,233,0.26)" />
                    <stop offset="100%" stopColor="rgba(14,165,233,0.03)" />
                  </linearGradient>
                </defs>
                <path
                  d={`${reportCashFlowPath} L ${reportCashFlowPoints[reportCashFlowPoints.length - 1].x.toFixed(1)} ${reportChartHeight - reportChartPadding} L ${reportCashFlowPoints[0].x.toFixed(1)} ${reportChartHeight - reportChartPadding} Z`}
                  fill="url(#report-cash-flow-gradient)"
                />
                <path d={reportCashFlowPath} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                {reportCashFlowPoints.map((point) => (
                  <circle key={point.key} cx={point.x} cy={point.y} r="5.5" fill="white" stroke="var(--accent)" strokeWidth="3" />
                ))}
              </svg>

              <div className="report-chart__labels">
                {reportCashFlowPoints.map((point) => (
                  <Link key={point.key} href={buildTransactionsHref({ month: point.key })} className="report-chart__label report-list__item--link">
                    <span>{point.label}</span>
                    <strong>{formatCurrency(point.net)}</strong>
                  </Link>
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
                <strong>{formatCurrency(currentSpend)}</strong>
                <span>
                  {topCategories.length > 0 ? `${topCategories.length} leading categories · ${formatPercent(topCategoryShare ? topCategoryShare * 100 : 0)} top share` : "No spending yet"}
                </span>
              </div>
            </div>

            <div className="report-donut">
              <div className="report-donut__chart" role="img" aria-label="Spending breakdown donut chart">
                <svg viewBox="0 0 240 240">
                  <circle cx="120" cy="120" r="82" className="report-donut__track" />
                  {reportCategorySegments.length > 0
                    ? (() => {
                        const circumference = 2 * Math.PI * 82;
                        let offset = 0;
                        return reportCategorySegments.map((segment) => {
                          const dashLength = segment.share * circumference;
                          const circle = (
                            <circle
                              key={segment.categoryName}
                              cx="120"
                              cy="120"
                              r="82"
                              className="report-donut__segment"
                              style={{
                                stroke: segment.color,
                                strokeDasharray: `${dashLength} ${circumference}`,
                                strokeDashoffset: -offset,
                              }}
                            />
                          );
                          offset += dashLength;
                          return circle;
                        });
                      })()
                    : null}
                </svg>
                <div className="report-donut__center">
                  <strong>{formatCurrency(currentSpend)}</strong>
                  <span>spent</span>
                </div>
              </div>

              <div className="report-donut__legend">
                {reportCategorySegments.length > 0 ? (
                  reportCategorySegments.map((segment) => {
                    const previousAmount = previousSummary.expenseCategories.get(segment.categoryName) ?? 0;
                    const delta = segment.amount - previousAmount;
                    return (
                      <Link
                        key={segment.categoryName}
                        href={buildTransactionsHref({ category: segment.categoryName })}
                        className="report-donut__legend-item report-list__item--link"
                      >
                        <span className="report-donut__swatch" style={{ background: segment.color }} />
                        <div className="report-donut__meta">
                          <strong>{segment.categoryName}</strong>
                          <span>
                            {formatCurrency(segment.amount)} · {formatPercent(segment.share * 100)}
                          </span>
                          <small className={delta >= 0 ? "negative" : "positive"}>
                            {delta === 0 ? "Flat vs prior period" : `${delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))} vs prior period`}
                          </small>
                        </div>
                      </Link>
                    );
                  })
                ) : (
                  <div className="empty-state">No categorized expenses yet. Add transactions to surface the main spending groups.</div>
                )}
                {currentOtherSpend > 0 ? (
                  <div className="report-donut__legend-item">
                    <span className="report-donut__swatch" style={{ background: "var(--border-subtle)" }} />
                    <div className="report-donut__meta">
                      <strong>Other spend</strong>
                      <span>{formatCurrency(currentOtherSpend)}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

          </article>
        </section>

        <section className="reports-grid reports-grid--free">
          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Recurring payments</h4>
              </div>
              <div className="report-card__stat">
                <strong>{recurringMerchants.length}</strong>
                <span>
                  fixed costs surfaced · {formatCurrency(recurringSavingsPotential)} monthly savings potential
                </span>
              </div>
            </div>

            <div className="report-list">
              {recurringMerchants.length > 0 ? (
                recurringMerchants.map((merchant) => (
                  <Link
                    key={merchant.label}
                    href={buildTransactionsHref({ merchant: merchant.label })}
                    className="report-list__item report-list__item--link"
                  >
                    <div className="report-list__meta">
                      <strong>{merchant.label}</strong>
                      <span>
                        {merchant.count} transaction{merchant.count === 1 ? "" : "s"} · {formatCurrency(merchant.amount)}
                      </span>
                      <small>
                        {merchant.cadenceLabel}
                        {merchant.nextDueDate ? ` · next due ${formatShortDate(merchant.nextDueDate)}` : ""}
                      </small>
                    </div>
                    <div className="report-tags">
                      <span className="pill pill-subtle">{merchant.cadenceLabel}</span>
                      <span className="pill pill-subtle">{formatPercent((merchant.amount / Math.max(currentSpend, 1)) * 100)} of spend</span>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="empty-state">No repeat merchants surfaced yet. Add more transactions to reveal fixed costs.</div>
              )}
            </div>
            <div className="report-subsection report-subsection--compact">
              <p className="eyebrow">Recurring signal</p>
              <div className="report-list">
                <div className="report-list__item">
                  <div className="report-list__meta">
                    <strong>{topRecurringMerchant?.label ?? "No recurring merchant"}</strong>
                    <span>
                      {topRecurringMerchant ? `Average of ${formatCurrency(averageRecurringSpend)} across repeat costs` : "More activity will reveal recurring merchants"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Top merchants</h4>
              </div>
              <div className="report-card__stat">
                <strong>{topMerchants.length}</strong>
                <span>
                  where spending concentrates · {topMerchants[0] ? formatPercent((topMerchants[0].amount / Math.max(currentSpend, 1)) * 100) : "0%"} top share
                </span>
              </div>
            </div>

            <div className="report-list">
              {topMerchants.length > 0 ? (
                topMerchants.map((merchant) => (
                  <Link
                    key={merchant.label}
                    href={buildTransactionsHref({ merchant: merchant.label })}
                    className="report-list__item report-list__item--link"
                  >
                    <div className="report-list__meta">
                    <strong>{merchant.label}</strong>
                    <span>
                      {merchant.count} transaction{merchant.count === 1 ? "" : "s"} · {formatCurrency(merchant.amount)}
                    </span>
                  </div>
                    <div className="report-list__track" aria-hidden="true">
                      <span className="report-list__fill" style={{ width: `${Math.max((merchant.amount / currentSpend) * 100, 10)}%` }} />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="empty-state">No merchants surfaced yet. More transactions will reveal the concentration points.</div>
              )}
            </div>
          </article>

          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <h4>Monthly summary</h4>
              </div>
              <div className="report-card__stat">
                <strong className={currentMonthBucket.net >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentMonthBucket.net)}</strong>
                <span>
                  {currentMonthBucket.label} · {monthlyNetChange >= 0 ? "up" : "down"} vs last month
                </span>
              </div>
            </div>

            <div className="report-insight-grid">
              <div className="report-insight">
                <span>Gross inflow</span>
                <strong>{formatCurrency(currentMonthBucket.income)}</strong>
                <small>{currentMonthBucket.label}</small>
              </div>
              <div className="report-insight">
                <span>Gross outflow</span>
                <strong>{formatCurrency(currentMonthBucket.expense)}</strong>
                <small>All tracked expenses</small>
              </div>
              <div className="report-insight">
                <span>Net position</span>
                <strong className={currentMonthBucket.net >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentMonthBucket.net)}</strong>
                <small>Income minus spending</small>
              </div>
              <div className="report-insight">
                <span>Month-over-month delta</span>
                <strong className={monthlyNetChange >= 0 ? "positive" : "negative"}>{formatSignedCurrency(monthlyNetChange)}</strong>
                <small>{previousMonthBucket.label} · {monthlyNetChange >= 0 ? "improving" : "softening"}</small>
              </div>
            </div>
            <div className="report-subsection report-subsection--compact">
              <Link className="pill-link pill-link--inline" href={buildTransactionsHref({ month: currentMonthBucket.key })}>
                Open {currentMonthBucket.label}
              </Link>
            </div>
          </article>
        </section>

        <section className="reports-grid reports-grid--secondary">
          <article className="report-card glass report-card--balanced">
            <ReportsReviewQueue items={reportReviewQueueItems} />
          </article>

          <article className="report-card glass report-card--balanced">
            <div className="report-card__head">
              <div>
                <h4>Data health</h4>
              </div>
              <div className="report-card__stat">
                <strong>{Math.round(confidenceScore)}%</strong>
                <span>{confidenceLabel} · {activeAccountCount} account{activeAccountCount === 1 ? "" : "s"} with balances</span>
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
              <div className="report-insight">
                <span>Tracked balance</span>
                <strong>{formatCurrency(totalAccountBalance)}</strong>
                <small>{accountConcentrationShare === null ? "Balance coverage pending" : `${formatPercent(accountConcentrationShare * 100)} in the largest account`}</small>
              </div>
              <div className="report-insight">
                <span>Import quality</span>
                <strong>{importStatusCounts.failed + importStatusCounts.processing}</strong>
                <small>{confidenceCopy}</small>
              </div>
            </div>

            <div className="report-subsection">
              <p className="eyebrow">Decision lens</p>
              <div className="report-list">
                <div className="report-list__item">
                  <div className="report-list__meta">
                    <strong>{goalLabel ?? "No goal set yet"}</strong>
                    <span>{goalSummary}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="report-subsection">
              <p className="eyebrow">Account health</p>
              <div className="report-list">
                {workspaceAccountSummaries.length > 0 ? (
                  workspaceAccountSummaries.map((account) => (
                    <div key={account.id} className="report-list__item">
                      <div className="report-list__meta">
                        <strong>{account.name}</strong>
                        <span>
                          {account.balance === null ? "No balance recorded" : `${formatCurrency(Number(account.balance))} · ${account.type}`}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No account balances available yet.</div>
                )}
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
              {latestImportSummary ? (
                <div className="report-list">
                  <div className="report-list__item">
                    <div className="report-list__meta">
                      <strong>{latestImportSummary.fileName}</strong>
                      <span>
                        {formatShortDate(new Date(latestImportSummary.uploadedAt))} · {latestImportSummary.status}
                      </span>
                    </div>
                    <div className="report-tags">
                      <span className={`pill pill-${latestImportSummary.status === "done" ? "good" : latestImportSummary.status === "failed" ? "danger" : "subtle"}`}>
                        {latestImportSummary.status}
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorDigest =
      error && typeof error === "object" && "digest" in error && typeof (error as { digest?: unknown }).digest === "string"
        ? (error as { digest: string }).digest
        : "";

    return (
      <CloverShell
        active={active}
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
          <details className="report-error-details">
            <summary>Technical details</summary>
            <pre>
              {errorMessage}
              {errorDigest ? `\nDigest: ${errorDigest}` : ""}
            </pre>
          </details>
        </section>
      </CloverShell>
    );
  }
}

export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ range?: string }> }) {
  return <ReportsPageView active="reports" searchParams={searchParams ? await searchParams : undefined} />;
}

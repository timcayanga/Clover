import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { syncClerkUser } from "@/lib/clerk";
import { ensureStarterWorkspace, seedWorkspaceDefaults } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";

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

const toIsoMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const toMonthLabel = (date: Date) => monthFormatter.format(date);

const formatShortDate = (value: Date) => shortDateFormatter.format(value);

const normalizeMerchant = (value: string) => value.trim().toLowerCase();

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
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const clerkUser = await syncClerkUser(userId);
  const user = await prisma.user.upsert({
    where: { clerkUserId: clerkUser.clerkUserId },
    update: {
      email: clerkUser.email,
      verified: clerkUser.verified,
    },
    create: clerkUser,
  });

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
    const importedTransactions = importedTransactionStats._count.id;
    const manualTransactions = manualTransactionStats._count.id;
    const importedAmount = Number(importedTransactionStats._sum.amount ?? 0);
    const manualAmount = Number(manualTransactionStats._sum.amount ?? 0);

    return (
      <CloverShell
        active="reports"
        kicker="Reports"
        title="See the state of your finances at a glance."
        subtitle="These reports are generated from imported files, parsed transactions, and manual entries so you can review what matters without extra interpretation."
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
            <span className="pill pill-accent">Auto-generated reports</span>
            <h3>A compact view that shows what changed, what needs attention, and what to do next.</h3>
            <p>
              The reports focus on the minimum useful set: cash flow, category spend, review work, and import
              health. That keeps the page readable while still giving you the full picture.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href={nextStep.href}>
                {nextStep.label}
              </Link>
              <Link className="button button-secondary" href="/transactions">
                Open transactions
              </Link>
              <Link className="button button-secondary" href="/imports">
                Review imports
              </Link>
            </div>
          </div>

          <article className="reports-next glass">
            <p className="eyebrow">Next step</p>
            <h4>{nextStep.title}</h4>
            <p>{nextStep.body}</p>
            <Link className="button button-primary button-pill" href={nextStep.href}>
              {nextStep.label}
            </Link>
            <div className="reports-next__meta">
              <span>
                {actionableCount} actionable item{actionableCount === 1 ? "" : "s"}
              </span>
              <span>{selectedWorkspace.accounts.length} account{selectedWorkspace.accounts.length === 1 ? "" : "s"}</span>
            </div>
          </article>
        </section>

        <section className="reports-summary-grid">
          <article className="metric compact glass">
            <span>Net cash flow</span>
            <strong className={currentNet >= 0 ? "positive" : "negative"}>{formatSignedCurrency(currentNet)}</strong>
            <small>
              {currentNet >= 0 ? "Positive" : "Negative"} over the last 30 days ·{" "}
              {previousNet === 0 ? "No prior baseline" : `${currentNet >= previousNet ? "up" : "down"} from the previous 30 days`}
            </small>
          </article>
          <article className="metric compact glass">
            <span>Spending</span>
            <strong>{formatCurrency(currentSpend)}</strong>
            <small>
              {previousSpend > 0
                ? `${currentSpend >= previousSpend ? "Above" : "Below"} the previous 30 days by ${formatCurrency(
                    Math.abs(currentSpend - previousSpend)
                  )}`
                : "Current 30-day spend"}
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
          <article className="metric compact glass">
            <span>Import health</span>
            <strong>
              {importStatusCounts.failed > 0
                ? `${importStatusCounts.failed} failed`
                : importStatusCounts.processing > 0
                  ? `${importStatusCounts.processing} processing`
                  : `${importStatusCounts.done} done`}
            </strong>
            <small>
              {importStatusCounts.done} done · {importStatusCounts.processing} processing · {importStatusCounts.failed} failed
            </small>
          </article>
        </section>

        <section className="reports-grid reports-grid--primary">
          <article className="report-card glass report-card--wide">
            <div className="report-card__head">
              <div>
                <p className="eyebrow">Cash flow</p>
                <h4>Money in and money out over time</h4>
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
                  {currentSummary.income >= previousSummary.income ? "Income is holding up" : "Income softened a bit"}.
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
                <p className="eyebrow">Spending by category</p>
                <h4>Where the money actually went</h4>
              </div>
              <div className="report-card__stat">
                <strong>{formatCurrency(currentSpend)}</strong>
                <span>
                  {topCategories.length > 0
                    ? `${topCategories.length} leading ${topCategories.length === 1 ? "category" : "categories"}`
                    : "No spending yet"}
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
          </article>
        </section>

        <section className="reports-grid reports-grid--secondary">
          <article className="report-card glass">
            <div className="report-card__head">
              <div>
                <p className="eyebrow">Review queue</p>
                <h4>What needs a quick clean-up pass</h4>
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
                <p className="eyebrow">Data health</p>
                <h4>Imports, manual entries, and balance coverage</h4>
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
        kicker="Reports"
        title="See the state of your finances at a glance."
        subtitle="The reports page could not load right now, but your workspace and transactions are still available."
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

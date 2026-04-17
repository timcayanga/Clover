import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
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

export default async function DashboardPage() {
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
        take: 5,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const selectedWorkspace = workspaces[0] ?? starterWorkspace;
  const [recentTransactions, totalTransactions, totalAccounts, totalImports] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        workspaceId: selectedWorkspace.id,
        isExcluded: false,
      },
      include: {
        category: true,
        account: true,
      },
      orderBy: { date: "desc" },
      take: 12,
    }),
    prisma.transaction.count({
      where: { workspaceId: selectedWorkspace.id },
    }),
    prisma.account.count({
      where: { workspaceId: selectedWorkspace.id },
    }),
    prisma.importFile.count({
      where: { workspaceId: selectedWorkspace.id },
    }),
  ]);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentWindowTransactions = await prisma.transaction.findMany({
    where: {
      workspaceId: selectedWorkspace.id,
      date: { gte: thirtyDaysAgo },
      isExcluded: false,
    },
    include: { category: true },
    orderBy: { date: "desc" },
    take: 100,
  });

  const summary = recentWindowTransactions.reduce(
    (accumulator, transaction) => {
      const amount = Number(transaction.amount);
      if (transaction.type === "income") {
        accumulator.income += amount;
      } else if (transaction.type === "expense") {
        accumulator.expense += amount;
      } else {
        accumulator.transfer += amount;
      }

      const key = transaction.category?.name ?? "Unassigned";
      accumulator.categories.set(key, (accumulator.categories.get(key) ?? 0) + Math.abs(amount));
      return accumulator;
    },
    {
      income: 0,
      expense: 0,
      transfer: 0,
      categories: new Map<string, number>(),
    }
  );

  const topCategories = Array.from(summary.categories.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const latestImport = workspaces
    .flatMap((workspace) => workspace.importFiles.map((file) => ({ ...file, workspaceName: workspace.name })))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())[0];

  const pendingImports = workspaces.reduce(
    (count, workspace) =>
      count + workspace.importFiles.filter((file) => file.status === "processing").length,
    0
  );

  return (
    <CloverShell
      active="overview"
      kicker="Workspace direction"
      title={`A calm, glass-like workspace for ${selectedWorkspace.name}.`}
      subtitle="Showing live data from the seeded workspace, imported transactions, and queued uploads."
      showTopbar={false}
      actions={
        <>
          <Link className="pill-link" href="/imports">
            Imports
          </Link>
          <Link className="pill-link" href="/transactions">
            Transactions
          </Link>
        </>
      }
    >
      <section className="hero">
        <div className="hero-copy">
          <span className="pill pill-accent">Live workspace overview</span>
          <h3>A calm, glass-like workspace for transactions, source tracking, and insight.</h3>
          <p>
            Transactions, analytics, and source-aware imports stay in one place so you can review,
            learn, and decide faster.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/transactions">
              Add transaction
            </Link>
            <Link className="button button-secondary" href="/dashboard#analytics">
              See analytics
            </Link>
          </div>
        </div>

        <div className="hero-metrics">
          <article className="metric">
            <span>Income</span>
            <strong>{currencyFormatter.format(summary.income)}</strong>
            <small>{pendingImports} item{pendingImports === 1 ? "" : "s"} need review</small>
          </article>
          <article className="metric">
            <span>Expenses</span>
            <strong>{currencyFormatter.format(Math.abs(summary.expense))}</strong>
            <small>Tracked by category and source</small>
          </article>
          <article className="metric">
            <span>Financial</span>
            <strong>{currencyFormatter.format(summary.income - Math.abs(summary.expense))}</strong>
            <small>{totalAccounts} account{totalAccounts === 1 ? "" : "s"} connected</small>
          </article>
        </div>
      </section>

      <section className="feature-grid" id="analytics">
        <article className="feature-card glass">
          <p className="eyebrow">Transactions</p>
          <h3>Review, edit, and clean up every transaction.</h3>
          <p>{recentTransactions.length} recent rows are available in the current workspace view.</p>
        </article>
        <article className="feature-card glass">
          <p className="eyebrow">Analytics</p>
          <h3>See spending, saving, and source patterns at a glance.</h3>
          <p>Trends, category mix, source mix, and recurring behavior are all reflected on the dashboard.</p>
        </article>
        <article className="feature-card glass">
          <p className="eyebrow">Insights</p>
          <h3>Get practical tips from your own behavior.</h3>
          <p>
            Your top category is {topCategories[0]?.[0] ?? "still forming"}, and the current workspace is
            ready for richer review workflows.
          </p>
        </article>
        <article className="feature-card glass">
          <p className="eyebrow">Imports</p>
          <h3>Bring in bank statements and receipts in batches.</h3>
          <p>{totalImports} import file{totalImports === 1 ? "" : "s"} have been processed so far.</p>
        </article>
      </section>

      <section className="overview-insight-grid" id="insights">
        <article className="glass insight-card overview-panel overview-panel--large">
          <p className="eyebrow">Insights</p>
          <h4>What stands out right now</h4>
          <div className="overview-panel__list overview-panel__list--wide">
            <div className="overview-panel__item">
              <strong>Workspace</strong>
              <span>{selectedWorkspace.name}</span>
            </div>
            <div className="overview-panel__item">
              <strong>Import health</strong>
              <span>
                {pendingImports > 0 ? `${pendingImports} queued or processing import(s)` : "No imports in progress"}
              </span>
            </div>
            <div className="overview-panel__item">
              <strong>Top category</strong>
              <span>{topCategories[0] ? `${topCategories[0][0]} at ${currencyFormatter.format(topCategories[0][1])}` : "No imported spend yet"}</span>
            </div>
          </div>
        </article>
        <article className="glass insight-card overview-panel">
          <p className="eyebrow">Tips</p>
          <h4>Small moves that could help</h4>
          <div className="overview-panel__list">
            <div className="overview-panel__item">
              <strong>Keep imports tidy</strong>
              <span>Source tags and category edits keep the dashboard readable.</span>
            </div>
            <div className="overview-panel__item">
              <strong>Watch category drift</strong>
              <span>A small change in dining or transport can shift the overall picture quickly.</span>
            </div>
          </div>
        </article>
      </section>

      <section className="overview-activity-grid">
        <article className="glass insight-card overview-panel overview-panel--full">
          <div className="overview-panel__head">
            <div>
              <p className="eyebrow">Activity</p>
              <h4>Recent imports and transactions</h4>
            </div>
          </div>
          <div className="overview-activity-list">
            {latestImport ? (
              <div className="overview-panel__item">
                <strong>{latestImport.fileName}</strong>
                <span>
                  {latestImport.workspaceName} · <span className={`status status--${latestImport.status}`}>{latestImport.status}</span>
                </span>
              </div>
            ) : null}
            {recentTransactions.slice(0, 4).map((transaction) => (
              <div key={transaction.id} className="overview-panel__item">
                <strong>{transaction.merchantClean || transaction.merchantRaw}</strong>
                <span>
                  {transaction.account.name}
                  {transaction.category?.name ? ` · ${transaction.category.name}` : ""} ·{" "}
                  {currencyFormatter.format(Number(transaction.amount))}
                </span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </CloverShell>
  );
}

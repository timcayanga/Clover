import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { syncClerkUser } from "@/lib/clerk";
import { ensureStarterWorkspace, seedWorkspaceDefaults } from "@/lib/starter-data";

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
    <main className="page dashboard">
      <header className="nav">
        <div className="brand">
          <div className="brand-mark">CL</div>
          <div>
            <div>Dashboard</div>
            <small className="panel-muted">Workspace overview for {selectedWorkspace.name}</small>
          </div>
        </div>
        <div className="actions">
          <Link className="pill-link" href="/imports">
            Imports
          </Link>
          <Link className="pill-link" href="/transactions">
            Transactions
          </Link>
        </div>
      </header>

      <section className="dashboard-shell">
        <div className="dashboard-grid">
          <article className="panel wide">
            <div className="panel-header">
              <div>
                <h2>Calm, current money view</h2>
                <p className="panel-muted">
                  Showing live data from your seeded workspace and imported transactions.
                </p>
              </div>
              <span className="status status--done">Live</span>
            </div>
          </article>

          <article className="panel third">
            <h3>Workspaces</h3>
            <strong className="panel-value">{workspaces.length}</strong>
            <p className="panel-muted">Personal and future shared workspaces are supported.</p>
          </article>

          <article className="panel third">
            <h3>Transactions</h3>
            <strong className="panel-value">{totalTransactions}</strong>
            <p className="panel-muted">{recentTransactions.length} recent rows in the current view.</p>
          </article>

          <article className="panel third">
            <h3>Pending imports</h3>
            <strong className="panel-value">{pendingImports}</strong>
            <p className="panel-muted">Queued uploads show their live worker status here.</p>
          </article>

          <article className="panel half">
            <h3>Last 30 days</h3>
            <div className="metric-grid" style={{ marginTop: 16 }}>
              <div className="metric compact">
                <span>Income</span>
                <strong>{currencyFormatter.format(summary.income)}</strong>
              </div>
              <div className="metric compact">
                <span>Expenses</span>
                <strong>{currencyFormatter.format(Math.abs(summary.expense))}</strong>
              </div>
              <div className="metric compact">
                <span>Transfers</span>
                <strong>{currencyFormatter.format(Math.abs(summary.transfer))}</strong>
              </div>
            </div>
          </article>

          <article className="panel half">
            <h3>Top categories</h3>
            <div className="list-stack" style={{ marginTop: 16 }}>
              {topCategories.length > 0 ? (
                topCategories.map(([name, value]) => (
                  <div key={name} className="list-row">
                    <div>
                      <strong>{name}</strong>
                      <div className="panel-muted">Most active category</div>
                    </div>
                    <span>{currencyFormatter.format(value)}</span>
                  </div>
                ))
              ) : (
                <p className="panel-muted">No imported spend yet.</p>
              )}
            </div>
          </article>

          <article className="panel wide">
            <div className="panel-header">
              <h3>Recent imports</h3>
              <Link className="pill-link" href="/imports">
                Open import flow
              </Link>
            </div>
            <div className="list-stack" style={{ marginTop: 16 }}>
              {latestImport ? (
                <div className="list-row">
                  <div>
                    <strong>{latestImport.fileName}</strong>
                    <div className="panel-muted">{latestImport.workspaceName}</div>
                  </div>
                  <span className={`status status--${latestImport.status}`}> {latestImport.status}</span>
                </div>
              ) : (
                <p className="panel-muted">No imports yet.</p>
              )}
              <div className="panel-muted">Import files processed: {totalImports}</div>
            </div>
          </article>

          <article className="panel wide">
            <div className="panel-header">
              <h3>Recent transactions</h3>
              <Link className="pill-link" href="/transactions">
                Review all
              </Link>
            </div>
            <div className="list-stack" style={{ marginTop: 16 }}>
              {recentTransactions.map((transaction) => (
                <div key={transaction.id} className="list-row">
                  <div>
                    <strong>{transaction.merchantClean || transaction.merchantRaw}</strong>
                    <div className="panel-muted">
                      {transaction.account.name}
                      {transaction.category?.name ? ` · ${transaction.category.name}` : ""}
                    </div>
                  </div>
                  <span>{currencyFormatter.format(Number(transaction.amount))}</span>
                </div>
              ))}
              {recentTransactions.length === 0 ? <p className="panel-muted">No transactions yet.</p> : null}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

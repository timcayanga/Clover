import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace, seedWorkspaceDefaults } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Review",
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const formatCurrency = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(String(value ?? 0));
  return currencyFormatter.format(Number.isFinite(numeric) ? numeric : 0);
};

const formatDate = (value: Date) =>
  value.toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

export default async function ReviewPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const starterWorkspace = await ensureStarterWorkspace(user.clerkUserId, user.email, user.verified);
  await seedWorkspaceDefaults(starterWorkspace.id);

  const workspaces = await prisma.workspace.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const selectedWorkspace = workspaces[0] ?? starterWorkspace;

  const reviewTransactions = await prisma.transaction.findMany({
    where: {
      workspaceId: selectedWorkspace.id,
      OR: [
        { reviewStatus: { not: "confirmed" } },
        { categoryId: null },
        { categoryConfidence: { lt: 70 } },
      ],
    },
    include: {
      account: true,
      category: true,
    },
    orderBy: [{ categoryConfidence: "asc" }, { date: "desc" }],
    take: 100,
  });

  const counts = reviewTransactions.reduce(
    (accumulator, transaction) => {
      accumulator.total += 1;
      if (transaction.reviewStatus === "pending_review") accumulator.pending += 1;
      if (transaction.reviewStatus === "edited") accumulator.edited += 1;
      if (transaction.categoryConfidence < 70 || !transaction.categoryId) accumulator.lowConfidence += 1;
      return accumulator;
    },
    { total: 0, pending: 0, edited: 0, lowConfidence: 0 }
  );

  return (
    <CloverShell
      active="transactions"
      title="Review queue"
      kicker="Learning loop"
      subtitle="Transactions with low confidence, missing categories, or manual edits show up here so you can confirm the model’s guesses."
      showTopbar={false}
    >
      <PostHogEvent
        event="review_queue_opened"
        onceKey={analyticsOnceKey("review_queue_opened", `workspace:${selectedWorkspace.id}`)}
        properties={{
          workspace_id: selectedWorkspace.id,
          queue_count: counts.total,
          pending_count: counts.pending,
          low_confidence_count: counts.lowConfidence,
        }}
      />
      <section className="panel">
        <h2>Review queue</h2>
        <p className="panel-muted">
          Workspace: {selectedWorkspace.name}. {counts.total} transaction{counts.total === 1 ? "" : "s"} need review attention.
        </p>

        <div className="status-card" style={{ marginTop: 16 }}>
          <div>
            <strong>{counts.total}</strong>
            <div className="panel-muted">items in the queue</div>
          </div>
          <div className="status-stack">
            <span className="status status--processing">{counts.lowConfidence} low confidence</span>
            <span className="status">{counts.pending} pending review</span>
            <span className="status">{counts.edited} edited</span>
          </div>
        </div>

        <div style={{ marginTop: 20, overflowX: "auto" }}>
          {reviewTransactions.length > 0 ? (
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Confidence</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reviewTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.date)}</td>
                    <td>{transaction.merchantClean ?? transaction.merchantRaw}</td>
                    <td>{transaction.account.name}</td>
                    <td>{transaction.category?.name ?? "Uncategorized"}</td>
                    <td>{transaction.reviewStatus.replaceAll("_", " ")}</td>
                    <td>{transaction.categoryConfidence}%</td>
                    <td>{formatCurrency(transaction.amount)}</td>
                    <td>
                      <Link className="button button-secondary button-small" href="/transactions">
                        Open transactions
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">No transactions need review right now.</div>
          )}
        </div>

        <p className="panel-muted" style={{ marginTop: 16 }}>
          Need to correct merchant names or categories? Open the transaction editor and the model will learn from your changes automatically.
        </p>
      </section>
    </CloverShell>
  );
}

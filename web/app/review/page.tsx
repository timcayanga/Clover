import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ensureStarterWorkspace, seedWorkspaceDefaults } from "@/lib/starter-data";
import { CloverShell } from "@/components/clover-shell";
import { PostHogEvent } from "@/components/posthog-analytics";
import { ReviewWorkbench } from "@/components/review-workbench";
import { analyticsOnceKey } from "@/lib/analytics";
import { getSessionContext } from "@/lib/auth";
import { buildReviewQueueWhere } from "@/lib/review-queue";
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

  const starterWorkspace = await ensureStarterWorkspace(user);
  await seedWorkspaceDefaults(starterWorkspace.id);

  const workspaces = await prisma.workspace.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const selectedWorkspace = workspaces[0] ?? starterWorkspace;

  const [accounts, categories, reviewTransactions] = await Promise.all([
    prisma.account.findMany({
      where: { workspaceId: selectedWorkspace.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.category.findMany({
      where: { workspaceId: selectedWorkspace.id },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
      },
    }),
    prisma.transaction.findMany({
      where: buildReviewQueueWhere(selectedWorkspace.id),
      include: {
        account: true,
        category: true,
      },
      orderBy: [{ categoryConfidence: "asc" }, { date: "desc" }],
    }),
  ]);

  const counts = reviewTransactions.reduce(
    (accumulator, transaction) => {
      accumulator.total += 1;
      if (transaction.reviewStatus === "pending_review") accumulator.pending += 1;
      if (transaction.categoryConfidence < 70 || !transaction.categoryId) accumulator.lowConfidence += 1;
      if (transaction.accountMatchConfidence < 70) accumulator.lowAccount += 1;
      if (transaction.duplicateConfidence >= 50) accumulator.duplicateRisk += 1;
      return accumulator;
    },
    { total: 0, pending: 0, lowConfidence: 0, lowAccount: 0, duplicateRisk: 0 }
  );

  return (
    <CloverShell
      active="transactions"
      title="Review queue"
      kicker="Learning loop"
      subtitle="Fast triage for uncertain transactions. Confirm the right category, account, or note before they affect totals and insights."
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
          Workspace: {selectedWorkspace.name}. These are the rows that need a human decision before they can be
          trusted in totals, insights, or exports.
        </p>

        <div className="status-card status-card--review" style={{ marginTop: 16 }}>
          <div>
            <strong>{counts.total}</strong>
            <div className="panel-muted">actionable items</div>
          </div>
          <div className="status-stack">
            <span className="status status--processing">{counts.lowConfidence} low confidence</span>
            <span className="status">{counts.pending} pending review</span>
            <span className="status">{counts.lowAccount} low account confidence</span>
            <span className="status">{counts.duplicateRisk} duplicate risk</span>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          {reviewTransactions.length > 0 ? (
            <ReviewWorkbench
              workspaceId={selectedWorkspace.id}
              workspaceName={selectedWorkspace.name}
              accounts={accounts}
              categories={categories}
              transactions={reviewTransactions.map((transaction) => ({
                id: transaction.id,
                accountId: transaction.accountId,
                accountName: transaction.account.name,
                categoryId: transaction.categoryId,
                categoryName: transaction.category?.name ?? null,
                reviewStatus: transaction.reviewStatus,
                parserConfidence: transaction.parserConfidence,
                categoryConfidence: transaction.categoryConfidence,
                accountMatchConfidence: transaction.accountMatchConfidence,
                duplicateConfidence: transaction.duplicateConfidence,
                transferConfidence: transaction.transferConfidence,
                date: transaction.date.toISOString(),
                amount: transaction.amount.toString(),
                currency: transaction.currency,
                type: transaction.type,
                merchantRaw: transaction.merchantRaw,
                merchantClean: transaction.merchantClean,
                description: transaction.description,
                isTransfer: transaction.isTransfer,
                isExcluded: transaction.isExcluded,
              }))}
            />
          ) : (
            <div className="empty-state empty-state--review">
              <h3>No transactions need review right now</h3>
              <p>
                That means the current import set looks clear. When uncertain rows appear, this page will collect them
                here so you can resolve them quickly.
              </p>
              <Link className="button button-primary" href="/transactions">
                Open transactions
              </Link>
            </div>
          )}
        </div>
      </section>
    </CloverShell>
  );
}

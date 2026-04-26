import Link from "next/link";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { ensureStarterWorkspace } from "@/lib/starter-data";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";
import { prisma } from "@/lib/prisma";
import { getUpcomingStatementReminders } from "@/lib/statement-reminders";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications",
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const formatCurrency = (value: number) => currencyFormatter.format(value);
const formatDate = (value: string) => dateFormatter.format(new Date(value));

async function getWorkspaceId(userId: string, clerkUserId: string, email: string, verified: boolean) {
  const selectedWorkspace = await prisma.workspace.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (selectedWorkspace) {
    return selectedWorkspace.id;
  }

  const starterWorkspace = await ensureStarterWorkspace(clerkUserId, email, verified);
  const workspace = await prisma.workspace.findUnique({
    where: { id: starterWorkspace.id },
    select: { id: true },
  });

  return workspace?.id ?? starterWorkspace.id;
}

export default async function NotificationsPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  const workspaceId = await getWorkspaceId(user.id, user.clerkUserId, user.email, user.verified);
  const reminders = await getUpcomingStatementReminders(workspaceId);
  const nextReminder = reminders[0] ?? null;

  return (
    <CloverShell
      active="notifications"
      title="Notifications"
      kicker="Upcoming bills"
      subtitle="Clover keeps future-dated card reminders here, so past-due statements stay out of the way."
    >
      <section className="notifications-layout">
        <article className="panel notifications-hero">
          <div>
            <p className="eyebrow">Inbox</p>
            <h3>{nextReminder ? "Upcoming card payments" : "No upcoming card payments"}</h3>
            <p className="panel-muted">
              Only statements with a future due date are shown here. Past-due statements are intentionally ignored.
            </p>
          </div>
          <Link className="button button-secondary button-small" href="/dashboard">
            Back to dashboard
          </Link>
        </article>

        <div className="notifications-list">
          {reminders.length > 0 ? (
            reminders.map((reminder) => (
              <article key={reminder.checkpointId} className="panel notification-item">
                <div className="notification-item__main">
                  <p className="notification-item__tone">Due in {reminder.daysUntilDue} day{reminder.daysUntilDue === 1 ? "" : "s"}</p>
                  <h4>{reminder.accountName}</h4>
                  <p>
                    {reminder.institution ? `${reminder.institution} · ` : ""}
                    Payment due {formatDate(reminder.paymentDueDate)} · {formatCurrency(reminder.totalAmountDue)} due
                    {reminder.sourceFileName ? ` · ${reminder.sourceFileName}` : ""}
                  </p>
                </div>
                <div className="notification-item__time">
                  <time>{formatDate(reminder.paymentDueDate)}</time>
                  <div style={{ marginTop: 8 }}>
                    <Link className="button button-secondary button-small" href={reminder.accountId ? `/accounts/${reminder.accountId}` : "/accounts"}>
                      Open account
                    </Link>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <article className="panel notification-item">
              <div className="notification-item__main">
                <p className="notification-item__tone">All clear</p>
                <h4>Nothing due yet</h4>
                <p>When a future-dated credit-card due date is detected, Clover will surface it here automatically.</p>
              </div>
              <time className="notification-item__time">Now</time>
            </article>
          )}
        </div>
      </section>
    </CloverShell>
  );
}

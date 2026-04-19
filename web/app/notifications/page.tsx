import Link from "next/link";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { getSessionContext } from "@/lib/auth";
import { getOrCreateCurrentUser, hasCompletedOnboarding } from "@/lib/user-context";

export const metadata = {
  title: "Notifications",
};

const notifications = [
  {
    title: "Import finished",
    detail: "Your latest statement import is ready for review.",
    time: "Just now",
  },
  {
    title: "Transactions need attention",
    detail: "Three recent transactions still need categorization.",
    time: "14m ago",
  },
  {
    title: "Weekly summary",
    detail: "A spending summary is ready in Reports.",
    time: "Yesterday",
  },
];

export default async function NotificationsPage() {
  const session = await getSessionContext();
  const user = await getOrCreateCurrentUser(session.userId);
  if (!session.isGuest && !hasCompletedOnboarding(user)) {
    redirect("/onboarding");
  }

  return (
    <CloverShell
      active="notifications"
      title="Notifications"
      kicker="Recent activity"
      subtitle="Keep alerts separate from settings so the sidebar stays easier to scan."
    >
      <section className="notifications-layout">
        <article className="panel notifications-hero">
          <div>
            <p className="eyebrow">Inbox</p>
            <h3>You’re all caught up for now.</h3>
            <p className="panel-muted">
              This space can later hold import updates, review reminders, spending alerts, and digest summaries.
            </p>
          </div>
          <Link className="button button-secondary button-small" href="/settings">
            Notification preferences
          </Link>
        </article>

        <div className="notifications-list">
          {notifications.map((notification) => (
            <article key={notification.title} className="panel notification-item">
              <div className="notification-item__main">
                <h4>{notification.title}</h4>
                <p>{notification.detail}</p>
              </div>
              <time className="notification-item__time">{notification.time}</time>
            </article>
          ))}
        </div>
      </section>
    </CloverShell>
  );
}

import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";
import { ensureOnboardingAccess } from "@/lib/onboarding-access";

export const dynamic = "force-dynamic";

type MoreLink = {
  href: string;
  title: string;
  icon: PageIconName;
};

type MoreSection = {
  title: string;
  items: MoreLink[];
};

type PageIconName = "accounts" | "recurring" | "split-bill" | "investments" | "reports" | "goals" | "budgeting" | "notifications" | "settings" | "help";

const MORE_ICON_SRC: Record<PageIconName, string> = {
  accounts: "/assets/3d%20icons/menu/bank-account.png",
  recurring: "/assets/3d%20icons/menu/recurring.png",
  "split-bill": "/assets/3d%20icons/menu/split-bills.png",
  investments: "/assets/3d%20icons/menu/investments.png",
  reports: "/assets/3d%20icons/menu/reports.png",
  goals: "/assets/3d%20icons/menu/adviser.png",
  budgeting: "/assets/3d%20icons/menu/budgeting.png",
  notifications: "/assets/3d%20icons/menu/notifications.png",
  settings: "/assets/3d%20icons/menu/settings.png",
  help: "/assets/3d%20icons/menu/help.png",
};

function PageIcon({ name }: { name: PageIconName }) {
  return <img src={MORE_ICON_SRC[name]} alt="" width={96} height={96} loading="eager" decoding="async" className="more-page__link-icon-image" aria-hidden="true" />;
}

const moreSections: MoreSection[] = [
  {
    title: "Money",
    items: [
      {
        href: "/accounts",
        title: "Accounts",
        icon: "accounts",
      },
      {
        href: "/recurring",
        title: "Recurring",
        icon: "recurring",
      },
      {
        href: "/split-bill",
        title: "Split Bills",
        icon: "split-bill",
      },
      {
        href: "/investments",
        title: "Investments",
        icon: "investments",
      },
    ],
  },
  {
    title: "Analysis",
    items: [
      {
        href: "/reports",
        title: "Reports",
        icon: "reports",
      },
      {
        href: "/goals",
        title: "Goals",
        icon: "goals",
      },
      {
        href: "/budgeting",
        title: "Budgeting",
        icon: "budgeting",
      },
    ],
  },
  {
    title: "App",
    items: [
      {
        href: "/notifications",
        title: "Notifications",
        icon: "notifications",
      },
      {
        href: "/settings",
        title: "Settings",
        icon: "settings",
      },
      {
        href: "/help",
        title: "Help",
        icon: "help",
      },
    ],
  },
];

async function MorePageContent() {
  await ensureOnboardingAccess();

  return (
    <CloverShell active="more" title="More">
      <section className="more-page">
        <div className="more-page__sections">
          {moreSections.map((section) => (
            <section key={section.title} className="more-page__section">
              <div className="more-page__section-divider" aria-hidden="true" />
              <p className="more-page__section-label">{section.title}</p>
              <div className="more-page__links">
                {section.items.map((item) => (
                  <Link key={item.href} className="more-page__link" href={item.href} prefetch>
                    <span className="more-page__link-icon" aria-hidden="true">
                      <PageIcon name={item.icon} />
                    </span>
                    <strong>{item.title}</strong>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </CloverShell>
  );
}

export default function MorePage() {
  return <MorePageContent />;
}

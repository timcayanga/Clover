import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";
import { MoreSignOutButton } from "@/components/more-sign-out-button";
import { ensureOnboardingAccess } from "@/lib/onboarding-access";
import { getNavigationIconSrc, type NavigationIconName } from "@/lib/navigation-icons";

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

type PageIconName = "dashboard" | "adviser" | "accounts" | "transactions" | "recurring" | "circles" | "split-bill" | "investments" | "goals" | "budgeting" | "notifications" | "settings" | "help";

const MORE_ICON_NAMES: Record<PageIconName, NavigationIconName> = {
  dashboard: "home",
  adviser: "adviser",
  accounts: "accounts",
  transactions: "transactions",
  recurring: "recurring",
  circles: "circles",
  "split-bill": "splitBills",
  investments: "investments",
  goals: "goals",
  budgeting: "budgeting",
  notifications: "notifications",
  settings: "settings",
  help: "help",
};

function PageIcon({ name }: { name: PageIconName }) {
  return <img src={getNavigationIconSrc(MORE_ICON_NAMES[name])} alt="" width={96} height={96} loading="eager" decoding="sync" fetchPriority="high" className="more-page__link-icon-image" aria-hidden="true" />;
}

const moreSections: MoreSection[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/home",
        title: "Home",
        icon: "dashboard",
      },
      {
        href: "/adviser",
        title: "Adviser",
        icon: "adviser",
      },
    ],
  },
  {
    title: "Money",
    items: [
      {
        href: "/accounts",
        title: "Accounts",
        icon: "accounts",
      },
      {
        href: "/transactions",
        title: "Transactions",
        icon: "transactions",
      },
      {
        href: "/recurring",
        title: "Recurring",
        icon: "recurring",
      },
    ],
  },
  {
    title: "Together",
    items: [
      {
        href: "/circles",
        title: "Circles",
        icon: "circles",
      },
      {
        href: "/split-bill",
        title: "Split Bills",
        icon: "split-bill",
      },
    ],
  },
  {
    title: "Plan",
    items: [
      {
        href: "/budgeting",
        title: "Budgeting",
        icon: "budgeting",
      },
      {
        href: "/goals",
        title: "Goals",
        icon: "goals",
      },
      {
        href: "/investments",
        title: "Investments",
        icon: "investments",
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
    <CloverShell active="more" title="More" mobileBackHref="/home">
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
                    <span className="more-page__link-label">{item.title}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
          <section className="more-page__section more-page__section--account">
            <div className="more-page__section-divider" aria-hidden="true" />
            <p className="more-page__section-label">Account</p>
            <div className="more-page__links">
              <MoreSignOutButton />
            </div>
          </section>
        </div>
      </section>
    </CloverShell>
  );
}

export default function MorePage() {
  return <MorePageContent />;
}

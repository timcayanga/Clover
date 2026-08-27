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
  description: string;
};

type MoreSection = {
  title: string;
  items: MoreLink[];
};

type PageIconName = "dashboard" | "reports" | "adviser" | "accounts" | "transactions" | "recurring" | "circles" | "split-bill" | "investments" | "goals" | "budgeting" | "profile" | "notifications" | "settings" | "help";

const MORE_ICON_NAMES: Record<PageIconName, NavigationIconName> = {
  dashboard: "home",
  reports: "reports",
  adviser: "adviser",
  accounts: "accounts",
  transactions: "transactions",
  recurring: "recurring",
  circles: "circles",
  "split-bill": "splitBills",
  investments: "investments",
  goals: "goals",
  budgeting: "budgeting",
  profile: "profile",
  notifications: "notifications",
  settings: "settings",
  help: "help",
};

function PageIcon({ name }: { name: PageIconName }) {
  return <img src={getNavigationIconSrc(MORE_ICON_NAMES[name])} alt="" width={96} height={96} loading="eager" decoding="sync" fetchPriority="high" className="more-page__link-icon-image" aria-hidden="true" />;
}

const moreSections: MoreSection[] = [
  {
    title: "Understand",
    items: [
      {
        href: "/reports",
        title: "Reports",
        icon: "reports",
        description: "Explore charts, cash flow, spending, and trends.",
      },
      {
        href: "/adviser",
        title: "Adviser",
        icon: "adviser",
        description: "Ask Clover questions about your money.",
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
        description: "See banks, wallets, cash, and balances.",
      },
      {
        href: "/transactions",
        title: "Transactions",
        icon: "transactions",
        description: "Search, review, categorize, and tag activity.",
      },
      {
        href: "/recurring",
        title: "Recurring",
        icon: "recurring",
        description: "Review repeating payments and upcoming costs.",
      },
    ],
  },
  {
    title: "Together",
    items: [
      {
        href: "/split-bill",
        title: "Split Bills",
        icon: "split-bill",
        description: "Split one expense without inviting anyone.",
      },
      {
        href: "/circles",
        title: "Circles",
        icon: "circles",
        description: "Coordinate ongoing shared money responsibilities.",
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
        description: "Set spending guardrails and track pacing.",
      },
      {
        href: "/goals",
        title: "Goals",
        icon: "goals",
        description: "Track progress toward money goals.",
      },
      {
        href: "/investments",
        title: "Investments",
        icon: "investments",
        description: "Review holdings and portfolio performance.",
      },
    ],
  },
  {
    title: "App",
    items: [
      {
        href: "/profile",
        title: "Profile",
        icon: "profile",
        description: "Review your Clover identity and account details.",
      },
      {
        href: "/notifications",
        title: "Notifications",
        icon: "notifications",
        description: "See imports, reviews, and important updates.",
      },
      {
        href: "/settings",
        title: "Settings",
        icon: "settings",
        description: "Manage your profile, preferences, and plan.",
      },
      {
        href: "/help",
        title: "Help",
        icon: "help",
        description: "Find guidance about Clover and your data.",
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
                    <span className="more-page__link-copy">
                      <span className="more-page__link-label">{item.title}</span>
                      <span className="more-page__link-description">{item.description}</span>
                    </span>
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

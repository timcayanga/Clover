import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";
import { ensureOnboardingAccess } from "@/lib/onboarding-access";

export const dynamic = "force-dynamic";

type MoreLink = {
  href: string;
  title: string;
  detail: string;
};

type MoreSection = {
  title: string;
  summary: string;
  items: MoreLink[];
};

const moreSections: MoreSection[] = [
  {
    title: "Money",
    summary: "Accounts, recurring activity, and investments.",
    items: [
      {
        href: "/accounts",
        title: "Accounts",
        detail: "Track balances, institutions, and account activity.",
      },
      {
        href: "/recurring",
        title: "Recurring",
        detail: "Watch subscriptions, bills, and other repeating costs.",
      },
      {
        href: "/investments",
        title: "Investments",
        detail: "Review holdings, tickers, and market-linked balances.",
      },
    ],
  },
  {
    title: "Analysis",
    summary: "Reports, insights, and goals that shape decisions.",
    items: [
      {
        href: "/reports",
        title: "Reports",
        detail: "See spending mix, cash flow, and summary views.",
      },
      {
        href: "/insights",
        title: "Insights",
        detail: "Review trends and patterns across your money data.",
      },
      {
        href: "/goals",
        title: "Goals",
        detail: "Track saving, debt payoff, and milestone progress.",
      },
    ],
  },
  {
    title: "App",
    summary: "Settings and help when you need them.",
    items: [
      {
        href: "/settings",
        title: "Settings",
        detail: "Adjust preferences, theme, account, and data options.",
      },
      {
        href: "/help",
        title: "Help",
        detail: "Get guidance on setup, imports, and troubleshooting.",
      },
    ],
  },
];

async function MorePageContent() {
  await ensureOnboardingAccess();

  return (
    <CloverShell active="more" title="More" subtitle="The rest of Clover, grouped by the jobs people do most often.">
      <section className="more-page">
        <div className="more-page__hero glass">
          <p className="eyebrow">Navigation hub</p>
          <h2>Everything that is not on the bottom bar lives here.</h2>
          <p>
            Clover keeps the daily path simple: Home, Transactions, Split Bills, and Add. This page is where the supporting
            tools live when you need them.
          </p>
        </div>

        <div className="more-page__sections">
          {moreSections.map((section) => (
            <article key={section.title} className="more-page__section glass">
              <div className="more-page__section-head">
                <div>
                  <p className="eyebrow">{section.title}</p>
                  <h3>{section.title}</h3>
                </div>
                <p className="more-page__section-summary">{section.summary}</p>
              </div>

              <div className="more-page__links">
                {section.items.map((item) => (
                  <Link key={item.href} className="more-page__link" href={item.href}>
                    <span className="more-page__link-copy">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    <span className="more-page__link-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </CloverShell>
  );
}

export default function MorePage() {
  return <MorePageContent />;
}

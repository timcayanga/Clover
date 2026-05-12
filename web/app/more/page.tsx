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

type PageIconName = "accounts" | "recurring" | "investments" | "reports" | "insights" | "goals" | "notifications" | "settings" | "help";

function PageIcon({ name }: { name: PageIconName }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "accounts":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="3" />
          <path d="M7 10h10" />
          <path d="M7 14h6" />
        </svg>
      );
    case "recurring":
      return (
        <svg {...common}>
          <path d="M7.4 8.5A7 7 0 0 1 12 5.8c2.3 0 4.4 1 5.9 2.7" />
          <path d="M16.8 5.8h1.1v4.1" />
          <path d="M17.9 5.8 15.7 8" />
          <path d="M16.6 15.5A7 7 0 0 1 12 18.2c-2.3 0-4.4-1-5.9-2.7" />
          <path d="M7.2 18.2H6.1v-4.1" />
          <path d="M6.1 18.2 8.3 16" />
        </svg>
      );
    case "investments":
      return (
        <svg {...common}>
          <path d="M4 18h16" />
          <path d="M6.5 14.5l3-3 2.8 2.8L18 8" />
          <path d="M14.2 8H18v3.8" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 12V4" />
          <path d="M12 12l6.9 4" />
          <path d="M12 12l-6.9 4" />
        </svg>
      );
    case "insights":
      return (
        <svg {...common}>
          <path d="M12 3.5l1.87 4.63L18.5 10l-4.63 1.87L12 16.5l-1.87-4.63L5.5 10l4.63-1.87L12 3.5Z" />
          <path d="M19.5 14l.95 2.35L22.5 17l-2.05.65L19.5 20l-.95-2.35L16.5 17l2.05-.65L19.5 14Z" />
        </svg>
      );
    case "goals":
      return (
        <svg {...common}>
          <path d="m12 3.5 2.71 5.49 6.06.88-4.39 4.28 1.04 6.03L12 17.98l-5.42 2.85 1.04-6.03-4.39-4.28 6.06-.88L12 3.5Z" />
        </svg>
      );
    case "notifications":
      return (
        <svg {...common}>
          <path d="M15 17H9" />
          <path d="M17 14v-3.8a5 5 0 0 0-10 0V14l-1.7 1.7A1 1 0 0 0 6 17h12a1 1 0 0 0 .7-1.7L17 14Z" />
          <path d="M10.5 17a1.5 1.5 0 0 0 3 0" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.2-1.9-3.2-2.3.7a8.1 8.1 0 0 0-1.7-1l-.3-2.4H10l-.3 2.4a8.1 8.1 0 0 0-1.7 1l-2.3-.7-1.9 3.2 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 1.9 3.2 2.3-.7a8.1 8.1 0 0 0 1.7 1l.3 2.4h4.1l.3-2.4a8.1 8.1 0 0 0 1.7-1l2.3.7 1.9-3.2-2-1.2Z" />
        </svg>
      );
    case "help":
      return (
        <svg {...common}>
          <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.9.6-1.5 1.2-1.5 2.5" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="8.5" />
        </svg>
      );
  }
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
        href: "/insights",
        title: "Insights",
        icon: "insights",
      },
      {
        href: "/goals",
        title: "Goals",
        icon: "goals",
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

import type { ReactNode } from "react";
import Link from "next/link";

type CloverShellProps = {
  active: "overview" | "accounts" | "transactions" | "reports" | "insights" | "settings";
  title: string;
  kicker?: string;
  subtitle?: string;
  actions?: ReactNode;
  showTopbar?: boolean;
  children: ReactNode;
};

const navItems = [
  { href: "/", label: "Overview", key: "overview" as const },
  { href: "/accounts", label: "Accounts", key: "accounts" as const },
  { href: "/transactions", label: "Transactions", key: "transactions" as const },
  { href: "/reports", label: "Reports", key: "reports" as const },
  { href: "/dashboard#insights", label: "Insights", key: "insights" as const },
];

type IconName = "overview" | "accounts" | "transactions" | "reports" | "insights" | "settings";

function MenuIcon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "overview":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10.5V20h14v-9.5" />
          <path d="M9.5 20v-6.2h5V20" />
        </svg>
      );
    case "accounts":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="3" />
          <path d="M7 10h10" />
          <path d="M7 14h6" />
        </svg>
      );
    case "transactions":
      return (
        <svg {...common}>
          <path d="M7 7h10" />
          <path d="M7 17h10" />
          <path d="M7 7l3-3" />
          <path d="M7 7l3 3" />
          <path d="M17 17l-3-3" />
          <path d="M17 17l-3 3" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M6 15.5V9.5" />
          <path d="M12 15.5V6.5" />
          <path d="M18 15.5v-5" />
          <path d="M6 15.5h12" />
        </svg>
      );
    case "insights":
      return (
        <svg {...common}>
          <path d="M12 3.5l1.87 4.63L18.5 10l-4.63 1.87L12 16.5l-1.87-4.63L5.5 10l4.63-1.87L12 3.5Z" />
          <path d="M19.5 14l.95 2.35L22.5 17l-2.05.65L19.5 20l-.95-2.35L16.5 17l2.05-.65L19.5 14Z" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a8.3 8.3 0 0 0 .1-6l-2 .2a6.8 6.8 0 0 0-1.6-1.6l.2-2a8.3 8.3 0 0 0-6-.1l-.2 2a6.8 6.8 0 0 0-1.6 1.6l-2-.2a8.3 8.3 0 0 0-.1 6l2-.2a6.8 6.8 0 0 0 1.6 1.6l-.2 2a8.3 8.3 0 0 0 6 .1l.2-2a6.8 6.8 0 0 0 1.6-1.6Z" />
        </svg>
      );
  }
}

export function CloverShell({
  active,
  title,
  kicker,
  subtitle,
  actions,
  showTopbar = true,
  children,
}: CloverShellProps) {
  return (
    <>
      <div className="app-shell">
        <aside className="sidebar" aria-label="Primary">
          <div className="sidebar-brand">
            <Link className="sidebar-brand-link" href="/" aria-label="Clover home">
              <img className="brand-mark brand-mark--sidebar" src="/favicon.svg" alt="" aria-hidden="true" />
            </Link>
          </div>

          <nav className="sidebar-nav" aria-label="Primary">
            {navItems.map((item) => (
              <Link key={item.key} className={`nav-link ${active === item.key ? "is-active" : ""}`} href={item.href}>
                <span className="nav-link__icon" aria-hidden="true">
                  <MenuIcon name={item.key} />
                </span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="sidebar-footer">
            <Link className={`nav-link nav-link--settings ${active === "settings" ? "is-active" : ""}`} href="/settings">
              <span className="nav-link__icon" aria-hidden="true">
                <MenuIcon name="settings" />
              </span>
              Settings
            </Link>
          </div>
        </aside>

        <main className="content">
          {showTopbar ? (
            <header className="topbar glass">
              <div>
                {kicker ? <p className="eyebrow">{kicker}</p> : null}
                <h2>{title}</h2>
                {subtitle ? <p className="topbar-subtitle">{subtitle}</p> : null}
              </div>
              <div className="topbar-actions">{actions}</div>
            </header>
          ) : null}

          <div className="content-body">{children}</div>
        </main>
      </div>
    </>
  );
}

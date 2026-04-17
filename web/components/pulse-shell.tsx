import type { ReactNode } from "react";
import Link from "next/link";

type PulseShellProps = {
  active: "overview" | "transactions" | "analytics";
  title: string;
  kicker?: string;
  subtitle?: string;
  actions?: ReactNode;
  showTopbar?: boolean;
  children: ReactNode;
};

const navItems = [
  { href: "/", label: "Overview", key: "overview" as const },
  { href: "/transactions", label: "Transactions", key: "transactions" as const },
  { href: "/dashboard#analytics", label: "Analytics", key: "analytics" as const },
];

export function PulseShell({
  active,
  title,
  kicker,
  subtitle,
  actions,
  showTopbar = true,
  children,
}: PulseShellProps) {
  return (
    <>
      <div className="background" aria-hidden="true">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="grid-overlay" />
      </div>

      <div className="app-shell">
        <aside className="sidebar glass">
          <div className="brand">
            <div className="brand-mark">CL</div>
            <div>
              <p className="eyebrow">Clover</p>
              <h1>Pulse</h1>
            </div>
          </div>

          <nav className="nav" aria-label="Primary">
            {navItems.map((item) => (
              <Link key={item.key} className={`nav-link ${active === item.key ? "is-active" : ""}`} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="tier-card tier-free">
            <span className="pill pill-accent">Import-first workflow</span>
            <h2>Clarity for statements, transactions, and source tracking.</h2>
            <p>Review cleanly, spot patterns early, and keep imports private by default.</p>
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

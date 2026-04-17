import type { ReactNode } from "react";
import Link from "next/link";

type CloverShellProps = {
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
      <div className="background" aria-hidden="true">
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="grid-overlay" />
      </div>

      <div className="app-shell">
        <aside className="sidebar glass">
          <div className="brand brand--stack">
            <img className="brand-mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
            <div className="brand-copy">
              <p className="brand-eyebrow">CLOVER</p>
              <img className="brand-wordmark" src="/clover-name-teal.svg" alt="Clover" />
            </div>
          </div>

          <nav className="nav" aria-label="Primary">
            {navItems.map((item) => (
              <Link key={item.key} className={`nav-link ${active === item.key ? "is-active" : ""}`} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
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

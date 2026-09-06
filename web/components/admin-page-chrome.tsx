import Link from "next/link";
import type { ReactNode } from "react";

type AdminPageChromeProps = {
  active:
    | "home"
    | "content"
    | "campaigns"
    | "users"
    | "support"
    | "operations"
    | "analytics"
    | "analysis"
    | "logs"
    | "errors"
    | "inquiries"
    | "data-qa";
  title: string;
  kicker?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const adminNavItems = [
  { key: "home", href: "/admin", label: "Home" },
  { key: "content", href: "/admin/content", label: "Content" },
  { key: "users", href: "/admin/users", label: "Users" },
  { key: "campaigns", href: "/admin/campaigns", label: "Campaigns & Referrals" },
  { key: "support", href: "/admin/support", label: "Support" },
  { key: "operations", href: "/admin/operations", label: "Operations" },
  { key: "analytics", href: "/admin/analytics", label: "Analytics" },
  { key: "analysis", href: "/admin/analysis", label: "Analysis" },
  { key: "logs", href: "/admin/logs", label: "Audit logs" },
  { key: "errors", href: "/admin/errors", label: "Errors" },
  { key: "inquiries", href: "/admin/inquiries", label: "Inquiries" },
  { key: "data-qa", href: "/admin/data-qa", label: "Data QA" },
] as const;

export function AdminPageChrome({
  active,
  title,
  actions,
  children,
}: AdminPageChromeProps) {
  return (
    <div className="admin-page-shell">
      <header className="admin-page-header">
        <h1>{title}</h1>
        {actions ? (
          <div className="admin-page-chrome__actions">{actions}</div>
        ) : null}
      </header>
      <nav className="admin-section-nav" aria-label="Admin sections">
        {adminNavItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            prefetch
            className={`admin-section-nav__link${item.key === active ? " is-active" : ""}`}
            aria-current={item.key === active ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="admin-page__content">{children}</div>
    </div>
  );
}

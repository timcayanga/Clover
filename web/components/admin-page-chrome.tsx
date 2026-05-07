import Link from "next/link";
import type { ReactNode } from "react";

type AdminPageChromeProps = {
  active: "home" | "inquiries" | "data-qa";
  title: string;
  kicker?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

const adminNavItems = [
  { key: "home", href: "/admin", label: "Home" },
  { key: "inquiries", href: "/admin/inquiries", label: "Inquiries" },
  { key: "data-qa", href: "/admin/data-qa", label: "Data QA" },
] as const;

export function AdminPageChrome({ active, title, kicker, subtitle, actions, children }: AdminPageChromeProps) {
  return (
    <div className="admin-hub">
      <section className="admin-hub__nav-card glass">
        <div className="admin-hub__nav-copy">
          {kicker ? <p className="eyebrow">{kicker}</p> : null}
          <h1>{title}</h1>
          {subtitle ? <p className="panel-muted">{subtitle}</p> : null}
        </div>
        <div className="admin-hub__nav-actions">
          <nav className="admin-section-nav" aria-label="Admin sections">
            {adminNavItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`admin-section-nav__link${item.key === active ? " is-active" : ""}`}
                aria-current={item.key === active ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {actions ? <div className="admin-page-chrome__actions">{actions}</div> : null}
        </div>
      </section>
      <div className="admin-page__content">{children}</div>
    </div>
  );
}

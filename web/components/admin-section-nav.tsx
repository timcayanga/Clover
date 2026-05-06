import Link from "next/link";

export type AdminSectionKey = "home" | "users" | "analytics" | "data-qa" | "errors" | "inquiries";

type AdminSection = {
  key: AdminSectionKey;
  label: string;
  href: string;
};

const ADMIN_SECTIONS: AdminSection[] = [
  { key: "home", label: "Admin", href: "/admin" },
  { key: "users", label: "User Management", href: "/admin/users" },
  { key: "analytics", label: "Analytics", href: "/admin/analytics" },
  { key: "data-qa", label: "Data QA", href: "/admin/data-qa" },
  { key: "errors", label: "Error Logs", href: "/admin/errors" },
  { key: "inquiries", label: "Inquiries", href: "/admin/inquiries" },
];

type AdminSectionNavProps = {
  active: AdminSectionKey;
};

export function AdminSectionNav({ active }: AdminSectionNavProps) {
  return (
    <nav className="admin-section-nav" aria-label="Admin sections">
      {ADMIN_SECTIONS.map((section) => (
        <Link
          key={section.key}
          href={section.href}
          className={`admin-section-nav__link ${active === section.key ? "is-active" : ""}`}
          aria-current={active === section.key ? "page" : undefined}
          prefetch={false}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}


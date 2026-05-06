import type { ReactNode } from "react";
import { CloverShell } from "@/components/clover-shell";
import { AdminSectionNav, type AdminSectionKey } from "@/components/admin-section-nav";

type AdminPageChromeProps = {
  active: AdminSectionKey;
  title: string;
  kicker?: string;
  subtitle?: string;
  titleAddon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminPageChrome({
  active,
  title,
  kicker = "Internal tools",
  subtitle,
  titleAddon,
  actions,
  children,
}: AdminPageChromeProps) {
  return (
    <CloverShell
      active="admin"
      title={title}
      kicker={kicker}
      subtitle={subtitle}
      titleAddon={titleAddon}
      actions={
        <div className="admin-page-chrome__actions">
          <AdminSectionNav active={active} />
          {actions}
        </div>
      }
    >
      {children}
    </CloverShell>
  );
}


"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";

type CloverShellProps = {
  active: "dashboard" | "accounts" | "transactions" | "reports" | "insights" | "settings";
  title: string;
  kicker?: string;
  subtitle?: string;
  actions?: ReactNode;
  showTopbar?: boolean;
  children: ReactNode;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard" as const },
  { href: "/accounts", label: "Accounts", key: "accounts" as const },
  { href: "/transactions", label: "Transactions", key: "transactions" as const },
  { href: "/reports", label: "Reports", key: "reports" as const },
  { href: "/reports", label: "Insights", key: "insights" as const },
];

type IconName =
  | "dashboard"
  | "accounts"
  | "transactions"
  | "reports"
  | "insights"
  | "settings"
  | "search"
  | "notifications"
  | "profile";

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
    case "dashboard":
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5 10.5V20h14v-9.5" />
          <path d="M9.5 20v-6.2h5V20" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      );
    case "notifications":
      return (
        <svg {...common}>
          <path d="M6 17h12" />
          <path d="M8 17v-6a4 4 0 1 1 8 0v6" />
          <path d="M10 17a2 2 0 0 0 4 0" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <circle cx="12" cy="8.5" r="3.2" />
          <path d="M5.5 19c1.5-3.2 4.1-5 6.5-5s5 1.8 6.5 5" />
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
  const { user } = useUser();
  const displayName = user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "Profile";
  const profileInitial = displayName.trim().slice(0, 1).toUpperCase();
  const profileImage = user?.imageUrl ?? null;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar-brand">
          <Link className="sidebar-brand-link" href="/dashboard" aria-label="Go to dashboard">
            <img className="brand-mark brand-mark--sidebar" src="/favicon.svg" alt="" aria-hidden="true" />
          </Link>

          <div className="sidebar-brand-actions" aria-label="Quick actions">
            <Link className="sidebar-icon-button" href="#sidebar-search" aria-label="Search">
              <MenuIcon name="search" />
            </Link>
            <Link className="sidebar-icon-button" href="/settings#notifications-and-alerts" aria-label="Notifications">
              <MenuIcon name="notifications" />
            </Link>
          </div>
        </div>

        <label className="sidebar-search" htmlFor="sidebar-search">
          <span className="sr-only">Search</span>
          <input id="sidebar-search" type="search" placeholder="Search" />
        </label>

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
          <Link className="sidebar-profile" href="/settings#profile-and-workspace" aria-label="Profile">
            <span className="sidebar-profile__avatar" aria-hidden="true">
              {profileImage ? <img src={profileImage} alt="" /> : <span>{profileInitial}</span>}
            </span>
            <span className="sr-only">{displayName}</span>
          </Link>
          <Link className={`sidebar-icon-button ${active === "settings" ? "is-active" : ""}`} href="/settings" aria-label="Settings">
            <MenuIcon name="settings" />
          </Link>
          <Link className="sidebar-icon-button" href="/settings#notifications-and-alerts" aria-label="Notifications">
            <MenuIcon name="notifications" />
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
  );
}

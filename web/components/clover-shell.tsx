"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { persistSelectedWorkspaceId, syncSelectedWorkspaceCookie } from "@/lib/workspace-selection";

type CloverShellProps = {
  active: "dashboard" | "accounts" | "transactions" | "reports" | "insights" | "goals" | "settings" | "profile" | "notifications";
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
  { href: "/insights", label: "Insights", key: "insights" as const },
  { href: "/goals", label: "Goals", key: "goals" as const },
];

type IconName =
  | "dashboard"
  | "accounts"
  | "transactions"
  | "reports"
  | "insights"
  | "goals"
  | "search"
  | "notifications"
  | "profile"
  | "settings"
  | "sign-out";

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
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.2-1.9-3.2-2.3.7a8.1 8.1 0 0 0-1.7-1l-.3-2.4H10l-.3 2.4a8.1 8.1 0 0 0-1.7 1l-2.3-.7-1.9 3.2 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 1.9 3.2 2.3-.7a8.1 8.1 0 0 0 1.7 1l.3 2.4h4.1l.3-2.4a8.1 8.1 0 0 0 1.7-1l2.3.7 1.9-3.2-2-1.2Z" />
        </svg>
      );
    case "sign-out":
      return (
        <svg {...common}>
          <path d="M10 6H6.5A1.5 1.5 0 0 0 5 7.5v9A1.5 1.5 0 0 0 6.5 18H10" />
          <path d="m14 8 4 4-4 4" />
          <path d="M18 12H10" />
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
    case "goals":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 4.5v2.2" />
          <path d="M19.5 12h-2.2" />
          <path d="M12 17.3v2.2" />
          <path d="M4.5 12h2.2" />
        </svg>
      );
  }
}

const notifications = [
  {
    title: "Import finished",
    detail: "Your latest statement import is ready for review.",
    time: "Just now",
  },
  {
    title: "Transactions need attention",
    detail: "Three recent transactions still need categorization.",
    time: "14m ago",
  },
  {
    title: "Weekly summary",
    detail: "A spending summary is ready in Reports.",
    time: "Yesterday",
  },
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
  const { user } = useUser();
  const { signOut } = useClerk();
  const pathname = usePathname();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<"notifications" | "profile" | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const displayName = user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "Profile";
  const profileInitial = displayName.trim().slice(0, 1).toUpperCase();
  const profileImage = user?.imageUrl ?? null;
  const isProfileActive = active === "profile" || pathname.startsWith("/profile");
  const isNotificationsActive = openMenu === "notifications";
  const isProfileMenuOpen = openMenu === "profile";

  useEffect(() => {
    setIsSidebarOpen(false);
    syncSelectedWorkspaceCookie();
    const handlePointerDown = (event: MouseEvent) => {
      if (!shellRef.current || event.target instanceof Node === false) {
        return;
      }

      if (!shellRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pathname]);

  const notificationCount = notifications.length;
  const handleSignOut = () => {
    persistSelectedWorkspaceId("");
    void signOut({
      redirectUrl: "/sign-in",
    }).catch(() => {
      window.location.assign("/sign-in");
    });
  };

  return (
    <div className={`app-shell ${isSidebarOpen ? "is-sidebar-open" : ""}`} ref={shellRef}>
      <div
        className="sidebar-backdrop"
        role="presentation"
        hidden={!isSidebarOpen}
        onClick={() => setIsSidebarOpen(false)}
      />
      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar-brand">
          <Link className="sidebar-brand-link" href="/dashboard" aria-label="Go to dashboard" prefetch={false}>
            <img className="brand-mark brand-mark--sidebar" src="/favicon.svg" alt="" aria-hidden="true" />
            <img className="brand-wordmark brand-wordmark--sidebar" src="/clover-name-teal.svg" alt="Clover" />
          </Link>
        </div>

        <label className="sidebar-search" htmlFor="sidebar-search">
          <span className="sr-only">Search</span>
          <input id="sidebar-search" type="search" placeholder="Search" />
        </label>

        <nav className="sidebar-nav" aria-label="Primary" id="primary-navigation">
          {navItems.map((item) => (
            <Link
              key={item.key}
              className={`nav-link ${active === item.key ? "is-active" : ""}`}
              href={item.href}
              aria-current={active === item.key ? "page" : undefined}
              prefetch={false}
            >
              <span className="nav-link__icon" aria-hidden="true">
                <MenuIcon name={item.key} />
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className={`sidebar-profile ${isProfileActive || isProfileMenuOpen ? "is-active" : ""}`}
            type="button"
            aria-label={`Open ${displayName} profile menu`}
            aria-expanded={isProfileMenuOpen}
            aria-haspopup="menu"
            onClick={() =>
              setOpenMenu((current) => {
                if (current === "profile") {
                  return null;
                }

                return "profile";
              })
            }
          >
            <span className="sidebar-profile__avatar" aria-hidden="true">
              {profileImage ? <img src={profileImage} alt="" /> : <span>{profileInitial}</span>}
            </span>
            <span className="sr-only">{displayName}</span>
          </button>
          <button
            className={`sidebar-icon-button ${isNotificationsActive ? "is-active" : ""}`}
            type="button"
            aria-label={`Open notifications${notificationCount ? ` (${notificationCount})` : ""}`}
            aria-expanded={isNotificationsActive}
            aria-haspopup="menu"
            onClick={() => setOpenMenu((current) => (current === "notifications" ? null : "notifications"))}
          >
            <MenuIcon name="notifications" />
          </button>

          {isProfileMenuOpen ? (
            <div className="sidebar-popover sidebar-popover--profile" role="menu" aria-label="Profile menu">
              <div className="sidebar-popover__head">
                <span className="sidebar-popover__title">{displayName}</span>
              </div>
              <div className="sidebar-popover__links sidebar-popover__links--bare">
                <Link
                  className="sidebar-popover__link sidebar-popover__link--bare"
                  role="menuitem"
                  href="/settings"
                  onClick={() => setOpenMenu(null)}
                >
                  <span className="sidebar-popover__link-icon" aria-hidden="true">
                    <MenuIcon name="settings" />
                  </span>
                  <span>Settings</span>
                </Link>
                <button
                  className="sidebar-popover__link sidebar-popover__button sidebar-popover__button--danger sidebar-popover__link--bare"
                  type="button"
                  onClick={handleSignOut}
                  role="menuitem"
                >
                  <span className="sidebar-popover__link-icon" aria-hidden="true">
                    <MenuIcon name="sign-out" />
                  </span>
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          ) : null}

          {isNotificationsActive ? (
            <div className="sidebar-popover sidebar-popover--notifications" role="menu" aria-label="Notifications">
              <div className="sidebar-popover__head">
                <span className="sidebar-popover__title">Notifications</span>
                <span className="sidebar-popover__subtitle">
                  {notificationCount ? `${notificationCount} recent update${notificationCount === 1 ? "" : "s"}` : "No new alerts"}
                </span>
              </div>
              <div className="sidebar-popover__items">
                {notifications.length ? (
                  notifications.map((notification) => (
                    <div key={notification.title} className="sidebar-popover__item">
                      <strong>{notification.title}</strong>
                      <span>{notification.detail}</span>
                      <small>{notification.time}</small>
                    </div>
                  ))
                ) : (
                  <div className="sidebar-popover__empty">You’re all caught up.</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </aside>

      <main className="content">
        <div className="content-mobile-bar">
          <button
            className="content-mobile-bar__toggle"
            type="button"
            aria-label={isSidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={isSidebarOpen}
            aria-controls="primary-navigation"
            onClick={() => setIsSidebarOpen((current) => !current)}
          >
            <img className="content-mobile-bar__mark" src="/favicon.svg" alt="" aria-hidden="true" />
          </button>
        </div>
        {showTopbar ? (
          <header className="topbar glass">
            <div>
              {kicker ? <p className="eyebrow">{kicker}</p> : null}
              <h1>{title}</h1>
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

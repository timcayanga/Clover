"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { persistSelectedWorkspaceId, readSelectedWorkspaceId, syncSelectedWorkspaceCookie } from "@/lib/workspace-selection";
import { clearAllWorkspaceCaches, clearLegacyWorkspaceCaches } from "@/lib/workspace-cache";

type CloverShellProps = {
  active:
    | "dashboard"
    | "accounts"
    | "investments"
    | "transactions"
    | "reports"
    | "insights"
    | "goals"
    | "settings"
    | "profile"
    | "notifications"
    | "admin";
  title: string;
  kicker?: string;
  subtitle?: string;
  actions?: ReactNode;
  showTopbar?: boolean;
  children: ReactNode;
};

type SidebarSearchAccount = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  balance: string | null;
  investmentSymbol: string | null;
  investmentSubtype: string | null;
};

type SidebarSearchMarket = {
  symbol: string;
  market: "ph" | "us";
  latest: {
    value: number;
  };
  change: number;
  changePercent: number;
};

type SidebarSearchResult = {
  key: string;
  title: string;
  detail: string;
  href: string;
  icon: IconName;
  badge?: string;
};

const avatarBackgrounds = [
  "rgba(3, 168, 192, 0.16)",
  "rgba(3, 168, 192, 0.22)",
  "rgba(104, 220, 177, 0.22)",
  "rgba(181, 246, 239, 0.9)",
  "rgba(15, 23, 42, 0.08)",
] as const;

const sidebarSearchPages: Array<{
  key: string;
  title: string;
  href: string;
  icon: IconName;
  detail: string;
  terms: string[];
}> = [
  {
    key: "dashboard",
    title: "Dashboard",
    href: "/dashboard",
    icon: "dashboard",
    detail: "Overview and quick actions.",
    terms: ["dashboard", "overview", "home", "summary"],
  },
  {
    key: "accounts",
    title: "Accounts",
    href: "/accounts",
    icon: "accounts",
    detail: "Banks, cash, and investments.",
    terms: ["accounts", "account", "banks", "bank", "wallet", "cash"],
  },
  {
    key: "transactions",
    title: "Transactions",
    href: "/transactions",
    icon: "transactions",
    detail: "Search, review, and categorize activity.",
    terms: ["transactions", "transaction", "activity", "spend", "spending", "review"],
  },
  {
    key: "investments",
    title: "Investments",
    href: "/investments",
    icon: "investments",
    detail: "Track holdings and market tickers.",
    terms: ["investments", "investment", "ticker", "tickers", "stock", "stocks", "fund", "bonds"],
  },
  {
    key: "reports",
    title: "Reports",
    href: "/reports",
    icon: "reports",
    detail: "Cash flow, mix, and summary views.",
    terms: ["reports", "report", "cash flow", "cashflow", "insights", "trend", "summary"],
  },
  {
    key: "insights",
    title: "Insights",
    href: "/insights",
    icon: "insights",
    detail: "Goal-aware spending guidance.",
    terms: ["insights", "insight", "analysis", "trend", "goal"],
  },
  {
    key: "goals",
    title: "Goals",
    href: "/goals",
    icon: "goals",
    detail: "Save, pay down debt, or track milestones.",
    terms: ["goals", "goal", "savings", "save", "debt", "milestone"],
  },
];

const normalizeSidebarSearch = (value: string) => value.trim().toLowerCase();

const getSidebarSearchBlob = (account: SidebarSearchAccount) =>
  [
    account.name,
    account.institution ?? "",
    account.type,
    account.balance ?? "",
    account.investmentSymbol ?? "",
    account.investmentSubtype ?? "",
  ]
    .join(" ")
    .toLowerCase();

const formatSidebarMoney = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const navItems = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard" as const },
  { href: "/accounts", label: "Accounts", key: "accounts" as const },
  { href: "/transactions", label: "Transactions", key: "transactions" as const },
  { href: "/investments", label: "Investments", key: "investments" as const },
  { href: "/reports", label: "Reports", key: "reports" as const },
  { href: "/insights", label: "Insights", key: "insights" as const },
  { href: "/goals", label: "Goals", key: "goals" as const },
];

const mobileNavItems = navItems.slice(0, 4);

type IconName =
  | "dashboard"
  | "accounts"
  | "investments"
  | "transactions"
  | "reports"
  | "insights"
  | "goals"
  | "search"
  | "more"
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
    case "more":
      return (
        <svg {...common}>
          <circle cx="6.5" cy="12" r="1.25" />
          <circle cx="12" cy="12" r="1.25" />
          <circle cx="17.5" cy="12" r="1.25" />
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
    case "investments":
      return (
        <svg {...common}>
          <path d="M4 18h16" />
          <path d="M6.5 14.5l3-3 2.8 2.8L18 8" />
          <path d="M14.2 8H18v3.8" />
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
          <path d="M12 12V4a8 8 0 1 1-8 8h8Z" />
          <path d="M13.5 4.2A8 8 0 0 1 20 10.8h-6.5Z" />
          <path d="M4 12a8 8 0 0 1 6.5-7.8V12Z" />
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
  }
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
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
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const profilePopoverRef = useRef<HTMLDivElement | null>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationsPopoverRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<"notifications" | "profile" | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchWorkspaceId, setSearchWorkspaceId] = useState(() => readSelectedWorkspaceId());
  const [searchAccounts, setSearchAccounts] = useState<SidebarSearchAccount[]>([]);
  const [searchPlanTier, setSearchPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [searchTicker, setSearchTicker] = useState<SidebarSearchMarket | null>(null);
  const [searchTickerLoading, setSearchTickerLoading] = useState(false);
  const displayName = user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "Profile";
  const profileInitial = displayName.trim().slice(0, 1).toUpperCase();
  const profileImage = user?.imageUrl ?? null;
  const profileBackground = avatarBackgrounds[hashString(displayName) % avatarBackgrounds.length];
  const isProfileActive = active === "profile" || pathname.startsWith("/profile");
  const isNotificationsActive = openMenu === "notifications";
  const isProfileMenuOpen = openMenu === "profile";

  useEffect(() => {
    setIsSidebarOpen(false);
    syncSelectedWorkspaceCookie();
    setSearchWorkspaceId(readSelectedWorkspaceId());
    clearLegacyWorkspaceCaches();
    const handlePointerDown = (event: PointerEvent | MouseEvent) => {
      if (!shellRef.current || event.target instanceof Node === false) {
        return;
      }

      const target = event.target;

      if (isSearchOpen && searchWrapRef.current && !searchWrapRef.current.contains(target) && !searchResultsRef.current?.contains(target)) {
        setIsSearchOpen(false);
      }

      if (
        openMenu === "profile" &&
        !profileButtonRef.current?.contains(target) &&
        !profilePopoverRef.current?.contains(target)
      ) {
        setOpenMenu(null);
      }

      if (
        openMenu === "notifications" &&
        !notificationsButtonRef.current?.contains(target) &&
        !notificationsPopoverRef.current?.contains(target)
      ) {
        setOpenMenu(null);
      }

      if (!shellRef.current.contains(target)) {
        setOpenMenu(null);
        setIsSearchOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setIsSearchOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("mousedown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("mousedown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pathname, isSearchOpen, openMenu]);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentUser = async () => {
      try {
        const response = await fetch("/api/me");
        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json();
        setSearchPlanTier(payload?.user?.planTier === "pro" ? "pro" : "free");
      } catch {
        if (!cancelled) {
          setSearchPlanTier("free");
        }
      }
    };

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshSearchWorkspace = async () => {
      const nextWorkspaceId = readSelectedWorkspaceId();
      if (nextWorkspaceId === searchWorkspaceId) {
        return;
      }

      setSearchWorkspaceId(nextWorkspaceId);
    };

    void refreshSearchWorkspace();

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "clover.selected-workspace-id.v1") {
        return;
      }

      const nextWorkspaceId = readSelectedWorkspaceId();
      if (!cancelled) {
        setSearchWorkspaceId(nextWorkspaceId);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
    };
  }, [searchWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    const loadSearchAccounts = async () => {
      if (!searchWorkspaceId) {
        setSearchAccounts([]);
        return;
      }

      try {
        const response = await fetch(`/api/accounts?workspaceId=${encodeURIComponent(searchWorkspaceId)}`);
        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json();
        const items = Array.isArray(payload.accounts) ? (payload.accounts as SidebarSearchAccount[]) : [];
        if (!cancelled) {
          setSearchAccounts(items);
        }
      } catch {
        if (!cancelled) {
          setSearchAccounts([]);
        }
      }
    };

    void loadSearchAccounts();

    return () => {
      cancelled = true;
    };
  }, [searchWorkspaceId]);

  const normalizedSearchQuery = normalizeSidebarSearch(searchQuery);
  const shouldShowSearchResults = isSearchOpen || normalizedSearchQuery.length > 0;
  const pageSearchResults = useMemo<SidebarSearchResult[]>(() => {
    const matches = normalizedSearchQuery
      ? sidebarSearchPages.filter((entry) => {
          const haystack = [entry.title, entry.detail, ...entry.terms].join(" ").toLowerCase();
          return haystack.includes(normalizedSearchQuery);
        })
      : sidebarSearchPages;

    return matches.slice(0, normalizedSearchQuery ? 6 : 5).map((entry) => ({
      key: `page:${entry.key}`,
      title: entry.title,
      detail: entry.detail,
      href: entry.href,
      icon: entry.icon,
    }));
  }, [normalizedSearchQuery]);

  const accountSearchResults = useMemo<SidebarSearchResult[]>(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    return searchAccounts
      .filter((account) => getSidebarSearchBlob(account).includes(normalizedSearchQuery))
      .sort((left, right) => {
        const leftExact = getSidebarSearchBlob(left).startsWith(normalizedSearchQuery);
        const rightExact = getSidebarSearchBlob(right).startsWith(normalizedSearchQuery);
        if (leftExact !== rightExact) {
          return leftExact ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, 6)
      .map((account) => ({
        key: `account:${account.id}`,
        title: account.name,
        detail:
          account.institution ||
          (account.type === "investment"
            ? [account.investmentSubtype, account.investmentSymbol].filter(Boolean).join(" ") || "Investment account"
            : "Account"),
        href: `/accounts?q=${encodeURIComponent(searchQuery.trim())}`,
        icon: account.type === "investment" ? "investments" : "accounts",
        badge: account.balance && account.balance !== "0" ? `PHP ${Number(account.balance).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined,
      }));
  }, [normalizedSearchQuery, searchAccounts, searchQuery]);

  const shouldShowTickerLookup = useMemo(() => {
    if (!normalizedSearchQuery || searchPlanTier !== "pro" || accountSearchResults.length > 0) {
      return false;
    }

    return /^[a-z0-9.\-]{2,10}$/i.test(searchQuery.trim());
  }, [accountSearchResults.length, normalizedSearchQuery, searchPlanTier, searchQuery]);

  useEffect(() => {
    let cancelled = false;

    const loadTicker = () => {
      if (!shouldShowTickerLookup) {
        setSearchTicker(null);
        setSearchTickerLoading(false);
        return;
      }

      setSearchTickerLoading(true);
      const symbol = searchQuery.trim().toUpperCase();
      const handle = window.setTimeout(async () => {
        try {
          const response = await fetch(`/api/market-history?symbol=${encodeURIComponent(symbol)}&market=ph&range=1Y`);
          if (!response.ok || cancelled) {
            return;
          }

          const payload = (await response.json()) as Partial<SidebarSearchMarket> & { error?: string };
          if (payload && typeof payload.symbol === "string" && payload.latest && typeof payload.latest.value === "number") {
            setSearchTicker({
              symbol: payload.symbol,
              market: payload.market === "us" ? "us" : "ph",
              latest: { value: payload.latest.value },
              change: typeof payload.change === "number" ? payload.change : 0,
              changePercent: typeof payload.changePercent === "number" ? payload.changePercent : 0,
            });
          } else {
            setSearchTicker(null);
          }
        } catch {
          if (!cancelled) {
            setSearchTicker(null);
          }
        } finally {
          if (!cancelled) {
            setSearchTickerLoading(false);
          }
        }
      }, 180);

      return () => {
        window.clearTimeout(handle);
      };
    };

    const cleanup = loadTicker();

    return () => {
      cancelled = true;
      if (typeof cleanup === "function") {
        cleanup();
      }
    };
  }, [searchQuery, shouldShowTickerLookup]);

  const tickerSearchResult = useMemo<SidebarSearchResult | null>(() => {
    if (!searchTicker) {
      return null;
    }

    return {
      key: `ticker:${searchTicker.symbol}:${searchTicker.market}`,
      title: `${searchTicker.symbol} ticker`,
      detail:
        searchTicker.market === "ph"
          ? `PH market • ${formatSidebarMoney.format(searchTicker.latest.value)}`
          : `US market • ${formatSidebarMoney.format(searchTicker.latest.value)}`,
      href: `/investments?q=${encodeURIComponent(searchTicker.symbol)}`,
      icon: "investments",
      badge:
        searchTicker.change === 0
          ? "Flat"
          : `${searchTicker.change > 0 ? "+" : ""}${searchTicker.changePercent.toFixed(2)}%`,
    };
  }, [searchTicker]);

  const searchResults = useMemo(() => {
    if (!normalizedSearchQuery) {
      return {
        pages: pageSearchResults,
        accounts: [],
        ticker: null,
        hasAnyResults: pageSearchResults.length > 0,
      };
    }

    const ticker = tickerSearchResult && shouldShowTickerLookup ? tickerSearchResult : null;
    const hasAnyResults = pageSearchResults.length > 0 || accountSearchResults.length > 0 || Boolean(ticker);
    return {
      pages: pageSearchResults,
      accounts: accountSearchResults,
      ticker,
      hasAnyResults,
    };
  }, [accountSearchResults, normalizedSearchQuery, pageSearchResults, shouldShowTickerLookup, tickerSearchResult]);

  const navigateSearchResult = (href: string) => {
    setIsSearchOpen(false);
    setSearchQuery("");
    router.push(href);
  };

  const firstSearchHref =
    accountSearchResults[0]?.href ??
    searchResults.ticker?.href ??
    pageSearchResults[0]?.href ??
    "/dashboard";

  const notificationCount = notifications.length;
  const handleSignOut = () => {
    persistSelectedWorkspaceId("");
    clearAllWorkspaceCaches();
    void signOut({
      redirectUrl: "/",
    }).catch(() => {
      window.location.assign("/");
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
            <img className="brand-mark brand-mark--sidebar" src="/clover-mark.svg" alt="" aria-hidden="true" />
            <img className="brand-wordmark brand-wordmark--sidebar" src="/clover-name-teal.svg" alt="Clover" />
          </Link>
        </div>

        <div className="sidebar-search-wrap" ref={searchWrapRef}>
          <label className="sidebar-search" htmlFor="sidebar-search">
            <span className="sr-only">Search Clover</span>
            <input
              id="sidebar-search"
              type="search"
              placeholder="Search Clover"
              value={searchQuery}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setIsSearchOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  navigateSearchResult(firstSearchHref);
                }
              }}
            />
          </label>

          {shouldShowSearchResults ? (
            <div className="sidebar-search-results" ref={searchResultsRef}>
              {searchTickerLoading ? (
                <div className="sidebar-search-results__empty">Searching Clover...</div>
              ) : searchResults.hasAnyResults ? (
                <>
                  {searchResults.pages.length > 0 ? (
                    <div className="sidebar-search-results__group">
                      <div className="sidebar-search-results__label">Pages</div>
                      {searchResults.pages.map((result) => (
                        <button
                          key={result.key}
                          type="button"
                          className="sidebar-search-results__item"
                          onClick={() => navigateSearchResult(result.href)}
                        >
                          <span className="sidebar-search-results__icon" aria-hidden="true">
                            <MenuIcon name={result.icon} />
                          </span>
                          <span className="sidebar-search-results__copy">
                            <strong>{result.title}</strong>
                            <span>{result.detail}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {searchResults.accounts.length > 0 ? (
                    <div className="sidebar-search-results__group">
                      <div className="sidebar-search-results__label">Accounts</div>
                      {searchResults.accounts.map((result) => (
                        <button
                          key={result.key}
                          type="button"
                          className="sidebar-search-results__item"
                          onClick={() => navigateSearchResult(result.href)}
                        >
                          <span className="sidebar-search-results__icon" aria-hidden="true">
                            <MenuIcon name={result.icon} />
                          </span>
                          <span className="sidebar-search-results__copy">
                            <strong>{result.title}</strong>
                            <span>{result.detail}</span>
                          </span>
                          {result.badge ? <span className="sidebar-search-results__badge">{result.badge}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {searchResults.ticker ? (
                    <div className="sidebar-search-results__group">
                      <div className="sidebar-search-results__label">Markets</div>
                      <button
                        type="button"
                        className="sidebar-search-results__item"
                        onClick={() => navigateSearchResult(searchResults.ticker!.href)}
                      >
                        <span className="sidebar-search-results__icon" aria-hidden="true">
                          <MenuIcon name="investments" />
                        </span>
                        <span className="sidebar-search-results__copy">
                          <strong>{searchResults.ticker.title}</strong>
                          <span>{searchResults.ticker.detail}</span>
                        </span>
                        {searchResults.ticker.badge ? <span className="sidebar-search-results__badge">{searchResults.ticker.badge}</span> : null}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="sidebar-search-results__empty">
                  No matches yet. Try an account, page, or ticker.
                </div>
              )}
            </div>
          ) : null}
        </div>

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
            ref={profileButtonRef}
            className={`sidebar-profile${profileImage ? " sidebar-profile--photo" : ""}${isProfileActive || isProfileMenuOpen ? " is-active" : ""}`}
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
            {profileImage ? (
              <img className="sidebar-profile__photo" src={profileImage} alt="" aria-hidden="true" />
            ) : (
              <span className="sidebar-profile__avatar" aria-hidden="true" style={{ backgroundColor: profileBackground }}>
                <span>{profileInitial}</span>
              </span>
            )}
            <span className="sr-only">{displayName}</span>
          </button>
          <button
            ref={notificationsButtonRef}
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
            <div ref={profilePopoverRef} className="sidebar-popover sidebar-popover--profile" role="menu" aria-label="Profile menu">
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
            <div ref={notificationsPopoverRef} className="sidebar-popover sidebar-popover--notifications" role="menu" aria-label="Notifications">
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

      <nav className="mobile-nav glass" aria-label="Quick navigation">
        {mobileNavItems.map((item) => (
          <Link
            key={item.key}
            className={`mobile-nav__item ${active === item.key ? "is-active" : ""}`}
            href={item.href}
            aria-current={active === item.key ? "page" : undefined}
            prefetch={false}
          >
            <span className="mobile-nav__icon" aria-hidden="true">
              <MenuIcon name={item.key} />
            </span>
            <span className="mobile-nav__label">{item.label}</span>
          </Link>
        ))}
        <button
          className="mobile-nav__item mobile-nav__item--button"
          type="button"
          aria-label="Open more navigation"
          aria-expanded={isSidebarOpen}
          aria-controls="primary-navigation"
          onClick={() => {
            setOpenMenu(null);
            setIsSidebarOpen(true);
          }}
        >
          <span className="mobile-nav__icon" aria-hidden="true">
            <MenuIcon name="more" />
          </span>
          <span className="mobile-nav__label">More</span>
        </button>
      </nav>
    </div>
  );
}

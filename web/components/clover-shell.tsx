"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { persistSelectedWorkspaceId, readSelectedWorkspaceId, syncSelectedWorkspaceCookie } from "@/lib/workspace-selection";
import { clearAllWorkspaceCaches, clearLegacyWorkspaceCaches } from "@/lib/workspace-cache";
import { getAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";
import { DashboardManualTransactionModal } from "@/components/dashboard-top-actions";
import { ImportFilesModal } from "@/components/import-files-modal";

type CloverChromeActions = {
  closeChrome: () => void;
};

const CloverChromeContext = createContext<CloverChromeActions | null>(null);

export const useCloverChrome = () => {
  const context = useContext(CloverChromeContext);

  if (!context) {
    return {
      closeChrome: () => {},
    };
  }

  return context;
};

type CloverShellProps = {
  active:
  | "dashboard"
  | "accounts"
  | "investments"
  | "split-bill"
  | "transactions"
  | "recurring"
  | "reports"
  | "insights"
  | "goals"
  | "more"
  | "settings"
  | "profile"
  | "notifications"
  | "admin";
  title: string;
  kicker?: string;
  subtitle?: string;
  titleAddon?: ReactNode;
  actions?: ReactNode;
  showTopbar?: boolean;
  hideCompactBarCopyOnMobile?: boolean;
  hideCompactBarKickerAndSubtitleOnMobile?: boolean;
  children: ReactNode;
};

type SidebarSearchAccount = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  balance: string | null;
  currency: string | null;
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
    title: "Home",
    href: "/home",
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
    key: "recurring",
    title: "Recurring",
    href: "/recurring",
    icon: "recurring",
    detail: "Upcoming payments, reminders, and repeating costs.",
    terms: ["recurring", "scheduled", "upcoming", "payments", "bills", "reminders", "loans"],
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
    key: "split-bill",
    title: "Split Bills",
    href: "/split-bill",
    icon: "split-bill",
    detail: "Share receipts and settle balances.",
    terms: ["split bill", "split bill", "splitwise", "receipt split", "shared bill", "bill split"],
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
  {
    key: "settings",
    title: "Settings",
    href: "/settings",
    icon: "settings",
    detail: "Theme, data, account, and billing options.",
    terms: ["settings", "preferences", "account", "billing", "theme", "data"],
  },
  {
    key: "help",
    title: "Help",
    href: "/help",
    icon: "help",
    detail: "Guides for setup, pricing, safety, and storage.",
    terms: ["help", "support", "guide", "setup", "pricing", "security", "storage"],
  },
  {
    key: "admin-home",
    title: "Admin",
    href: "/admin",
    icon: "settings",
    detail: "Command center and repository.",
    terms: ["admin", "command center", "repository", "ops"],
  },
  {
    key: "admin-users",
    title: "User Management",
    href: "/admin/users",
    icon: "settings",
    detail: "Production users, tiers, and limits.",
    terms: ["user management", "users", "tiers", "limits", "admin users"],
  },
  {
    key: "admin-analytics",
    title: "Analytics",
    href: "/admin/analytics",
    icon: "reports",
    detail: "Trends across users, QA, errors, and support.",
    terms: ["admin analytics", "analytics", "trends"],
  },
  {
    key: "admin-data-qa",
    title: "Data QA",
    href: "/admin/data-qa",
    icon: "reports",
    detail: "Parser coverage and bank testing.",
    terms: ["data qa", "qa", "parser", "bank summary"],
  },
  {
    key: "admin-errors",
    title: "Error Logs",
    href: "/admin/errors",
    icon: "reports",
    detail: "Production error history and build ids.",
    terms: ["error logs", "errors", "production errors", "build ids"],
  },
  {
    key: "inquiries",
    title: "Inquiries",
    href: "/admin/inquiries",
    icon: "help",
    detail: "Customer messages and support requests.",
    terms: ["inquiries", "contact us", "support inbox", "customer messages", "questions", "concerns"],
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

const formatSidebarMoney = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "MIXED");

const navItems = [
  { href: "/home", label: "Home", key: "dashboard" as const },
  { href: "/accounts", label: "Accounts", key: "accounts" as const },
  { href: "/transactions", label: "Transactions", key: "transactions" as const },
  { href: "/recurring", label: "Recurring", key: "recurring" as const },
  { href: "/split-bill", label: "Split Bills", key: "split-bill" as const },
  { href: "/more", label: "More", key: "more" as const },
];

type IconName =
  | "dashboard"
  | "accounts"
  | "investments"
  | "split-bill"
  | "transactions"
  | "recurring"
  | "reports"
  | "insights"
  | "goals"
  | "menu"
  | "chevron-left"
  | "search"
  | "more"
  | "plus"
  | "notifications"
  | "profile"
  | "settings"
  | "help"
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
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case "chevron-left":
      return (
        <svg {...common}>
          <path d="m15 6-6 6 6 6" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
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
    case "help":
      return (
        <svg {...common}>
          <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-.9.6-1.5 1.2-1.5 2.5" />
          <path d="M12 17h.01" />
          <circle cx="12" cy="12" r="8.5" />
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
    case "split-bill":
      return (
        <svg {...common}>
          <rect x="5" y="4.5" width="14" height="7.5" rx="2" />
          <rect x="7" y="12" width="12" height="7.5" rx="2" />
          <path d="M8.5 8h7" />
          <path d="M10 15.5h7" />
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
    case "recurring":
      return (
        <svg {...common}>
          <path d="M7.4 8.5A7 7 0 0 1 12 5.8c2.3 0 4.4 1 5.9 2.7" />
          <path d="M16.8 5.8h1.1v4.1" />
          <path d="M17.9 5.8 15.7 8" />
          <path d="M16.6 15.5A7 7 0 0 1 12 18.2c-2.3 0-4.4-1-5.9-2.7" />
          <path d="M7.2 18.2H6.1v-4.1" />
          <path d="M6.1 18.2 8.3 16" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 12V4" />
          <path d="M12 12l6.9 4" />
          <path d="M12 12l-6.9 4" />
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

const notifications = [
  {
    title: "Import finished",
    href: "/review",
  },
  {
    title: "Transactions need attention",
    href: "/transactions?review=1",
  },
  {
    title: "Weekly summary",
    href: "/reports",
  },
];

export function CloverShell({
  active,
  title,
  kicker,
  subtitle,
  titleAddon,
  actions,
  showTopbar = true,
  hideCompactBarCopyOnMobile = false,
  hideCompactBarKickerAndSubtitleOnMobile = false,
  children,
}: CloverShellProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);
  const profileButtonRef = useRef<HTMLButtonElement | null>(null);
  const profilePopoverRef = useRef<HTMLDivElement | null>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationsPopoverRef = useRef<HTMLDivElement | null>(null);
  const quickAddButtonRef = useRef<HTMLButtonElement | null>(null);
  const quickAddPopoverRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<"notifications" | "profile" | "more" | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddModal, setQuickAddModal] = useState<"transaction" | "import" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchWorkspaceId, setSearchWorkspaceId] = useState(() => readSelectedWorkspaceId());
  const [searchAccounts, setSearchAccounts] = useState<SidebarSearchAccount[]>([]);
  const [searchPlanTier, setSearchPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [searchTicker, setSearchTicker] = useState<SidebarSearchMarket | null>(null);
  const [searchTickerLoading, setSearchTickerLoading] = useState(false);
  const [previousPathname, setPreviousPathname] = useState<string | null>(null);
  const quickAddAccounts = useMemo(
    () =>
      searchAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        institution: account.institution,
        type: account.type,
        currency: account.currency ?? "PHP",
      })),
    [searchAccounts]
  );
  const displayName = user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "Account";
  const profileImage = user?.imageUrl ?? null;
  const isProfileActive = active === "profile" || pathname?.startsWith("/profile");
  const isMoreActive = active === "more" || pathname?.startsWith("/more");
  const isNotificationsActive = openMenu === "notifications";
  const isProfileMenuOpen = openMenu === "profile";
  const isMoreMenuOpen = openMenu === "more";
  const shouldShowBackButton =
    !!previousPathname &&
    !pathname?.startsWith("/home") &&
    previousPathname !== "/home" &&
    previousPathname !== pathname;
  const closeChrome = () => {
    setOpenMenu(null);
    setIsSearchOpen(false);
    setIsSidebarOpen(false);
  };

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

      if (
        isQuickAddOpen &&
        !quickAddButtonRef.current?.contains(target) &&
        !quickAddPopoverRef.current?.contains(target)
      ) {
        setIsQuickAddOpen(false);
      }

      if (openMenu === "more" && !shellRef.current.querySelector(".sidebar-nav__more")?.contains(target)) {
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
  }, [pathname, isSearchOpen, openMenu, isQuickAddOpen]);

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
    setOpenMenu(null);
    setIsSearchOpen(false);
    setSearchQuery("");
    setIsQuickAddOpen(false);
    setQuickAddModal(null);
  }, [pathname]);

  useEffect(() => {
    const prefetchTargets = ["/home", "/transactions", "/split-bill", "/more", "/settings"];

    for (const href of prefetchTargets) {
      void router.prefetch(href);
    }
  }, [router, pathname]);

  useEffect(() => {
    if (!pathname || typeof window === "undefined") {
      return;
    }

    const storageKey = "clover:last-internal-pathname";
    const lastPathname = window.sessionStorage.getItem(storageKey);

    if (lastPathname && lastPathname !== pathname) {
      setPreviousPathname(lastPathname);
    } else if (!lastPathname) {
      setPreviousPathname(null);
    }

    window.sessionStorage.setItem(storageKey, pathname);
  }, [pathname]);

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

  useEffect(() => {
    const reloadOnceForChunkFailure = () => {
      const storageKey = "clover.chunk-reload.v1";
      if (window.sessionStorage.getItem(storageKey) === "1") {
        return;
      }

      window.sessionStorage.setItem(storageKey, "1");
      window.location.reload();
    };

    const shouldReload = (message: string) =>
      /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i.test(message);

    const handleError = (event: ErrorEvent) => {
      const message = [event.message, event.error instanceof Error ? event.error.message : ""].join(" ");
      if (shouldReload(message)) {
        reloadOnceForChunkFailure();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? reason.message
            : typeof reason === "object" && reason !== null && "message" in reason
              ? String((reason as { message?: unknown }).message ?? "")
              : "";

      if (shouldReload(message)) {
        reloadOnceForChunkFailure();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

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
        badge:
          account.balance && account.balance !== "0"
            ? formatSidebarMoney(Number(account.balance), account.currency)
            : undefined,
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
          ? `PH market • ${formatSidebarMoney(searchTicker.latest.value, "PHP")}`
          : `US market • ${formatSidebarMoney(searchTicker.latest.value, "USD")}`,
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
    "/home";

  const notificationCount = notifications.length;
  const navigateTo = (href: string) => {
    closeChrome();
    router.push(href);
  };

  const prefetchNavTarget = (href: string) => {
    void router.prefetch(href);
  };

  const openQuickAddTransaction = () => {
    setIsQuickAddOpen((current) => !current);
  };

  const closeQuickAddModal = () => {
    setQuickAddModal(null);
  };

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
    <CloverChromeContext.Provider value={{ closeChrome }}>
      <div className={`app-shell ${isSidebarOpen ? "is-sidebar-open" : ""}`} ref={shellRef}>
      <div
        className="sidebar-backdrop"
        role="presentation"
        hidden={!isSidebarOpen}
        onClick={() => setIsSidebarOpen(false)}
      />
      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar-header">
          <button
            type="button"
            aria-label="Clover home"
            aria-current={pathname === "/home" ? "page" : undefined}
            className="sidebar-brand-link sidebar-brand-link--centered"
            onClick={() => {
              if (pathname !== "/home") {
                navigateTo("/home");
              }
            }}
          >
            <img src="/clover-mark.svg" alt="" aria-hidden="true" className="sidebar-brand-link__mark" />
            <img src="/clover-name-teal.svg" alt="Clover" className="sidebar-brand-link__wordmark" />
          </button>
        </div>

        <div className="sidebar-search-wrap" ref={searchWrapRef}>
          <button
            className="sidebar-search-trigger"
            type="button"
            aria-label={isSearchOpen ? "Close search" : "Open search"}
            aria-expanded={isSearchOpen}
            aria-controls="sidebar-search-panel"
            onClick={() => setIsSearchOpen((current) => !current)}
          >
            <MenuIcon name="search" />
          </button>

          {shouldShowSearchResults ? (
            <div className="sidebar-search-panel" id="sidebar-search-panel">
              <label className="sidebar-search" htmlFor="sidebar-search">
                <span className="sr-only">Search Clover</span>
                <input
                  id="sidebar-search"
                  type="search"
                  placeholder="Search Clover"
                  value={searchQuery}
                  autoComplete="off"
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
            </div>
          ) : null}
        </div>

        <nav className="sidebar-nav" aria-label="Primary" id="primary-navigation">
          {navItems.map((item) => {
            if (item.key === "more") {
              return (
                <div key={item.key} className="sidebar-nav__more">
                  <button
                    className={`nav-link ${isMoreActive || isMoreMenuOpen ? "is-active" : ""}`}
                    type="button"
                    aria-current={pathname?.startsWith("/more") ? "page" : undefined}
                    aria-haspopup="menu"
                    aria-expanded={isMoreMenuOpen}
                    onClick={() =>
                      setOpenMenu((current) => {
                        if (current === "more") {
                          return null;
                        }

                        return "more";
                      })
                    }
                  >
                    <span className="nav-link__icon" aria-hidden="true">
                      <MenuIcon name={item.key} />
                    </span>
                    {item.label}
                  </button>

                  {isMoreMenuOpen ? (
                    <div className="sidebar-nav__submenu" role="menu" aria-label="More products">
                      <button
                        className={`sidebar-nav__submenu-link${active === "investments" || pathname?.startsWith("/investments") ? " is-active" : ""}`}
                        type="button"
                        role="menuitem"
                        onClick={() => navigateTo("/investments")}
                      >
                        <span className="sidebar-nav__submenu-icon" aria-hidden="true">
                          <MenuIcon name="investments" />
                        </span>
                        Investments
                      </button>
                      <button
                        className={`sidebar-nav__submenu-link${active === "reports" || pathname?.startsWith("/reports") ? " is-active" : ""}`}
                        type="button"
                        role="menuitem"
                        onClick={() => navigateTo("/reports")}
                      >
                        <span className="sidebar-nav__submenu-icon" aria-hidden="true">
                          <MenuIcon name="reports" />
                        </span>
                        Reports
                      </button>
                      <button
                        className={`sidebar-nav__submenu-link${active === "insights" || pathname?.startsWith("/insights") ? " is-active" : ""}`}
                        type="button"
                        role="menuitem"
                        onClick={() => navigateTo("/insights")}
                      >
                        <span className="sidebar-nav__submenu-icon" aria-hidden="true">
                          <MenuIcon name="insights" />
                        </span>
                        Insights
                      </button>
                      <button
                        className={`sidebar-nav__submenu-link${active === "goals" || pathname?.startsWith("/goals") ? " is-active" : ""}`}
                        type="button"
                        role="menuitem"
                        onClick={() => navigateTo("/goals")}
                      >
                        <span className="sidebar-nav__submenu-icon" aria-hidden="true">
                          <MenuIcon name="goals" />
                        </span>
                        Goals
                      </button>
                      <button
                        className={`sidebar-nav__submenu-link${pathname?.startsWith("/help") ? " is-active" : ""}`}
                        type="button"
                        role="menuitem"
                        onClick={() => navigateTo("/help")}
                      >
                        <span className="sidebar-nav__submenu-icon" aria-hidden="true">
                          <MenuIcon name="help" />
                        </span>
                        Help
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <button
                key={item.key}
                className={`nav-link ${active === item.key ? "is-active" : ""}`}
                type="button"
                aria-current={active === item.key ? "page" : undefined}
                onClick={() => navigateTo(item.href)}
              >
                <span className="nav-link__icon" aria-hidden="true">
                  <MenuIcon name={item.key} />
                </span>
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            ref={profileButtonRef}
            className={`sidebar-profile${profileImage ? " sidebar-profile--photo" : ""}${isProfileActive || isProfileMenuOpen ? " is-active" : ""}`}
            type="button"
            aria-label={`Open ${displayName} account menu`}
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
              <span className="sidebar-profile__avatar" aria-hidden="true" style={getAvatarBackgroundStyle(displayName)}>
                <span style={{ color: "#fff" }}>{getAvatarInitials(displayName)}</span>
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
            <div ref={profilePopoverRef} className="sidebar-popover sidebar-popover--profile" role="menu" aria-label="Account menu">
              <div className="sidebar-popover__head">
                <span className="sidebar-popover__title">{displayName}</span>
              </div>
              <div className="sidebar-popover__links sidebar-popover__links--bare">
                <Link
                  className="sidebar-popover__link sidebar-popover__button sidebar-popover__link--bare"
                  href="/settings"
                  prefetch
                  onClick={closeChrome}
                  onMouseEnter={() => prefetchNavTarget("/settings")}
                  onTouchStart={() => prefetchNavTarget("/settings")}
                  role="menuitem"
                >
                  <span className="sidebar-popover__link-icon" aria-hidden="true">
                    <MenuIcon name="settings" />
                  </span>
                  <span>Settings</span>
                </Link>
                <div className="sidebar-popover__separator" aria-hidden="true" />
                <button
                  className="sidebar-popover__link sidebar-popover__button sidebar-popover__button--danger sidebar-popover__link--bare"
                  type="button"
                  onClick={handleSignOut}
                  role="menuitem"
                >
                  <span className="sidebar-popover__link-icon" aria-hidden="true">
                    <MenuIcon name="sign-out" />
                  </span>
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          ) : null}

          {isNotificationsActive ? (
            <div ref={notificationsPopoverRef} className="sidebar-popover sidebar-popover--notifications" role="menu" aria-label="Notifications">
              <div className="sidebar-popover__head">
                <span className="sidebar-popover__title">Notifications</span>
              </div>
              <div className="sidebar-popover__items">
                {notifications.length ? (
                  notifications.map((notification) => (
                    <Link
                      key={notification.title}
                      href={notification.href}
                      className="sidebar-popover__item sidebar-popover__notification-link"
                      role="menuitem"
                      prefetch
                      onClick={closeChrome}
                      onMouseEnter={() => prefetchNavTarget(notification.href)}
                      onTouchStart={() => prefetchNavTarget(notification.href)}
                    >
                      <span className="sidebar-popover__notification-title">{notification.title}</span>
                    </Link>
                  ))
                ) : (
                  <div className="sidebar-popover__empty">You’re all caught up.</div>
                )}
              </div>
            </div>
          ) : null}
        </div>

      </aside>

      <button
        ref={quickAddButtonRef}
        className="shell-quick-add-button"
        type="button"
        aria-label={isQuickAddOpen ? "Close quick add" : "Open quick add"}
        title={isQuickAddOpen ? "Close quick add" : "Open quick add"}
        onClick={openQuickAddTransaction}
      >
        <MenuIcon name="plus" />
      </button>
      {isQuickAddOpen ? (
        <div className="shell-quick-add-popover glass" ref={quickAddPopoverRef} role="menu" aria-label="Quick add">
          <button
            className="shell-quick-add-popover__item"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsQuickAddOpen(false);
              setQuickAddModal("transaction");
            }}
          >
            <strong>Add Transaction</strong>
            <span>Open the manual transaction field.</span>
          </button>
          <button
            className="shell-quick-add-popover__item"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsQuickAddOpen(false);
              setQuickAddModal("import");
            }}
          >
            <strong>Import Files</strong>
            <span>Upload statements, CSVs, and screenshots.</span>
          </button>
        </div>
      ) : null}

      {quickAddModal === "transaction" && searchWorkspaceId ? (
        <DashboardManualTransactionModal workspaceId={searchWorkspaceId} accounts={quickAddAccounts} onClose={closeQuickAddModal} />
      ) : null}

      {quickAddModal === "import" && searchWorkspaceId ? (
        <ImportFilesModal
          open
          workspaceId={searchWorkspaceId}
          accounts={quickAddAccounts}
          defaultAccountId={quickAddAccounts.find((account) => account.type !== "cash" && account.type !== "other" && account.type !== "investment")?.id ?? quickAddAccounts[0]?.id ?? null}
          onClose={closeQuickAddModal}
          onImported={async () => {
            router.refresh();
            closeQuickAddModal();
          }}
        />
      ) : null}

      <nav className="shell-bottom-nav glass" aria-label="Primary mobile navigation">
        <Link
          className={`shell-bottom-nav__item${active === "dashboard" || pathname?.startsWith("/home") ? " is-active" : ""}`}
          aria-current={active === "dashboard" || pathname?.startsWith("/home") ? "page" : undefined}
          href="/home"
          prefetch
          onMouseEnter={() => prefetchNavTarget("/home")}
          onTouchStart={() => prefetchNavTarget("/home")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="dashboard" />
          </span>
          <span className="shell-bottom-nav__label">Home</span>
        </Link>
        <Link
          className={`shell-bottom-nav__item${active === "transactions" || pathname?.startsWith("/transactions") ? " is-active" : ""}`}
          aria-current={active === "transactions" || pathname?.startsWith("/transactions") ? "page" : undefined}
          href="/transactions"
          prefetch
          onMouseEnter={() => prefetchNavTarget("/transactions")}
          onTouchStart={() => prefetchNavTarget("/transactions")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="transactions" />
          </span>
          <span className="shell-bottom-nav__label">Transactions</span>
        </Link>
        <button
          ref={quickAddButtonRef}
          className="shell-bottom-nav__add"
          type="button"
          aria-label={isQuickAddOpen ? "Close quick add" : "Open quick add"}
          title={isQuickAddOpen ? "Close quick add" : "Open quick add"}
          onClick={openQuickAddTransaction}
        >
          <MenuIcon name="plus" />
        </button>
        <Link
          className={`shell-bottom-nav__item${active === "split-bill" || pathname?.startsWith("/split-bill") ? " is-active" : ""}`}
          aria-current={active === "split-bill" || pathname?.startsWith("/split-bill") ? "page" : undefined}
          href="/split-bill"
          prefetch
          onMouseEnter={() => prefetchNavTarget("/split-bill")}
          onTouchStart={() => prefetchNavTarget("/split-bill")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="split-bill" />
          </span>
          <span className="shell-bottom-nav__label">Split Bills</span>
        </Link>
        <Link
          className={`shell-bottom-nav__item${isMoreActive ? " is-active" : ""}`}
          aria-current={isMoreActive ? "page" : undefined}
          href="/more"
          prefetch
          onMouseEnter={() => prefetchNavTarget("/more")}
          onTouchStart={() => prefetchNavTarget("/more")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="more" />
          </span>
          <span className="shell-bottom-nav__label">More</span>
        </Link>
      </nav>

      <main
        className="content"
        onClickCapture={() => {
          if (isSidebarOpen) {
            setIsSidebarOpen(false);
          }
        }}
      >
        {!showTopbar ? (
          <div className="shell-compact-bar glass">
            {shouldShowBackButton ? (
              <button
                className="shell-back-button"
                type="button"
                aria-label="Go back"
                onClick={() => {
                  closeChrome();
                  router.back();
                }}
              >
                <MenuIcon name="chevron-left" />
              </button>
            ) : (
              <button
                className="shell-menu-button"
                type="button"
                aria-label="Open menu"
                aria-expanded={isSidebarOpen}
                aria-controls="primary-navigation"
                onClick={() => {
                  setOpenMenu(null);
                  setIsSidebarOpen((current) => !current);
                }}
              >
                <MenuIcon name="menu" />
              </button>
            )}
            <div
              className={`shell-compact-bar__copy ${hideCompactBarCopyOnMobile ? "shell-compact-bar__copy--hide-mobile" : ""} ${
                hideCompactBarKickerAndSubtitleOnMobile ? "shell-compact-bar__copy--hide-chrome-on-mobile" : ""
              }`}
            >
              {kicker ? <p className="eyebrow">{kicker}</p> : null}
              <div className="topbar__title-row">
                <h1>{title}</h1>
                {titleAddon ? <div className="topbar__title-addon">{titleAddon}</div> : null}
              </div>
              {subtitle ? <p className="topbar-subtitle">{subtitle}</p> : null}
            </div>
            {actions ? <div className="shell-compact-bar__actions">{actions}</div> : null}
          </div>
        ) : null}
        {showTopbar ? (
          <header className="topbar glass">
            {shouldShowBackButton ? (
              <button
                className="shell-back-button"
                type="button"
                aria-label="Go back"
                onClick={() => {
                  closeChrome();
                  router.back();
                }}
              >
                <MenuIcon name="chevron-left" />
              </button>
            ) : null}
            <div className="topbar__title-wrap">
              {kicker ? <p className="eyebrow">{kicker}</p> : null}
              <div className="topbar__title-row">
                <h1>{title}</h1>
                {titleAddon ? <div className="topbar__title-addon">{titleAddon}</div> : null}
              </div>
              {subtitle ? <p className="topbar-subtitle">{subtitle}</p> : null}
            </div>
            <div className="topbar-actions">
              <button
                className="shell-menu-button"
                type="button"
                aria-label="Open menu"
                aria-expanded={isSidebarOpen}
                aria-controls="primary-navigation"
                onClick={() => {
                  setOpenMenu(null);
                  setIsSidebarOpen((current) => !current);
                }}
              >
                <MenuIcon name="menu" />
              </button>
              {actions}
            </div>
          </header>
        ) : null}

        <div className="content-body">{children}</div>
      </main>
      </div>
    </CloverChromeContext.Provider>
  );
}

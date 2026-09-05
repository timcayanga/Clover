"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { formatCurrencyAmount } from "@/lib/currency-format";
import {
  persistSelectedWorkspaceId,
  readSelectedWorkspaceId,
  selectedWorkspaceEventName,
  syncSelectedWorkspaceCookie,
} from "@/lib/workspace-selection";
import { clearAllWorkspaceCaches, clearLegacyWorkspaceCaches } from "@/lib/workspace-cache";
import { signOutToLanding } from "@/lib/sign-out";
import { readAccountIdentityCache, writeAccountIdentityCache } from "@/lib/account-identity-cache";
import {
  getErrorMessage,
  isChunkLoadErrorMessage,
  recoverFromChunkLoadError,
} from "@/lib/chunk-error-recovery";
import { subscribeImportActivity } from "@/lib/import-activity";
import type { ImportImageMode } from "@/lib/import-image-mode";
import { publishImportedSummary } from "@/lib/imported-summary-events";
import {
  getGuidanceMenuPreset,
  isGuidanceMenuVisibility,
  SETTINGS_GUIDANCE_MENU_EVENT,
  SETTINGS_GUIDANCE_MENU_KEY,
  type GuidanceMenuVisibility,
} from "@/lib/guidance-menu";
import { installClientDiagnostics, recordClientDiagnostic } from "@/lib/client-diagnostics";
import { BugReportWidget } from "@/components/bug-report-widget";
import { getNavigationIconSrc, type NavigationIconName } from "@/lib/navigation-icons";
import { OnboardingMissionTracker } from "@/components/onboarding-mission-tracker";
import { RegionalPreferencesSync } from "@/components/regional-preferences-sync";
import { AdviserHeaderLink } from "@/components/adviser-header-link";
import {
  getWorkspaceDataDomainForPath,
  installWorkspaceMutationObserver,
  subscribeWorkspaceDataChanges,
} from "@/lib/workspace-data-sync";
import { clearJsonRequestCache, fetchJsonOnce } from "@/lib/request-dedupe";
import { formatInAppNotificationDateTime, type InAppNotification } from "@/lib/in-app-notifications";
import {
  dismissInAppNotifications,
  inAppNotificationsChangedEvent,
  inAppNotificationsReadEvent,
  loadInAppNotificationFeed,
  markInAppNotificationsRead,
} from "@/lib/in-app-notifications.client";

const loadDashboardManualTransactionModal = () =>
  import("@/components/dashboard-top-actions").then((module) => module.DashboardManualTransactionModal);

const DashboardManualTransactionModal = dynamic(
  loadDashboardManualTransactionModal,
  { ssr: false }
);

const loadImportFilesModal = () =>
  import("@/components/import-files-modal").then((module) => module.ImportFilesModal);

const ImportFilesModal = dynamic(
  loadImportFilesModal,
  { ssr: false }
);

type CloverChromeActions = {
  closeChrome: () => void;
  setMobileOverlayChrome: (chrome: { title: string; onBack: () => void } | null) => void;
};

const CloverChromeContext = createContext<CloverChromeActions | null>(null);

export const useCloverChrome = () => {
  const context = useContext(CloverChromeContext);

  if (!context) {
    return {
      closeChrome: () => {},
      setMobileOverlayChrome: () => {},
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
  | "circles"
  | "transactions"
  | "recurring"
  | "reports"
  | "adviser"
  | "goals"
  | "budgeting"
  | "more"
  | "settings"
  | "profile"
  | "notifications"
  | "admin";
  title: string;
  kicker?: string;
  subtitle?: string;
  titleAddon?: ReactNode;
  mobileSubheader?: ReactNode;
  desktopTitleAction?: ReactNode;
  actions?: ReactNode;
  mobileLeadingAction?: ReactNode;
  showTopbar?: boolean;
  mobileBackHref?: string;
  hideCompactBarCopyOnMobile?: boolean;
  hideCompactBarKickerAndSubtitleOnMobile?: boolean;
  workspaceId?: string;
  children: ReactNode;
};

type MobileShellGesture = {
  kind: "idle" | "pull-refresh" | "open-sidebar" | "close-sidebar";
  startX: number;
  startY: number;
  pullDistance: number;
};

const MOBILE_SHELL_BREAKPOINT = "(max-width: 1100px)";
const MOBILE_EDGE_SWIPE_WIDTH = 24;
const MOBILE_SIDEBAR_SWIPE_THRESHOLD = 64;
const MOBILE_PULL_REFRESH_THRESHOLD = 54;
const MOBILE_PULL_REFRESH_MAX_DISTANCE = 96;
export const cloverPullToRefreshEvent = "clover:pull-to-refresh";

const idleMobileShellGesture = (): MobileShellGesture => ({
  kind: "idle",
  startX: 0,
  startY: 0,
  pullDistance: 0,
});

const isMobileGestureBlockedTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest([
    "input",
    "textarea",
    "select",
    "a",
    "[contenteditable='true']",
    "[role='dialog']",
    "[data-mobile-gesture-lock]",
    ".animated-tabs",
    ".recurring-calendar__grid",
    ".mobile-swipe-delete",
  ].join(",")));

const getGestureScrollTop = (target: EventTarget | null) => {
  let element = target instanceof Element ? target : null;

  while (element && element !== document.documentElement) {
    const style = window.getComputedStyle(element);
    const canScrollVertically = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    if (canScrollVertically) return element.scrollTop;
    element = element.parentElement;
  }

  return window.scrollY || document.scrollingElement?.scrollTop || 0;
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
    detail: "Banks, cash, and linked accounts.",
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
    key: "circles",
    title: "Circles",
    href: "/circles",
    icon: "circles",
    detail: "Shared expenses, budgets, goals, and commitments.",
    terms: ["circles", "household", "couple", "family", "barkada", "shared money", "group finance"],
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
    detail: "Charts, cash flow, spending, and trends.",
    terms: ["reports", "charts", "cash flow", "spending", "trends", "analysis"],
  },
  {
    key: "adviser",
    title: "Adviser",
    href: "/adviser",
    icon: "adviser",
    detail: "Proactive guidance and coaching.",
    terms: ["adviser", "advice", "analysis", "trend", "goal", "coach"],
  },
  {
    key: "investments",
    title: "Investments",
    href: "/investments",
    icon: "investments",
    detail: "Portfolio, holdings, and market views.",
    terms: ["investments", "portfolio", "holdings", "stocks", "funds", "market"],
  },
  {
    key: "budgeting",
    title: "Budgeting",
    href: "/budgeting",
    icon: "budgeting",
    detail: "Budgets, pacing, and spending guardrails.",
    terms: ["budgeting", "budget", "limits", "spending plan", "pacing"],
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

const desktopNavSections = [
  {
    label: "Overview",
    items: [
      { href: "/home", label: "Home", key: "dashboard" as const },
    ],
  },
  {
    label: "Understand",
    items: [
      { href: "/reports", label: "Reports", key: "reports" as const },
      { href: "/adviser", label: "Adviser", key: "adviser" as const },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/accounts", label: "Accounts", key: "accounts" as const },
      { href: "/transactions", label: "Transactions", key: "transactions" as const },
      { href: "/recurring", label: "Recurring", key: "recurring" as const },
    ],
  },
  {
    label: "Together",
    items: [
      { href: "/split-bill", label: "Split Bills", key: "split-bill" as const },
      { href: "/circles", label: "Circles", key: "circles" as const },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/budgeting", label: "Budgeting", key: "budgeting" as const },
      { href: "/goals", label: "Goals", key: "goals" as const },
      { href: "/investments", label: "Investments", key: "investments" as const },
    ],
  },
];

const mobileSettingsSections = [
  { href: "/notifications", label: "Notifications", icon: "notifications" as const },
  { href: "/settings", label: "Settings", icon: "settings" as const },
  { href: "/help", label: "Help", icon: "help" as const },
  { href: "/settings/plan", label: "Plan", icon: "settings" as const },
];

const shouldPrefetchNavHref = (_href: string) => true;
type IconName =
  | "dashboard"
  | "accounts"
  | "investments"
  | "split-bill"
  | "circles"
  | "transactions"
  | "recurring"
  | "reports"
  | "adviser"
  | "goals"
  | "budgeting"
  | "menu"
  | "chevron-left"
  | "search"
  | "more"
  | "plus"
  | "upload"
  | "notifications"
  | "profile"
  | "settings"
  | "help"
  | "sign-out";

const MENU_ICON_NAMES: Partial<Record<IconName, NavigationIconName>> = {
  dashboard: "home",
  accounts: "accounts",
  investments: "investments",
  "split-bill": "splitBills",
  circles: "circles",
  transactions: "transactions",
  recurring: "recurring",
  reports: "reports",
  adviser: "adviser",
  budgeting: "budgeting",
  goals: "goals",
  more: "more",
  notifications: "notifications",
  settings: "settings",
  help: "help",
  search: "search",
  profile: "profile",
  "sign-out": "signOut",
};

function MenuIcon({ name, open = false }: { name: IconName; open?: boolean }) {
  const navigationIconName = MENU_ICON_NAMES[name];
  if (navigationIconName) {
    return (
      <img
        src={getNavigationIconSrc(navigationIconName)}
        alt=""
        width={96}
        height={96}
        loading="eager"
        decoding="sync"
        fetchPriority="high"
        draggable={false}
        className={`menu-icon-3d${name === "dashboard" ? " menu-icon-3d--home" : ""}${name === "adviser" ? " menu-icon-3d--adviser" : ""}`}
        aria-hidden="true"
      />
    );
  }

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
        <svg {...common} className={`shell-menu-icon${open ? " is-open" : ""}`}>
          <path className="shell-menu-icon__line shell-menu-icon__line--top" d="M4 7h16" />
          <path className="shell-menu-icon__line shell-menu-icon__line--middle" d="M4 12h16" />
          <path className="shell-menu-icon__line shell-menu-icon__line--bottom" d="M4 17h16" />
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
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V4" />
          <path d="m7 9 5-5 5 5" />
          <path d="M5 20h14" />
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
    case "adviser":
      return (
        <svg {...common}>
          <path d="M9 18h6" />
          <path d="M10 21h4" />
          <path d="M8.8 14.8a5.2 5.2 0 1 1 6.4 0c-.8.6-1.2 1.4-1.2 2.2h-4c0-.8-.4-1.6-1.2-2.2Z" />
          <path d="M18.5 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6Z" />
        </svg>
      );
    case "goals":
      return (
        <svg {...common}>
          <path d="m12 3.5 2.71 5.49 6.06.88-4.39 4.28 1.04 6.03L12 17.98l-5.42 2.85 1.04-6.03-4.39-4.28 6.06-.88L12 3.5Z" />
        </svg>
      );
    case "budgeting":
      return (
        <svg {...common}>
          <path d="M4 18.5h16" />
          <path d="M6.5 15a5.5 5.5 0 0 1 11 0" />
          <path d="M12 9v3.5" />
          <path d="m12 12.5 2.2-2.2" />
        </svg>
      );
  }
}

function NotificationCountBadge({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="notification-count-badge" aria-hidden="true">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const isActuallyVisibleElement = (element: Element | null) => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const styles = window.getComputedStyle(element);
  if (
    styles.display === "none" ||
    styles.visibility === "hidden" ||
    styles.pointerEvents === "none" ||
    Number(styles.opacity || "1") === 0
  ) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const clearStaleInteractionLocks = () => {
  if (typeof document === "undefined") {
    return;
  }

  const { body } = document;
  const hasImportModal = Array.from(document.querySelectorAll(".modal-backdrop--import-fullscreen")).some((element) =>
    isActuallyVisibleElement(element)
  );
  const hasPageModal = Array.from(document.querySelectorAll(".modal-backdrop:not(.modal-backdrop--import-fullscreen)")).some(
    (element) => isActuallyVisibleElement(element)
  );
  const hasFileDropZone = Array.from(document.querySelectorAll(".page-file-drop-zone")).some((element) =>
    isActuallyVisibleElement(element)
  );

  if (body.dataset.cloverImportModalVisible === "true" && !hasImportModal) {
    delete body.dataset.cloverImportModalVisible;
    delete body.dataset.cloverImportModalVisibleCount;
  }

  if ((body.dataset.cloverImportModalOpen === "true" || body.dataset.cloverImportModalLocks) && !hasImportModal) {
    delete body.dataset.cloverImportModalOpen;
    delete body.dataset.cloverImportModalLocks;
  }

  if (body.hasAttribute("data-clover-page-modal") && !hasPageModal) {
    body.removeAttribute("data-clover-page-modal");
  }

  if (body.dataset.cloverDropActive === "true" && !hasFileDropZone) {
    delete body.dataset.cloverDropActive;
  }
};

export function CloverShell({
  active,
  title,
  kicker,
  subtitle,
  titleAddon,
  mobileSubheader,
  desktopTitleAction,
  actions,
  mobileLeadingAction,
  showTopbar = true,
  mobileBackHref,
  hideCompactBarCopyOnMobile = false,
  hideCompactBarKickerAndSubtitleOnMobile = false,
  workspaceId,
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
  const quickAddFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickAddPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const quickAddPhotoLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const mobileShellGestureRef = useRef<MobileShellGesture>(idleMobileShellGesture());
  const mobilePullFrameRef = useRef<number | null>(null);
  const mobileRefreshTimerRef = useRef<number | null>(null);
  const mobileRefreshStateRef = useRef<"idle" | "pulling" | "ready" | "refreshing">("idle");
  const [openMenu, setOpenMenu] = useState<"notifications" | "profile" | "more" | null>(null);
  const [guidanceMenuVisibility, setGuidanceMenuVisibility] = useState<GuidanceMenuVisibility>(() =>
    getGuidanceMenuPreset("very-comfortable")
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [notificationsPopoverStyle, setNotificationsPopoverStyle] = useState<{ left: number; bottom: number } | null>(null);
  const [quickAddModal, setQuickAddModal] = useState<"transaction" | "import" | null>(null);
  const [quickAddSeedFiles, setQuickAddSeedFiles] = useState<File[] | null>(null);
  const [quickAddImportMode, setQuickAddImportMode] = useState<ImportImageMode>("statement");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Keep the server render and the first client render identical. Persistent
  // browser state is restored by the mount effects below; using it in these
  // initializers caused a full hydration rebuild on authenticated page loads.
  const [searchWorkspaceId, setSearchWorkspaceId] = useState(workspaceId || "");
  const [searchAccounts, setSearchAccounts] = useState<SidebarSearchAccount[]>([]);
  const [searchPlanTier, setSearchPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [searchTicker, setSearchTicker] = useState<SidebarSearchMarket | null>(null);
  const [searchTickerLoading, setSearchTickerLoading] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [cachedProfileImage, setCachedProfileImage] = useState<string | null>(null);
  const [cachedReporterEmail, setCachedReporterEmail] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const [isBottomNavCompact, setIsBottomNavCompact] = useState(false);
  const [mobilePullDistance, setMobilePullDistance] = useState(0);
  const [mobileRefreshState, setMobileRefreshState] = useState<"idle" | "pulling" | "ready" | "refreshing">("idle");
  const [mobileOverlayChrome, setMobileOverlayChrome] = useState<{ title: string; onBack: () => void } | null>(null);
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
  const displayName = hasMounted
    ? user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "Account"
    : "Account";
  const reporterEmail = hasMounted ? user?.primaryEmailAddress?.emailAddress ?? cachedReporterEmail : "";

  useEffect(() => {
    const cachedIdentity = readAccountIdentityCache();
    setCachedProfileImage(cachedIdentity?.imageUrl ?? null);
    setCachedReporterEmail(cachedIdentity?.email ?? "");
    setHasMounted(true);
  }, []);

  useEffect(() => installClientDiagnostics(), []);

  useEffect(() => installWorkspaceMutationObserver(), []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const currentDomain = getWorkspaceDataDomainForPath(pathname ?? "");

    const unsubscribe = subscribeWorkspaceDataChanges((change) => {
      if (!currentDomain || !change.affected.includes(currentDomain)) return;
      if (workspaceId && change.workspaceId && workspaceId !== change.workspaceId) return;

      clearJsonRequestCache("shell:");

      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        startTransition(() => router.refresh());
      }, 180);
    });

    return () => {
      unsubscribe();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [pathname, router, workspaceId]);

  useEffect(() => {
    if (pathname) {
      recordClientDiagnostic("navigation", `Opened ${pathname}`, pathname);
    }
  }, [pathname]);

  useEffect(() => {
    setIsBottomNavCompact(false);

    const mobileQuery = window.matchMedia("(max-width: 1100px)");
    const previousScrollPositions = new WeakMap<EventTarget, number>();

    const updateFromScroll = (target: EventTarget | null) => {
      if (!mobileQuery.matches) {
        setIsBottomNavCompact(false);
        return;
      }

      const scrollTarget = target instanceof Document ? document.scrollingElement : target;
      const scrollTop = scrollTarget instanceof Element
        ? scrollTarget.scrollTop
        : window.scrollY;
      const trackingTarget = scrollTarget instanceof EventTarget ? scrollTarget : window;
      const previousScrollTop = previousScrollPositions.get(trackingTarget) ?? scrollTop;
      previousScrollPositions.set(trackingTarget, scrollTop);

      if (scrollTop <= 16) {
        setIsBottomNavCompact(false);
      } else if (scrollTop - previousScrollTop >= 5) {
        setIsBottomNavCompact(true);
      } else if (previousScrollTop - scrollTop >= 8) {
        setIsBottomNavCompact(false);
      }
    };

    const handleWindowScroll = () => updateFromScroll(document);
    const handleDocumentScroll = (event: Event) => updateFromScroll(event.target);
    const handleViewportChange = () => {
      if (!mobileQuery.matches) {
        setIsBottomNavCompact(false);
      }
    };

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    document.addEventListener("scroll", handleDocumentScroll, { passive: true, capture: true });
    mobileQuery.addEventListener("change", handleViewportChange);

    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
      document.removeEventListener("scroll", handleDocumentScroll, true);
      mobileQuery.removeEventListener("change", handleViewportChange);
    };
  }, [pathname]);

  useEffect(() => {
    const mobileQuery = window.matchMedia(MOBILE_SHELL_BREAKPOINT);

    const schedulePullDistance = (distance: number) => {
      if (mobilePullFrameRef.current !== null) {
        window.cancelAnimationFrame(mobilePullFrameRef.current);
      }
      mobilePullFrameRef.current = window.requestAnimationFrame(() => {
        setMobilePullDistance(distance);
        const nextState = distance >= MOBILE_PULL_REFRESH_THRESHOLD ? "ready" : "pulling";
        mobileRefreshStateRef.current = nextState;
        setMobileRefreshState(nextState);
        mobilePullFrameRef.current = null;
      });
    };

    const resetPullGesture = () => {
      mobileShellGestureRef.current = idleMobileShellGesture();
      if (mobilePullFrameRef.current !== null) {
        window.cancelAnimationFrame(mobilePullFrameRef.current);
        mobilePullFrameRef.current = null;
      }
      setMobilePullDistance(0);
      if (mobileRefreshStateRef.current !== "refreshing") {
        mobileRefreshStateRef.current = "idle";
        setMobileRefreshState("idle");
      }
    };

    const hasBlockingOverlay = () =>
      isProfileDrawerOpen ||
      quickAddModal !== null ||
      openMenu !== null ||
      document.body.dataset.cloverImportModalOpen === "true" ||
      document.body.hasAttribute("data-clover-page-modal") ||
      Boolean(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'));

    const handleTouchStart = (event: TouchEvent) => {
      if (!mobileQuery.matches || event.touches.length !== 1 || mobileRefreshStateRef.current === "refreshing") return;

      const touch = event.touches[0];
      const target = event.target;
      const sidebar = shellRef.current?.querySelector(".sidebar");

      if (isSidebarOpen && target instanceof Node && sidebar?.contains(target)) {
        mobileShellGestureRef.current = {
          kind: "close-sidebar",
          startX: touch.clientX,
          startY: touch.clientY,
          pullDistance: 0,
        };
        return;
      }

      if (hasBlockingOverlay() || isSidebarOpen) return;

      if (touch.clientX <= MOBILE_EDGE_SWIPE_WIDTH) {
        mobileShellGestureRef.current = {
          kind: "open-sidebar",
          startX: touch.clientX,
          startY: touch.clientY,
          pullDistance: 0,
        };
        return;
      }

      if (getGestureScrollTop(target) > 0 || isMobileGestureBlockedTarget(target)) return;

      mobileShellGestureRef.current = {
        kind: "pull-refresh",
        startX: touch.clientX,
        startY: touch.clientY,
        pullDistance: 0,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!mobileQuery.matches || event.touches.length !== 1) return;

      const gesture = mobileShellGestureRef.current;
      if (gesture.kind === "idle") return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);

      if (gesture.kind === "pull-refresh") {
        if (deltaY <= 0 || (horizontalDistance > 10 && horizontalDistance > verticalDistance)) {
          resetPullGesture();
          return;
        }
        if (deltaY < 6 || verticalDistance < horizontalDistance * 1.15) return;

        event.preventDefault();
        // Reach the refresh threshold after a natural ~72px finger pull. The
        // previous damping required more than 140px, which made the gesture
        // feel unavailable on short phones and installed PWAs.
        const distance = Math.min(MOBILE_PULL_REFRESH_MAX_DISTANCE, deltaY * 0.75);
        gesture.pullDistance = distance;
        schedulePullDistance(distance);
        return;
      }

      if (horizontalDistance < 12 || horizontalDistance < verticalDistance * 1.15) return;
      event.preventDefault();

      if (gesture.kind === "open-sidebar" && deltaX >= MOBILE_SIDEBAR_SWIPE_THRESHOLD) {
        setIsSidebarOpen(true);
        mobileShellGestureRef.current = idleMobileShellGesture();
      } else if (gesture.kind === "close-sidebar" && deltaX <= -MOBILE_SIDEBAR_SWIPE_THRESHOLD) {
        setIsSidebarOpen(false);
        mobileShellGestureRef.current = idleMobileShellGesture();
      }
    };

    const handleTouchEnd = () => {
      const gesture = mobileShellGestureRef.current;
      if (gesture.kind !== "pull-refresh") {
        mobileShellGestureRef.current = idleMobileShellGesture();
        return;
      }

      if (gesture.pullDistance < MOBILE_PULL_REFRESH_THRESHOLD) {
        resetPullGesture();
        return;
      }

      mobileShellGestureRef.current = idleMobileShellGesture();
      if (mobilePullFrameRef.current !== null) {
        window.cancelAnimationFrame(mobilePullFrameRef.current);
        mobilePullFrameRef.current = null;
      }
      setMobilePullDistance(MOBILE_PULL_REFRESH_THRESHOLD);
      mobileRefreshStateRef.current = "refreshing";
      setMobileRefreshState("refreshing");
      clearJsonRequestCache();
      window.dispatchEvent(new CustomEvent(cloverPullToRefreshEvent, {
        detail: { pathname, workspaceId: workspaceId ?? null },
      }));
      startTransition(() => router.refresh());

      if (mobileRefreshTimerRef.current !== null) window.clearTimeout(mobileRefreshTimerRef.current);
      mobileRefreshTimerRef.current = window.setTimeout(() => {
        setMobilePullDistance(0);
        mobileRefreshStateRef.current = "idle";
        setMobileRefreshState("idle");
        mobileRefreshTimerRef.current = null;
      }, 900);
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", resetPullGesture, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", resetPullGesture);
      if (mobilePullFrameRef.current !== null) window.cancelAnimationFrame(mobilePullFrameRef.current);
      if (mobileRefreshTimerRef.current !== null) window.clearTimeout(mobileRefreshTimerRef.current);
    };
  }, [isProfileDrawerOpen, isSidebarOpen, openMenu, pathname, quickAddModal, router, workspaceId]);
  const profileImage = hasMounted ? user?.imageUrl ?? cachedProfileImage : null;
  const isProfileActive = isProfileDrawerOpen || active === "profile" || pathname?.startsWith("/profile");
  const isSettingsActive = pathname?.startsWith("/settings");
  const isAccountNavActive = isProfileActive || isSettingsActive;
  const isMoreActive = active === "more" || pathname?.startsWith("/more");
  const isNotificationsActive = openMenu === "notifications";
  const isProfileMenuOpen = openMenu === "profile";
  const isMoreMenuOpen = openMenu === "more";
  const visibleDesktopNavSections = desktopNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => guidanceMenuVisibility[item.key]),
    }))
    .filter((section) => section.items.length > 0);
  const hasHiddenDesktopNavItems = desktopNavSections.some((section) =>
    section.items.some((item) => !guidanceMenuVisibility[item.key])
  );
  const closeChrome = () => {
    setOpenMenu(null);
    setIsSearchOpen(false);
    setIsSidebarOpen(false);
    setIsProfileDrawerOpen(false);
    setNotificationsPopoverStyle(null);
  };
  const hasHistoryBackTarget =
    !!previousPathname &&
    !pathname?.startsWith("/home") &&
    previousPathname !== "/home" &&
    previousPathname !== pathname;
  const isMobileRootRoute = new Set([
    "/home",
    "/dashboard",
    "/adviser",
    "/accounts",
    "/transactions",
    "/recurring",
    "/circles",
    "/split-bill",
    "/budgeting",
    "/goals",
    "/investments",
    "/reports",
    "/more",
    "/profile",
    "/notifications",
    "/settings",
  ]).has(pathname ?? "");
  const creationParent = pathname?.endsWith("/new") ? pathname.slice(0, -4) : null;
  const resolvedMobileBackHref = creationParent ?? mobileBackHref ?? (active === "dashboard" ? undefined : "/home");
  const shouldShowBackButton = Boolean(mobileOverlayChrome) || (active !== "dashboard" && (!isMobileRootRoute || mobileBackHref === "/settings"));
  const mobileFallbackBackOnly = !mobileOverlayChrome && !hasHistoryBackTarget && Boolean(resolvedMobileBackHref);
  const handleBack = () => {
    closeChrome();
    if (mobileOverlayChrome) {
      mobileOverlayChrome.onBack();
      return;
    }
    if (creationParent) {
      if (window.history.state?.cloverCreation === pathname) router.back();
      else router.replace(creationParent);
      return;
    }
    if (mobileFallbackBackOnly && resolvedMobileBackHref) {
      router.push(resolvedMobileBackHref);
      return;
    }
    router.back();
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    const cachedIdentity = readAccountIdentityCache();
    writeAccountIdentityCache({
      firstName: user.firstName ?? cachedIdentity?.firstName ?? null,
      lastName: user.lastName ?? cachedIdentity?.lastName ?? null,
      email: user.primaryEmailAddress?.emailAddress ?? cachedIdentity?.email,
      imageUrl: user.imageUrl ?? cachedIdentity?.imageUrl ?? null,
    });
  }, [user]);

  const handleNotificationsToggle = () => {
    if (openMenu === "notifications") {
      setOpenMenu(null);
      setNotificationsPopoverStyle(null);
      return;
    }

    setOpenMenu(null);

    const buttonRect = notificationsButtonRef.current?.getBoundingClientRect();
    const sidebarRect = shellRef.current?.querySelector(".sidebar")?.getBoundingClientRect();
    if (buttonRect) {
      const popoverWidth = Math.min(400, window.innerWidth - 24);
      const sidebarRight = sidebarRect?.right ?? buttonRect.right;
      const left = sidebarRight + popoverWidth + 24 <= window.innerWidth
        ? sidebarRight + 12
        : Math.max(12, buttonRect.left - popoverWidth - 12);

      setNotificationsPopoverStyle({
        left: Math.min(left, window.innerWidth - popoverWidth - 12),
        bottom: Math.max(12, window.innerHeight - buttonRect.top + 12),
      });
    }

    if (notificationCount > 0) {
      setNotificationCount(0);
      void markInAppNotificationsRead(notifications.map((item) => item.id)).catch(async () => {
        const feed = await loadInAppNotificationFeed(searchWorkspaceId || null, true).catch(() => null);
        if (feed) setNotificationCount(feed.count);
      });
    }
    if (notifications.length === 0) {
      void loadInAppNotificationFeed(searchWorkspaceId || null, true).then((feed) => {
        setNotifications(feed.notifications);
        setNotificationCount(feed.count);
      }).catch(() => null);
    }
    setOpenMenu("notifications");
  };

  useEffect(() => {
    setIsSidebarOpen(false);
    setIsProfileDrawerOpen(false);
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
        setNotificationsPopoverStyle(null);
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
        setNotificationsPopoverStyle(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setIsSearchOpen(false);
        setNotificationsPopoverStyle(null);
        setIsSidebarOpen(false);
        setIsProfileDrawerOpen(false);
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
    if ((!isSidebarOpen && !isProfileDrawerOpen) || window.matchMedia("(min-width: 1101px)").matches) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isProfileDrawerOpen, isSidebarOpen]);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentUser = async () => {
      try {
        const response = await fetchJsonOnce<{ user?: { planTier?: string } }>({
          key: `shell:me:${user?.id ?? "guest"}`,
          route: "/api/me",
          input: "/api/me",
          cacheTtlMs: 5 * 60 * 1000,
        });
        if (!response.ok || cancelled) {
          return;
        }

        const payload = response.json;
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
  }, [user?.id]);

  useEffect(() => {
    setOpenMenu(null);
    setIsSearchOpen(false);
    setSearchQuery("");
    setIsQuickAddOpen(false);
    setQuickAddModal(null);
    setQuickAddSeedFiles(null);
    setQuickAddImportMode("statement");
    clearStaleInteractionLocks();
  }, [pathname]);

  useEffect(() => {
    const readMenuVisibility = () => {
      try {
        const raw = window.localStorage.getItem(SETTINGS_GUIDANCE_MENU_KEY);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        if (isGuidanceMenuVisibility(parsed)) {
          setGuidanceMenuVisibility(parsed);
          return;
        }
      } catch {
        // Fall back to the complete menu when preferences are unavailable.
      }

      setGuidanceMenuVisibility(getGuidanceMenuPreset("very-comfortable"));
    };

    const handleMenuPreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isGuidanceMenuVisibility(detail)) {
        setGuidanceMenuVisibility(detail);
      } else {
        readMenuVisibility();
      }
    };

    readMenuVisibility();
    window.addEventListener(SETTINGS_GUIDANCE_MENU_EVENT, handleMenuPreferenceChange);
    window.addEventListener("storage", readMenuVisibility);

    return () => {
      window.removeEventListener(SETTINGS_GUIDANCE_MENU_EVENT, handleMenuPreferenceChange);
      window.removeEventListener("storage", readMenuVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    clearStaleInteractionLocks();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearStaleInteractionLocks();
      }
    };
    const handleWindowFocus = () => {
      clearStaleInteractionLocks();
    };
    const interval = window.setInterval(() => {
      clearStaleInteractionLocks();
    }, 1000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);

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
      const nextWorkspaceId = readSelectedWorkspaceId() || workspaceId || "";
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
    const handleSameTabWorkspaceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: unknown }>).detail;
      const nextWorkspaceId =
        typeof detail?.workspaceId === "string"
          ? detail.workspaceId
          : readSelectedWorkspaceId();
      if (!cancelled) {
        setSearchWorkspaceId(nextWorkspaceId);
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(selectedWorkspaceEventName, handleSameTabWorkspaceChange);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(selectedWorkspaceEventName, handleSameTabWorkspaceChange);
    };
  }, [searchWorkspaceId, workspaceId]);

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    persistSelectedWorkspaceId(workspaceId);
    setSearchWorkspaceId(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;

    const loadSearchAccounts = async () => {
      if (!searchWorkspaceId) {
        setSearchAccounts([]);
        return;
      }

      try {
        const response = await fetchJsonOnce<{ accounts?: SidebarSearchAccount[] }>({
          key: `shell:accounts:${searchWorkspaceId}`,
          route: "/api/accounts",
          workspaceId: searchWorkspaceId,
          input: `/api/accounts?workspaceId=${encodeURIComponent(searchWorkspaceId)}`,
          cacheTtlMs: 30_000,
        });
        if (!response.ok || cancelled) {
          return;
        }

        const payload = response.json;
        const items = Array.isArray(payload?.accounts) ? payload.accounts : [];
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
    let cancelled = false;

    const loadNotifications = async (fresh = false) => {
      try {
        const feed = await loadInAppNotificationFeed(searchWorkspaceId || null, fresh);
        if (!cancelled) {
          setNotifications(feed.notifications);
          setNotificationCount(feed.count);
        }
      } catch {
        if (!cancelled) {
          setNotifications([]);
          setNotificationCount(0);
        }
      }
    };

    void loadNotifications();
    const refresh = () => void loadNotifications(true);
    const markRead = () => setNotificationCount(0);
    window.addEventListener(inAppNotificationsChangedEvent, refresh);
    window.addEventListener(inAppNotificationsReadEvent, markRead);
    window.addEventListener("focus", refresh);
    let importRefreshTimer: number | null = null;
    const unsubscribeImportActivity = subscribeImportActivity(() => {
      if (importRefreshTimer) window.clearTimeout(importRefreshTimer);
      importRefreshTimer = window.setTimeout(refresh, 700);
    });
    return () => {
      cancelled = true;
      window.removeEventListener(inAppNotificationsChangedEvent, refresh);
      window.removeEventListener(inAppNotificationsReadEvent, markRead);
      window.removeEventListener("focus", refresh);
      if (importRefreshTimer) window.clearTimeout(importRefreshTimer);
      unsubscribeImportActivity();
    };
  }, [searchWorkspaceId]);

  useEffect(() => {
    document.body.dataset.cloverShellReady = "true";
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const message = [event.message, event.error instanceof Error ? event.error.message : ""].join(" ");
      if (isChunkLoadErrorMessage(message)) {
        console.warn("[Clover] Recovering from transient chunk load error during deployment:", message);
        recoverFromChunkLoadError();
      }
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const message = getErrorMessage(event.reason);
      if (isChunkLoadErrorMessage(message)) {
        console.warn("[Clover] Recovering from transient chunk load error during deployment:", message);
        recoverFromChunkLoadError();
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

  const dismissNotification = async (notificationId: string) => {
    const previous = notifications;
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
    try {
      const feed = await dismissInAppNotifications({ ids: [notificationId] });
      setNotifications(feed.notifications);
      setNotificationCount(feed.count);
    } catch {
      setNotifications(previous);
    }
  };

  const clearAllNotifications = async () => {
    const previous = notifications;
    const previousCount = notificationCount;
    setNotifications([]);
    setNotificationCount(0);
    try {
      await dismissInAppNotifications({ dismissAll: true });
    } catch {
      setNotifications(previous);
      setNotificationCount(previousCount);
    }
  };
  const homeNotificationsAction =
    active === "dashboard" ? (
      <Link
        href="/notifications"
        className="home-notifications-button"
        aria-label={`Open notifications${notificationCount ? ` (${notificationCount})` : ""}`}
        onClick={(event) => handleNavigationLinkClick(event, "/notifications")}
        onMouseEnter={() => prefetchNavTarget("/notifications")}
        onTouchStart={() => prefetchNavTarget("/notifications")}
      >
        <MenuIcon name="notifications" />
        <NotificationCountBadge count={notificationCount} />
      </Link>
    ) : null;
  const navigateTo = (href: string) => {
    closeChrome();
    router.push(href);
  };

  const handleNavigationLinkClick = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    navigateTo(href);
  };

  const prefetchNavTarget = (href: string) => {
    if (!shouldPrefetchNavHref(href)) {
      return;
    }

    void router.prefetch(href);
  };

  useEffect(() => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return;

    // Warm only client-owned, bundle-heavy destinations. Server-rendered pages
    // remain intent-prefetched so idle time never launches report or recurring
    // database work. Staggering avoids the request burst the old core prefetch
    // produced on every shell mount.
    const clientRouteWarmups = ["/accounts", "/transactions", "/investments"]
      .filter((href) => !pathname?.startsWith(href));
    const timers = clientRouteWarmups.map((href, index) => window.setTimeout(() => {
      void router.prefetch(href);
    }, 900 + index * 650));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [pathname, router]);

  const openQuickAddTransaction = () => {
    if (pathname?.startsWith("/accounts/institutions/")) {
      setIsQuickAddOpen(false);
      window.dispatchEvent(new Event("clover:open-institution-investment-add"));
      return;
    }

    if (pathname?.startsWith("/split-bill")) {
      setIsQuickAddOpen(false);
      window.dispatchEvent(new CustomEvent("clover:open-split-bill-add", { detail: { mode: "manual" } }));
      return;
    }

    if (pathname?.startsWith("/investments")) {
      setIsQuickAddOpen(false);
      window.dispatchEvent(new Event("clover:open-investment-add"));
      return;
    }

    if (pathname?.startsWith("/recurring")) {
      setIsQuickAddOpen(false);
      window.dispatchEvent(new Event("clover:open-recurring-add"));
      return;
    }

    // Warm the lazy modal as soon as the quick-add menu is requested. On a
    // cold session this overlaps its chunk download with the user's menu
    // choice instead of starting the download after "Add Manually" is clicked.
    void loadDashboardManualTransactionModal();
    void loadImportFilesModal();
    setIsQuickAddOpen((current) => !current);
  };

  const closeQuickAddModal = () => {
    setQuickAddModal(null);
    setQuickAddSeedFiles(null);
    setQuickAddImportMode("statement");
  };

  const openQuickAddCamera = () => {
    const input = quickAddPhotoInputRef.current;
    if (!input) {
      return;
    }

    input.value = "";
    input.click();
  };

  const openQuickAddPhotoLibrary = () => {
    const input = quickAddPhotoLibraryInputRef.current;
    if (!input) {
      return;
    }

    input.value = "";
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  };

  const openQuickAddFilePicker = () => {
    const input = quickAddFileInputRef.current;
    if (!input) {
      return;
    }

    input.value = "";
    if (typeof input.showPicker === "function") input.showPicker();
    else input.click();
  };

  const handleQuickAddFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    setIsQuickAddOpen(false);
    setQuickAddSeedFiles(files);
    setQuickAddImportMode("statement");
    setQuickAddModal("import");
  };

  const handleQuickAddPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    setIsQuickAddOpen(false);
    setQuickAddSeedFiles(files);
    setQuickAddImportMode("receipt");
    setQuickAddModal("import");
  };

  const handleSignOut = () => {
    persistSelectedWorkspaceId("");
    clearAllWorkspaceCaches();
    void signOutToLanding(signOut);
  };

  const mobilePullRefreshLabel = mobileRefreshState === "refreshing"
    ? "Refreshing"
    : mobileRefreshState === "ready"
      ? "Release to refresh"
      : "Pull to refresh";
  const mobilePullRefreshStyle = {
    "--mobile-pull-distance": `${mobilePullDistance}px`,
    "--mobile-pull-progress": Math.min(1, mobilePullDistance / MOBILE_PULL_REFRESH_THRESHOLD),
  } as CSSProperties;

  return (
    <CloverChromeContext.Provider value={{ closeChrome, setMobileOverlayChrome }}>
      <OnboardingMissionTracker />
      <RegionalPreferencesSync />
      <div className={`app-shell ${isSidebarOpen ? "is-sidebar-open" : ""}`} ref={shellRef}>
      <div
        className={`mobile-pull-refresh mobile-pull-refresh--${mobileRefreshState}`}
        style={mobilePullRefreshStyle}
        role="status"
        aria-live="polite"
        aria-hidden={mobileRefreshState === "idle"}
      >
        <span className="mobile-pull-refresh__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M20 7v5h-5" />
            <path d="M19 12a7 7 0 1 0-2.05 4.95" />
          </svg>
        </span>
        <span>{mobilePullRefreshLabel}</span>
      </div>
      <div
        className="sidebar-backdrop"
        role="presentation"
        hidden={!isSidebarOpen}
        onClick={() => setIsSidebarOpen(false)}
      />
      <aside className="sidebar" aria-label="Primary">
        <div className="sidebar-header">
          <Link
            href="/home"
            prefetch={false}
            aria-label="Clover home"
            aria-current={pathname === "/home" ? "page" : undefined}
            className="sidebar-brand-link sidebar-brand-link--centered"
            onClick={(event) => handleNavigationLinkClick(event, "/home")}
          >
            <img
              src="/clover-mark.svg"
              alt=""
              aria-hidden="true"
              className="sidebar-brand-link__mark"
              loading="eager"
              fetchPriority="high"
            />
            <img
              src="/clover-name-teal.svg"
              alt="Clover"
              className="sidebar-brand-link__wordmark"
              loading="eager"
              fetchPriority="high"
            />
          </Link>
          <button
            className="sidebar-mobile-close"
            type="button"
            aria-label="Close menu"
            onClick={() => setIsSidebarOpen(false)}
          >
            <MenuIcon name="menu" open />
          </button>
        </div>

        <nav className="sidebar-nav sidebar-nav--desktop" aria-label="Primary" id="primary-navigation">
          {visibleDesktopNavSections.map((section) => (
            <div key={section.label} className="sidebar-nav__section">
              <p className="sidebar-nav__section-label">{section.label}</p>
              {section.items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={false}
                  className={`nav-link ${active === item.key ? "is-active" : ""}`}
                  aria-current={active === item.key ? "page" : undefined}
                  onClick={(event) => handleNavigationLinkClick(event, item.href)}
                  onMouseEnter={() => prefetchNavTarget(item.href)}
                  onTouchStart={() => prefetchNavTarget(item.href)}
                >
                  <span className="nav-link__icon" aria-hidden="true">
                    <MenuIcon name={item.key} />
                  </span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
          {hasHiddenDesktopNavItems ? (
            <div className="sidebar-nav__section sidebar-nav__section--more">
              <Link
                href="/more"
                prefetch={false}
                className={`nav-link ${isMoreActive ? "is-active" : ""}`}
                aria-current={isMoreActive ? "page" : undefined}
                onClick={(event) => handleNavigationLinkClick(event, "/more")}
                onMouseEnter={() => prefetchNavTarget("/more")}
                onTouchStart={() => prefetchNavTarget("/more")}
              >
                <span className="nav-link__icon" aria-hidden="true">
                  <MenuIcon name="more" />
                </span>
                More
              </Link>
            </div>
          ) : null}
        </nav>

        <nav className="sidebar-nav sidebar-nav--mobile" aria-label="Primary mobile menu">
          {desktopNavSections.map((section) => (
            <div key={section.label} className="sidebar-nav__section">
              <p className="sidebar-nav__section-label">{section.label}</p>
              {section.items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  prefetch={false}
                  className={`nav-link ${active === item.key ? "is-active" : ""}`}
                  aria-current={active === item.key ? "page" : undefined}
                  onClick={(event) => handleNavigationLinkClick(event, item.href)}
                  onMouseEnter={() => prefetchNavTarget(item.href)}
                  onTouchStart={() => prefetchNavTarget(item.href)}
                >
                  <span className="nav-link__icon" aria-hidden="true">
                    <MenuIcon name={item.key} />
                  </span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
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
                <img
                  className="sidebar-profile__photo"
                  src={profileImage}
                  alt=""
                  aria-hidden="true"
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
            ) : (
              <span className="sidebar-profile__avatar" aria-hidden="true">
                <img src={getNavigationIconSrc("profile")} alt="" width={96} height={96} loading="eager" decoding="sync" fetchPriority="high" className="sidebar-profile__avatar-icon" />
              </span>
            )}
            <span className="sr-only">{displayName}</span>
          </button>
          <Link
            href="/settings"
            prefetch={false}
            className={`sidebar-icon-button sidebar-footer__settings${isSettingsActive ? " is-active" : ""}`}
            aria-label="Settings"
            aria-current={isSettingsActive ? "page" : undefined}
            onClick={(event) => handleNavigationLinkClick(event, "/settings")}
            onMouseEnter={() => prefetchNavTarget("/settings")}
            onTouchStart={() => prefetchNavTarget("/settings")}
          >
            <MenuIcon name="settings" />
          </Link>
          <button
            ref={notificationsButtonRef}
            className={`sidebar-icon-button sidebar-notifications-button ${isNotificationsActive ? "is-active" : ""}`}
            type="button"
            aria-label={`Open notifications${notificationCount ? ` (${notificationCount})` : ""}`}
            aria-expanded={isNotificationsActive}
            aria-haspopup="menu"
            onClick={handleNotificationsToggle}
          >
            <MenuIcon name="notifications" />
            <NotificationCountBadge count={notificationCount} />
          </button>
          <Link
            href="/help"
            prefetch={false}
            className={`sidebar-icon-button sidebar-footer__help${pathname?.startsWith("/help") ? " is-active" : ""}`}
            aria-label="Help"
            aria-current={pathname?.startsWith("/help") ? "page" : undefined}
            onClick={(event) => handleNavigationLinkClick(event, "/help")}
            onMouseEnter={() => prefetchNavTarget("/help")}
            onTouchStart={() => prefetchNavTarget("/help")}
          >
            <MenuIcon name="help" />
          </Link>

          {isProfileMenuOpen ? (
            <div ref={profilePopoverRef} className="sidebar-popover sidebar-popover--profile" role="menu" aria-label="Account menu">
              <div className="sidebar-popover__head">
                <span className="sidebar-popover__title">{displayName}</span>
              </div>
              <div className="sidebar-popover__links sidebar-popover__links--bare">
                <Link
                  href="/settings?section=account"
                  prefetch={false}
                  className="sidebar-popover__link sidebar-popover__button sidebar-popover__link--bare"
                  onClick={(event) => handleNavigationLinkClick(event, "/settings?section=account")}
                  onMouseEnter={() => prefetchNavTarget("/settings?section=account")}
                  onTouchStart={() => prefetchNavTarget("/settings?section=account")}
                  role="menuitem"
                >
                  <span className="sidebar-popover__link-icon" aria-hidden="true">
                    <MenuIcon name="profile" />
                  </span>
                  <span>Account</span>
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

        </div>

      </aside>

      <div
        className={`shell-profile-drawer-backdrop${isProfileDrawerOpen ? " is-open" : ""}`}
        role="presentation"
        aria-hidden={!isProfileDrawerOpen}
        onClick={() => setIsProfileDrawerOpen(false)}
      />
      <aside id="mobile-settings-drawer" className={`shell-profile-drawer${isProfileDrawerOpen ? " is-open" : ""}`} aria-label="Account" aria-hidden={!isProfileDrawerOpen} inert={!isProfileDrawerOpen}>
        <div className="shell-profile-drawer__head">
          <div className="shell-profile-drawer__title-row">
            <button type="button" aria-label="Close Account menu" onClick={() => setIsProfileDrawerOpen(false)}>
              <MenuIcon name="menu" open />
            </button>
          </div>
          <div className="shell-profile-drawer__account-card">
            <span className="shell-profile-drawer__account-avatar" aria-hidden="true">
              {profileImage ? (
                <img src={profileImage} alt="" loading="eager" decoding="async" fetchPriority="high" />
              ) : (
                <MenuIcon name="profile" />
              )}
            </span>
            <div className="shell-profile-drawer__account-copy">
              <span>Account</span>
              <strong>{displayName}</strong>
            </div>
          </div>
        </div>
        <nav className="shell-profile-drawer__nav" aria-label="Account sections">
          {mobileSettingsSections.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={(event) => handleNavigationLinkClick(event, item.href)}
            >
              <span aria-hidden="true"><MenuIcon name={item.icon} /></span>
              {item.label}
              {item.href === "/notifications" ? <NotificationCountBadge count={notificationCount} /> : null}
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </nav>
        <button className="shell-profile-drawer__sign-out" type="button" onClick={handleSignOut}>
          <MenuIcon name="sign-out" />
          Log Out
        </button>
      </aside>

      {typeof document !== "undefined" && isNotificationsActive && notificationsPopoverStyle ? (
        createPortal(
          <div
            ref={notificationsPopoverRef}
            className="sidebar-popover sidebar-popover--notifications"
            role="menu"
            aria-label="Notifications"
            style={{
              left: `${notificationsPopoverStyle.left}px`,
              bottom: `${notificationsPopoverStyle.bottom}px`,
            }}
          >
            <div className="sidebar-popover__head">
              <span className="sidebar-popover__title">Notifications</span>
              <button
                type="button"
                className="sidebar-popover__clear-notifications"
                disabled={notifications.length === 0}
                onClick={() => void clearAllNotifications()}
              >
                Clear All
              </button>
            </div>
            <div className="sidebar-popover__items">
              {notifications.length ? (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="sidebar-popover__item sidebar-popover__notification"
                    role="none"
                  >
                    <Link
                      href={notification.productHref}
                      prefetch={false}
                      className="sidebar-popover__notification-product"
                      role="menuitem"
                      aria-label={`Open ${notification.productLabel}`}
                      title={`Open ${notification.productLabel}`}
                      onClick={(event) => handleNavigationLinkClick(event, notification.productHref)}
                    >
                      <img src={getNavigationIconSrc(notification.product)} alt="" aria-hidden="true" />
                    </Link>
                    <Link
                      href={notification.href ?? notification.productHref}
                      prefetch={false}
                      className="sidebar-popover__notification-main"
                      role="menuitem"
                      onClick={(event) => handleNavigationLinkClick(event, notification.href ?? notification.productHref)}
                      onMouseEnter={() => prefetchNavTarget(notification.href ?? notification.productHref)}
                      onTouchStart={() => prefetchNavTarget(notification.href ?? notification.productHref)}
                    >
                      <span className="sidebar-popover__notification-title">{notification.title}</span>
                      <span className="sidebar-popover__notification-detail">{notification.message}</span>
                      <time dateTime={notification.createdAt}>{formatInAppNotificationDateTime(notification.createdAt)}</time>
                    </Link>
                    <button
                      type="button"
                      className="sidebar-popover__notification-dismiss"
                      aria-label={`Dismiss ${notification.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void dismissNotification(notification.id);
                      }}
                    >
                      x
                    </button>
                  </div>
                ))
              ) : (
                <div className="sidebar-popover__empty">You’re all caught up. New product updates will show here.</div>
              )}
            </div>
          </div>,
          document.body
        )
      ) : null}

      {searchWorkspaceId && reporterEmail ? (
        <BugReportWidget
          workspaceId={searchWorkspaceId}
          reporterName={displayName}
          reporterEmail={reporterEmail}
          onOpenChange={(reportOpen) => {
            if (reportOpen) {
              setIsQuickAddOpen(false);
            }
          }}
        />
      ) : null}

      <button
        ref={quickAddButtonRef}
        className={`shell-quick-add-button${isQuickAddOpen ? " is-open" : ""}`}
        type="button"
        aria-label={
          pathname?.startsWith("/accounts/institutions/")
            ? "Add investment"
            : isQuickAddOpen
              ? "Close quick add"
              : "Open quick add"
        }
        title={
          pathname?.startsWith("/accounts/institutions/")
            ? "Add investment"
            : isQuickAddOpen
              ? "Close quick add"
              : "Open quick add"
        }
        onPointerEnter={() => {
          if (!pathname?.startsWith("/accounts/institutions/") && !pathname?.startsWith("/split-bill") && !pathname?.startsWith("/investments") && !pathname?.startsWith("/recurring")) {
            void loadDashboardManualTransactionModal();
            void loadImportFilesModal();
          }
        }}
        onFocus={() => {
          if (!pathname?.startsWith("/accounts/institutions/") && !pathname?.startsWith("/split-bill") && !pathname?.startsWith("/investments") && !pathname?.startsWith("/recurring")) {
            void loadDashboardManualTransactionModal();
            void loadImportFilesModal();
          }
        }}
        onClick={openQuickAddTransaction}
      >
        <MenuIcon name="plus" />
      </button>
      <input
        ref={quickAddFileInputRef}
        className="hidden-file-input"
        type="file"
        multiple
        onChange={handleQuickAddFileChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={quickAddPhotoInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleQuickAddPhotoChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={quickAddPhotoLibraryInputRef}
        className="hidden-file-input"
        type="file"
        accept="image/*"
        multiple
        onChange={handleQuickAddPhotoChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      {isQuickAddOpen ? (
        <div className="shell-quick-add-popover" ref={quickAddPopoverRef} role="menu" aria-label="Quick add">
          <button
            className="shell-quick-add-popover__item shell-quick-add-popover__item--mobile-only shell-quick-add-popover__item--camera"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsQuickAddOpen(false);
              openQuickAddCamera();
            }}
          >
            <span className="shell-quick-add-popover__emoji" aria-hidden="true">📷</span>
            <strong>Camera</strong>
          </button>
          <button
            className="shell-quick-add-popover__item shell-quick-add-popover__item--receipt"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsQuickAddOpen(false);
              openQuickAddPhotoLibrary();
            }}
          >
            <span className="shell-quick-add-popover__emoji" aria-hidden="true">🖼️</span>
            <strong>Photo Library</strong>
          </button>
          <button
            className="shell-quick-add-popover__item shell-quick-add-popover__item--primary"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsQuickAddOpen(false);
              openQuickAddFilePicker();
            }}
          >
            <MenuIcon name="upload" />
            <strong>Upload Files</strong>
          </button>
          <button
            className="shell-quick-add-popover__item shell-quick-add-popover__item--manual"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsQuickAddOpen(false);
              if (window.matchMedia("(max-width: 1100px)").matches) navigateTo("/transactions/new");
              else setQuickAddModal("transaction");
            }}
          >
            <MenuIcon name="plus" />
            <strong>Add Manually</strong>
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
          defaultImportMode={quickAddImportMode}
          initialFiles={quickAddSeedFiles}
          onInitialFilesConsumed={() => setQuickAddSeedFiles(null)}
          onClose={closeQuickAddModal}
          onImported={async (summary) => {
            // The shell uploader can be opened from any page. Publish its
            // confirmed summary so client pages (especially Transactions) can
            // refresh their local data immediately instead of waiting for a
            // manual reload.
            publishImportedSummary(searchWorkspaceId, summary);
            router.refresh();
          }}
        />
      ) : null}

      <nav className={`shell-bottom-nav glass${isBottomNavCompact ? " is-compact" : ""}`} aria-label="Primary mobile navigation">
        <Link
          href="/home"
          prefetch={false}
          className={`shell-bottom-nav__item${active === "dashboard" || pathname?.startsWith("/home") ? " is-active" : ""}`}
          aria-current={active === "dashboard" || pathname?.startsWith("/home") ? "page" : undefined}
          onClick={(event) => handleNavigationLinkClick(event, "/home")}
          onMouseEnter={() => prefetchNavTarget("/home")}
          onTouchStart={() => prefetchNavTarget("/home")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="dashboard" />
          </span>
          <span className="shell-bottom-nav__label">Home</span>
        </Link>
        <Link
          href="/transactions"
          prefetch={false}
          className={`shell-bottom-nav__item${active === "transactions" || pathname?.startsWith("/transactions") ? " is-active" : ""}`}
          aria-current={active === "transactions" || pathname?.startsWith("/transactions") ? "page" : undefined}
          onClick={(event) => handleNavigationLinkClick(event, "/transactions")}
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
          className={`shell-bottom-nav__add${isQuickAddOpen ? " is-open" : ""}`}
          type="button"
          aria-label={isQuickAddOpen ? "Close quick add" : "Open quick add"}
          title={isQuickAddOpen ? "Close quick add" : "Open quick add"}
          onClick={() => {
            setIsBottomNavCompact(false);
            openQuickAddTransaction();
          }}
        >
          <MenuIcon name="plus" />
        </button>
        <Link
          href="/adviser"
          prefetch={false}
          className={`shell-bottom-nav__item${active === "adviser" || pathname?.startsWith("/adviser") ? " is-active" : ""}`}
          aria-current={active === "adviser" || pathname?.startsWith("/adviser") ? "page" : undefined}
          onClick={(event) => handleNavigationLinkClick(event, "/adviser")}
          onMouseEnter={() => prefetchNavTarget("/adviser")}
          onTouchStart={() => prefetchNavTarget("/adviser")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="adviser" />
          </span>
          <span className="shell-bottom-nav__label">Adviser</span>
        </Link>
        <button
          type="button"
          className={`shell-bottom-nav__item shell-bottom-nav__item--account${isAccountNavActive ? " is-active" : ""}`}
          aria-label={`${isProfileDrawerOpen ? "Close" : "Open"} Account menu${notificationCount > 0 ? `, ${notificationCount} unread notifications` : ""}`}
          aria-expanded={isProfileDrawerOpen}
          aria-controls="mobile-settings-drawer"
          onClick={() => {
            setIsBottomNavCompact(false);
            setOpenMenu(null);
            setIsSidebarOpen(false);
            setIsQuickAddOpen(false);
            setIsProfileDrawerOpen((current) => !current);
          }}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            {profileImage ? (
              <img className="shell-bottom-nav__profile-photo" src={profileImage} alt="" loading="eager" decoding="async" fetchPriority="high" />
            ) : (
              <MenuIcon name="profile" />
            )}
          </span>
          <span className="shell-bottom-nav__label">Account</span>
          <NotificationCountBadge count={notificationCount} />
        </button>
      </nav>

      <main
        className={`content content--${active} ${titleAddon ? "content--has-title-addon" : "content--plain-title"}${
          mobileLeadingAction ? " content--has-mobile-leading-action" : ""
        }${mobileSubheader ? " content--has-mobile-subheader" : ""}`}
        onClickCapture={(event) => {
          if (event.target instanceof Element && event.target.closest(".shell-mobile-more-link")) {
            return;
          }
          if (isSidebarOpen) {
            setIsSidebarOpen(false);
          }
        }}
      >
        {!showTopbar ? (
          <div className="shell-compact-bar glass">
            <div className="shell-topbar-leading">
              <button
                className={`shell-mobile-more-link${isSidebarOpen ? " is-active" : ""}`}
                type="button"
                aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
                aria-expanded={isSidebarOpen}
                aria-controls="primary-navigation"
                onClick={() => setIsSidebarOpen((current) => !current)}
              >
                <MenuIcon name="menu" open={isSidebarOpen} />
              </button>
              {shouldShowBackButton ? (
                <button
                  className="shell-back-button"
                  type="button"
                  aria-label="Go back"
                  onClick={handleBack}
                >
                  <MenuIcon name="chevron-left" />
                </button>
              ) : null}
              <div className="shell-topbar-leading__actions">{mobileLeadingAction ?? (active !== "adviser" ? <AdviserHeaderLink /> : null)}</div>
            </div>
            <div
              className={`shell-compact-bar__copy ${hideCompactBarCopyOnMobile ? "shell-compact-bar__copy--hide-mobile" : ""} ${
                hideCompactBarKickerAndSubtitleOnMobile ? "shell-compact-bar__copy--hide-chrome-on-mobile" : ""
              }`}
            >
              {kicker ? <p className="eyebrow">{kicker}</p> : null}
              <div className="topbar__title-row">
                <h1>{mobileOverlayChrome?.title ?? title}</h1>
                {desktopTitleAction ? <div className="topbar__desktop-title-action">{desktopTitleAction}</div> : null}
                {titleAddon ? <div className="topbar__title-addon">{titleAddon}</div> : null}
              </div>
              {subtitle ? <p className="topbar-subtitle">{subtitle}</p> : null}
            </div>
            {actions || homeNotificationsAction ? (
              <div className="shell-compact-bar__actions">
                {homeNotificationsAction}
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
        {showTopbar ? (
          <header className="topbar glass">
            <div className="shell-topbar-leading">
              <button
                className={`shell-mobile-more-link${isSidebarOpen ? " is-active" : ""}`}
                type="button"
                aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
                aria-expanded={isSidebarOpen}
                aria-controls="primary-navigation"
                onClick={() => setIsSidebarOpen((current) => !current)}
              >
                <MenuIcon name="menu" open={isSidebarOpen} />
              </button>
              {shouldShowBackButton ? (
                <button
                  className={`shell-back-button${mobileFallbackBackOnly ? " shell-back-button--mobile-only" : ""}`}
                  type="button"
                  aria-label="Go back"
                  onClick={handleBack}
                >
                  <MenuIcon name="chevron-left" />
                </button>
              ) : null}
              <div className="shell-topbar-leading__actions">{mobileLeadingAction ?? (active !== "adviser" ? <AdviserHeaderLink /> : null)}</div>
            </div>
            <div className="topbar__title-wrap">
              {kicker ? <p className="eyebrow">{kicker}</p> : null}
              <div className="topbar__title-row">
                <h1>{mobileOverlayChrome?.title ?? title}</h1>
                {desktopTitleAction ? <div className="topbar__desktop-title-action">{desktopTitleAction}</div> : null}
                {titleAddon ? <div className="topbar__title-addon">{titleAddon}</div> : null}
              </div>
              {subtitle ? <p className="topbar-subtitle">{subtitle}</p> : null}
            </div>
            <div className="topbar-actions">
              {homeNotificationsAction}
              {actions}
            </div>
          </header>
        ) : null}

        {mobileSubheader ? (
          <div className="shell-mobile-subheader" aria-label={`${title} sections`}>
            {mobileSubheader}
          </div>
        ) : null}

        <div className="content-body">{children}</div>
      </main>
      </div>
    </CloverChromeContext.Provider>
  );
}

"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { persistSelectedWorkspaceId, readSelectedWorkspaceId, syncSelectedWorkspaceCookie } from "@/lib/workspace-selection";
import { clearAllWorkspaceCaches, clearLegacyWorkspaceCaches } from "@/lib/workspace-cache";
import { DashboardManualTransactionModal } from "@/components/dashboard-top-actions";
import { ImportFilesModal } from "@/components/import-files-modal";
import { signOutToLanding } from "@/lib/sign-out";
import { readAccountIdentityCache, writeAccountIdentityCache } from "@/lib/account-identity-cache";
import {
  getErrorMessage,
  isChunkLoadErrorMessage,
  recoverFromChunkLoadError,
} from "@/lib/chunk-error-recovery";
import {
  clearImportActivity,
  getImportActivityTimingSummary,
  readImportActivity,
  subscribeImportActivity,
  type ImportActivitySnapshot,
} from "@/lib/import-activity";
import { formatImportResultHeadline } from "@/lib/import-result-summary";
import { publishImportedSummary } from "@/lib/imported-summary-events";
import {
  getGuidanceMenuPreset,
  isGuidanceMenuVisibility,
  SETTINGS_GUIDANCE_MENU_EVENT,
  SETTINGS_GUIDANCE_MENU_KEY,
  type GuidanceMenuVisibility,
} from "@/lib/guidance-menu";

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
      { href: "/adviser", label: "Adviser", key: "adviser" as const },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/accounts", label: "Accounts", key: "accounts" as const },
      { href: "/transactions", label: "Transactions", key: "transactions" as const },
      { href: "/recurring", label: "Recurring", key: "recurring" as const },
      { href: "/circles", label: "Circles", key: "circles" as const },
      { href: "/split-bill", label: "Split Bills", key: "split-bill" as const },
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

const shouldPrefetchNavHref = (href: string) => href !== "/split-bill";
const MENU_ICON_VERSION = "20260709";

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

const MENU_ICON_SRC: Partial<Record<IconName, string>> = {
  dashboard: "/assets/3d%20icons/home.png?v=20260723",
  accounts: "/assets/3d%20icons/menu/bank-account.png",
  investments: "/assets/3d%20icons/menu/investments.png",
  "split-bill": "/assets/3d%20icons/menu/split-bills.png?v=20260724",
  circles: "/assets/3d%20icons/circles.png?v=20260723",
  transactions: "/assets/3d%20icons/transactions.png?v=20260723",
  recurring: "/assets/3d%20icons/recurring.png?v=20260723",
  reports: "/assets/3d%20icons/menu/reports.png",
  adviser: "/assets/3d%20icons/menu/adviser.png",
  budgeting: "/assets/3d%20icons/menu/budgeting.png",
  goals: "/assets/icons/goals.png",
  more: "/assets/3d%20icons/menu/more.png",
  notifications: `/assets/3d%20icons/notifications.png?v=${MENU_ICON_VERSION}`,
  settings: `/assets/3d%20icons/settings.png?v=${MENU_ICON_VERSION}`,
  help: "/assets/3d%20icons/menu/help.png",
  search: "/assets/3d%20icons/menu/search.png",
  profile: "/assets/3d%20icons/menu/account.png",
  "sign-out": "/assets/3d%20icons/menu/log-out.png",
};

const PRELOADED_MENU_ICON_NAMES: IconName[] = [
  "dashboard",
  "accounts",
  "transactions",
  "recurring",
  "adviser",
  "notifications",
  "settings",
  "sign-out",
  "investments",
  "split-bill",
  "circles",
  "goals",
  "budgeting",
  "reports",
  "help",
  "more",
  "profile",
];

function MenuIcon({ name }: { name: IconName }) {
  const imageSrc = MENU_ICON_SRC[name];
  if (imageSrc) {
    return (
      <img
        src={imageSrc}
        alt=""
        width={96}
        height={96}
        loading="eager"
        decoding="async"
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

type ShellNotification = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: string;
  dismissLabel: string;
  onDismiss: () => void;
};

type ShellCircleInvitation = {
  id: string;
  circleName: string;
  invitedBy: string;
  href: string;
};

const dismissedNotificationStorageKey = "clover.dismissed-notifications.v1";

const readDismissedNotifications = () => {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const raw = window.localStorage.getItem(dismissedNotificationStorageKey);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
};

const writeDismissedNotifications = (dismissed: Set<string>) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(dismissedNotificationStorageKey, JSON.stringify(Array.from(dismissed)));
  } catch {
    // Dismissal is convenience-only; ignore storage failures.
  }
};

const formatRelativeNotificationTime = (updatedAt: number) => {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return "Just now";
  }

  const secondsAgo = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (secondsAgo < 10) return "Just now";
  if (secondsAgo < 60) return `${secondsAgo}s ago`;

  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;

  const hoursAgo = Math.floor(minutesAgo / 60);
  return `${hoursAgo}h ago`;
};

const getImportNotificationCopy = (activity: ImportActivitySnapshot) => {
  const timingSummary = getImportActivityTimingSummary(activity);

  if (activity.status === "error") {
    return {
      tone: "Needs attention",
      title: activity.errorTitle ?? "Import needs attention",
      detail: [activity.errorMessage ?? activity.detail ?? "Clover could not finish this import automatically.", timingSummary]
        .filter(Boolean)
        .join(" · "),
    };
  }

  if (activity.status === "done") {
    return {
      tone: "Complete",
      title: "Import complete",
      detail: [
        (activity.summary ? formatImportResultHeadline(activity.summary) : "") ||
          activity.detail ||
          "Your import is ready in Clover.",
        timingSummary,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }

  const fileProgress =
    activity.fileTotal > 0
      ? `${Math.min(activity.completedFiles, activity.fileTotal)} of ${activity.fileTotal} files ready`
      : "Import queued";
  const percent = `${Math.round(Math.max(0, Math.min(100, activity.progress)))}%`;

  return {
    tone: "In progress",
    title: "Import in progress",
    detail: [activity.detail, timingSummary, `${fileProgress} · ${percent}`].filter(Boolean).join(" · "),
  };
};

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
  const quickAddFileInputRef = useRef<HTMLInputElement | null>(null);
  const quickAddPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const quickAddPhotoLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const [openMenu, setOpenMenu] = useState<"notifications" | "profile" | "more" | null>(null);
  const [guidanceMenuVisibility, setGuidanceMenuVisibility] = useState<GuidanceMenuVisibility>(() =>
    getGuidanceMenuPreset("very-comfortable")
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [notificationsPopoverStyle, setNotificationsPopoverStyle] = useState<{ left: number; bottom: number } | null>(null);
  const [quickAddModal, setQuickAddModal] = useState<"transaction" | "import" | null>(null);
  const [quickAddSeedFiles, setQuickAddSeedFiles] = useState<File[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchWorkspaceId, setSearchWorkspaceId] = useState(() => readSelectedWorkspaceId());
  const [searchAccounts, setSearchAccounts] = useState<SidebarSearchAccount[]>([]);
  const [searchPlanTier, setSearchPlanTier] = useState<"free" | "pro" | "unknown">("unknown");
  const [searchTicker, setSearchTicker] = useState<SidebarSearchMarket | null>(null);
  const [searchTickerLoading, setSearchTickerLoading] = useState(false);
  const [importActivity, setImportActivity] = useState<ImportActivitySnapshot | null>(() => readImportActivity());
  const [reviewQueueCount, setReviewQueueCount] = useState(0);
  const [circleInvitations, setCircleInvitations] = useState<ShellCircleInvitation[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(() => readDismissedNotifications());
  const [cachedProfileImage] = useState<string | null>(() => readAccountIdentityCache()?.imageUrl ?? null);
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
  const profileImage = user?.imageUrl ?? cachedProfileImage;
  const isProfileActive = active === "profile" || pathname?.startsWith("/profile");
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
  const shouldShowBackButton =
    !!previousPathname &&
    !pathname?.startsWith("/home") &&
    previousPathname !== "/home" &&
    previousPathname !== pathname;
  const closeChrome = () => {
    setOpenMenu(null);
    setIsSearchOpen(false);
    setIsSidebarOpen(false);
    setNotificationsPopoverStyle(null);
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
      const popoverWidth = 268;
      const sidebarRight = sidebarRect?.right ?? buttonRect.right;
      const left = sidebarRight + popoverWidth + 24 <= window.innerWidth
        ? sidebarRight + 12
        : Math.max(12, buttonRect.left - popoverWidth - 12);

      setNotificationsPopoverStyle({
        left: Math.min(left, window.innerWidth - popoverWidth - 12),
        bottom: Math.max(12, window.innerHeight - buttonRect.top + 12),
      });
    }

    setOpenMenu("notifications");
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
    setQuickAddSeedFiles(null);
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
    fetch("/api/circle-invitations", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { invitations?: ShellCircleInvitation[] } | null) => {
        if (!cancelled) setCircleInvitations(result?.invitations ?? []);
      })
      .catch(() => {
        if (!cancelled) setCircleInvitations([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => subscribeImportActivity(() => setImportActivity(readImportActivity())), []);

  useEffect(() => {
    let cancelled = false;

    const loadReviewQueueCount = async () => {
      if (!searchWorkspaceId) {
        setReviewQueueCount(0);
        return;
      }

      try {
        const response = await fetch(`/api/review?workspaceId=${encodeURIComponent(searchWorkspaceId)}`);
        if (!response.ok || cancelled) {
          return;
        }

        const payload = await response.json();
        const count = Array.isArray(payload.transactions) ? payload.transactions.length : 0;
        if (!cancelled) {
          setReviewQueueCount(count);
        }
      } catch {
        if (!cancelled) {
          setReviewQueueCount(0);
        }
      }
    };

    void loadReviewQueueCount();

    return () => {
      cancelled = true;
    };
  }, [searchWorkspaceId]);

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

  const dismissNotification = (notificationId: string) => {
    setDismissedNotifications((current) => {
      const next = new Set(current);
      next.add(notificationId);
      writeDismissedNotifications(next);
      return next;
    });
  };

  const notifications = useMemo<ShellNotification[]>(() => {
    const items: ShellNotification[] = [];

    if (importActivity) {
      const copy = getImportNotificationCopy(importActivity);
      const title = importActivity.fileName ? `${copy.title}: ${importActivity.fileName}` : copy.title;
      items.push({
        id: `import:${importActivity.workspaceId}:${importActivity.updatedAt}`,
        title,
        detail: `${copy.detail}${importActivity.updatedAt ? ` · ${formatRelativeNotificationTime(importActivity.updatedAt)}` : ""}`,
        href: "/notifications",
        tone: copy.tone,
        dismissLabel: "Dismiss import notification",
        onDismiss: () => {
          clearImportActivity();
          setImportActivity(null);
        },
      });
    }

    if (searchWorkspaceId && reviewQueueCount > 0) {
      const notificationId = `review:${searchWorkspaceId}:${reviewQueueCount}`;
      if (!dismissedNotifications.has(notificationId)) {
        items.push({
          id: notificationId,
          title: `${reviewQueueCount} transaction${reviewQueueCount === 1 ? "" : "s"} need attention`,
          detail: "Review low-confidence categories, duplicates, or rows Clover wants you to confirm.",
          href: "/review",
          tone: "Review",
          dismissLabel: "Dismiss review notification",
          onDismiss: () => dismissNotification(notificationId),
        });
      }
    }

    circleInvitations.forEach((invitation) => {
      const notificationId = `circle-invitation:${invitation.id}`;
      if (!dismissedNotifications.has(notificationId)) {
        items.push({
          id: notificationId,
          title: `Join ${invitation.circleName}`,
          detail: `${invitation.invitedBy} invited you to a Circle.`,
          href: invitation.href,
          tone: "Circle invitation",
          dismissLabel: "Dismiss Circle invitation notification",
          onDismiss: () => dismissNotification(notificationId),
        });
      }
    });

    return items;
  }, [circleInvitations, dismissedNotifications, importActivity, reviewQueueCount, searchWorkspaceId]);
  const notificationCount = notifications.length;
  const navigateTo = (href: string) => {
    closeChrome();
    if (typeof window !== "undefined" && pathname?.startsWith("/accounts")) {
      const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentHref !== href) {
        window.location.assign(href);
      }
      return;
    }

    router.push(href);
  };

  const prefetchNavTarget = (href: string) => {
    if (!shouldPrefetchNavHref(href)) {
      return;
    }

    void router.prefetch(href);
  };

  const openQuickAddTransaction = () => {
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

    setIsQuickAddOpen((current) => !current);
  };

  const closeQuickAddModal = () => {
    setQuickAddModal(null);
    setQuickAddSeedFiles(null);
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
    input.click();
  };

  const openQuickAddFilePicker = () => {
    const input = quickAddFileInputRef.current;
    if (!input) {
      return;
    }

    input.value = "";
    input.click();
  };

  const handleQuickAddFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    setIsQuickAddOpen(false);
    setQuickAddSeedFiles(files);
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
    setQuickAddModal("import");
  };

  const handleSignOut = () => {
    persistSelectedWorkspaceId("");
    clearAllWorkspaceCaches();
    void signOutToLanding(signOut);
  };

  return (
    <CloverChromeContext.Provider value={{ closeChrome }}>
      <div className={`app-shell ${isSidebarOpen ? "is-sidebar-open" : ""}`} ref={shellRef}>
      <div className="menu-icon-preload" aria-hidden="true">
        {PRELOADED_MENU_ICON_NAMES.map((iconName) => {
          const imageSrc = MENU_ICON_SRC[iconName];
          if (!imageSrc) {
            return null;
          }

          return <img key={iconName} src={imageSrc} alt="" width={96} height={96} loading="eager" decoding="async" fetchPriority="high" />;
        })}
      </div>
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
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary" id="primary-navigation">
          {visibleDesktopNavSections.map((section) => (
            <div key={section.label} className="sidebar-nav__section">
              <p className="sidebar-nav__section-label">{section.label}</p>
              {section.items.map((item) => (
                <button
                  key={item.key}
                  className={`nav-link ${active === item.key ? "is-active" : ""}`}
                  aria-current={active === item.key ? "page" : undefined}
                  type="button"
                  onMouseDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }

                    event.preventDefault();
                    navigateTo(item.href);
                  }}
                  onClick={() => navigateTo(item.href)}
                  onMouseEnter={() => prefetchNavTarget(item.href)}
                  onTouchStart={() => prefetchNavTarget(item.href)}
                >
                  <span className="nav-link__icon" aria-hidden="true">
                    <MenuIcon name={item.key} />
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
          {hasHiddenDesktopNavItems ? (
            <div className="sidebar-nav__section sidebar-nav__section--more">
              <button
                className={`nav-link ${isMoreActive ? "is-active" : ""}`}
                aria-current={isMoreActive ? "page" : undefined}
                type="button"
                onMouseDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }

                  event.preventDefault();
                  navigateTo("/more");
                }}
                onClick={() => navigateTo("/more")}
                onMouseEnter={() => prefetchNavTarget("/more")}
                onTouchStart={() => prefetchNavTarget("/more")}
              >
                <span className="nav-link__icon" aria-hidden="true">
                  <MenuIcon name="more" />
                </span>
                More
              </button>
            </div>
          ) : null}
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
                <img src="/assets/3d%20icons/menu/account.png" alt="" width={96} height={96} loading="eager" decoding="async" className="sidebar-profile__avatar-icon" />
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
            onClick={handleNotificationsToggle}
          >
            <MenuIcon name="notifications" />
          </button>
          <button
            className={`sidebar-icon-button sidebar-footer__help${pathname?.startsWith("/help") ? " is-active" : ""}`}
            type="button"
            aria-label="Help"
            aria-current={pathname?.startsWith("/help") ? "page" : undefined}
            onMouseDown={(event) => {
              if (event.button !== 0) {
                return;
              }

              event.preventDefault();
              navigateTo("/help");
            }}
            onClick={() => navigateTo("/help")}
            onMouseEnter={() => prefetchNavTarget("/help")}
            onTouchStart={() => prefetchNavTarget("/help")}
          >
            <MenuIcon name="help" />
          </button>

          {isProfileMenuOpen ? (
            <div ref={profilePopoverRef} className="sidebar-popover sidebar-popover--profile" role="menu" aria-label="Account menu">
              <div className="sidebar-popover__head">
                <span className="sidebar-popover__title">{displayName}</span>
              </div>
              <div className="sidebar-popover__links sidebar-popover__links--bare">
                <button
                  className="sidebar-popover__link sidebar-popover__button sidebar-popover__link--bare"
                  type="button"
                  onMouseDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }

                    event.preventDefault();
                    navigateTo("/settings");
                  }}
                  onClick={() => navigateTo("/settings")}
                  onMouseEnter={() => prefetchNavTarget("/settings")}
                  onTouchStart={() => prefetchNavTarget("/settings")}
                  role="menuitem"
                >
                  <span className="sidebar-popover__link-icon" aria-hidden="true">
                    <MenuIcon name="settings" />
                  </span>
                  <span>Settings</span>
                </button>
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
            </div>
            <div className="sidebar-popover__items">
              {notifications.length ? (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="sidebar-popover__item sidebar-popover__notification"
                    role="none"
                  >
                    <button
                      type="button"
                      className="sidebar-popover__notification-main"
                      role="menuitem"
                      onClick={() => navigateTo(notification.href)}
                      onMouseEnter={() => prefetchNavTarget(notification.href)}
                      onTouchStart={() => prefetchNavTarget(notification.href)}
                    >
                      <span className="sidebar-popover__notification-tone">{notification.tone}</span>
                      <span className="sidebar-popover__notification-title">{notification.title}</span>
                      <span className="sidebar-popover__notification-detail">{notification.detail}</span>
                    </button>
                    <button
                      type="button"
                      className="sidebar-popover__notification-dismiss"
                      aria-label={notification.dismissLabel}
                      onClick={(event) => {
                        event.stopPropagation();
                        notification.onDismiss();
                      }}
                    >
                      x
                    </button>
                  </div>
                ))
              ) : (
                <div className="sidebar-popover__empty">You’re all caught up. New import and review updates will show here.</div>
              )}
            </div>
          </div>,
          document.body
        )
      ) : null}

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
      <input
        ref={quickAddFileInputRef}
        className="hidden-file-input"
        type="file"
        accept=".csv,.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
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
            className="shell-quick-add-popover__item shell-quick-add-popover__item--mobile-only"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsQuickAddOpen(false);
              openQuickAddPhotoLibrary();
            }}
          >
            <strong>🖼️ Photos</strong>
          </button>
          <button
            className="shell-quick-add-popover__item shell-quick-add-popover__item--mobile-only"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsQuickAddOpen(false);
              openQuickAddCamera();
            }}
          >
            <strong>📷 Camera</strong>
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
              setQuickAddModal("transaction");
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

      <nav className="shell-bottom-nav glass" aria-label="Primary mobile navigation">
        <button
          className={`shell-bottom-nav__item${active === "dashboard" || pathname?.startsWith("/home") ? " is-active" : ""}`}
          aria-current={active === "dashboard" || pathname?.startsWith("/home") ? "page" : undefined}
          type="button"
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            event.preventDefault();
            navigateTo("/home");
          }}
          onClick={() => navigateTo("/home")}
          onMouseEnter={() => prefetchNavTarget("/home")}
          onTouchStart={() => prefetchNavTarget("/home")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="dashboard" />
          </span>
          <span className="shell-bottom-nav__label">Home</span>
        </button>
        <button
          className={`shell-bottom-nav__item${active === "transactions" || pathname?.startsWith("/transactions") ? " is-active" : ""}`}
          aria-current={active === "transactions" || pathname?.startsWith("/transactions") ? "page" : undefined}
          type="button"
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            event.preventDefault();
            navigateTo("/transactions");
          }}
          onClick={() => navigateTo("/transactions")}
          onMouseEnter={() => prefetchNavTarget("/transactions")}
          onTouchStart={() => prefetchNavTarget("/transactions")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="transactions" />
          </span>
          <span className="shell-bottom-nav__label">Transactions</span>
        </button>
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
        <button
          className={`shell-bottom-nav__item${active === "adviser" || pathname?.startsWith("/adviser") ? " is-active" : ""}`}
          aria-current={active === "adviser" || pathname?.startsWith("/adviser") ? "page" : undefined}
          type="button"
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            event.preventDefault();
            navigateTo("/adviser");
          }}
          onClick={() => navigateTo("/adviser")}
          onMouseEnter={() => prefetchNavTarget("/adviser")}
          onTouchStart={() => prefetchNavTarget("/adviser")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="adviser" />
          </span>
          <span className="shell-bottom-nav__label">Adviser</span>
        </button>
        <button
          className={`shell-bottom-nav__item${isMoreActive ? " is-active" : ""}`}
          aria-current={isMoreActive ? "page" : undefined}
          type="button"
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }

            event.preventDefault();
            navigateTo("/more");
          }}
          onClick={() => navigateTo("/more")}
          onMouseEnter={() => prefetchNavTarget("/more")}
          onTouchStart={() => prefetchNavTarget("/more")}
        >
          <span className="shell-bottom-nav__icon" aria-hidden="true">
            <MenuIcon name="more" />
          </span>
          <span className="shell-bottom-nav__label">More</span>
        </button>
      </nav>

      <main
        className={`content content--${active}`}
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

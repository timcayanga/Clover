"use client";

import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  getGuidanceMenuPreset,
  guidanceMenuItems,
  isGuidanceMenuVisibility,
  SETTINGS_GUIDANCE_MENU_EVENT,
  SETTINGS_GUIDANCE_MENU_KEY,
  type GuidanceMenuKey,
  type GuidanceMenuVisibility,
} from "@/lib/guidance-menu";
import { useClerk, useSession, useSessionList, useUser } from "@clerk/nextjs";
import { UserAvatarEditor } from "@/components/user-avatar-editor";
import { applyHelperTextPreference, HELPER_TEXT_STORAGE_KEY, readStoredHelperTextPreference } from "@/lib/helper-text-preference";
import { applyThemeMode, readStoredThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme-preference";
import { getCurrencyCatalogCodes, getCurrencyCatalogOption } from "@/lib/currencies";
import { clearAllWorkspaceCaches } from "@/lib/workspace-cache";
import { persistSelectedWorkspaceId, syncSelectedWorkspaceCookie } from "@/lib/workspace-selection";
import type { BillingInterval } from "@/lib/billing-plans";
import { signOutToLanding } from "@/lib/sign-out";

const SettingsCategoriesPanel = dynamic(
  () => import("@/components/settings-categories-panel").then((module) => module.SettingsCategoriesPanel),
  {
    loading: () => (
      <article className="settings-action-card">
        <div>
          <h5>Loading categories</h5>
          <p>Fetching your category tools now.</p>
        </div>
      </article>
    ),
  }
);

const SettingsProfilesPanel = dynamic(
  () => import("@/components/settings-profiles-panel").then((module) => module.SettingsProfilesPanel),
  { loading: () => null }
);

const SettingsPlanPanel = dynamic(
  () => import("@/components/settings-plan-panel").then((module) => module.SettingsPlanPanel),
  { loading: () => null }
);

type SettingsSectionKey =
  | "account"
  | "profiles"
  | "notifications"
  | "security"
  | "imports"
  | "regional"
  | "display"
  | "data"
  | "categories"
  | "plan";

type ProfileSummary = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
};

type BillingSubscriptionSummary = {
  status: string;
  interval: BillingInterval | null;
  pendingPlanId: string | null;
  pendingInterval: BillingInterval | null;
  providerSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  nextBillingTime: string | null;
  planTier: "free" | "pro";
};

type NotificationPreferences = {
  weeklySummary: boolean;
  importComplete: boolean;
  transactionsNeedReview: boolean;
  budgetWarnings: boolean;
  inApp: boolean;
  email: boolean;
};

type ImportPreferences = {
  duplicateHandling: "ask" | "skip" | "replace";
  reviewLowConfidence: boolean;
  openReviewAfterImport: boolean;
  askBeforeDifferentProfile: boolean;
};

type RegionalPreferences = {
  baseCurrency: string;
  dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD";
  numberFormat: "1,234.56" | "1.234,56";
  timeZone: string;
};

type DataUsePreferences = {
  improveSuggestions: boolean;
  adviserUsesContext: boolean;
  clearCachedStateOnSignOut: boolean;
};

type WorkspaceDefaults = {
  defaultLandingPage: "dashboard" | "transactions" | "accounts" | "reports";
  defaultImportProfileId: string;
};

type SecuritySessionSummary = {
  id: string;
  status: string;
  lastActiveAt: string | null;
  isCurrent: boolean;
};

type DataDeleteScope = "transactions" | "accounts" | "all";

type DataDeleteModalState = {
  scope: DataDeleteScope;
  phase: "confirm" | "success";
  deletedCount: number | null;
};

type SettingsHubProps = {
  mode?: "menu" | "panel" | "full";
  initialSection?: SettingsSectionKey;
  preferredBillingInterval?: BillingInterval;
  workspaceId: string;
  billingCustomerId?: string | null;
  workspaceName: string;
  selectedProfileId: string;
  initialProfileList?: ProfileSummary[];
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl?: string | null;
  planTier: "free" | "pro";
  profileLimit: number | null;
  initialPlanLimits?: {
    accountLimit: number | null;
    monthlyUploadLimit: number | null;
    transactionLimit: number | null;
  } | null;
  initialPlanUsage?: {
    accountCount: number;
    cashAccountCount: number;
    monthlyUploadCount: number;
    transactionCount: number;
  } | null;
  paypalClientId?: string | null;
  paypalMonthlyPlanId?: string | null;
  paypalAnnualPlanId?: string | null;
  paypalBuyerCountry?: string | null;
  disableWorkspaceBootstrap?: boolean;
};

const SETTINGS_ACCOUNT_IDENTITY_CACHE_KEY = "clover.settings.account-identity.v1";
const SETTINGS_NOTIFICATIONS_KEY = "clover.settings.notifications.v1";
const SETTINGS_IMPORTS_KEY = "clover.settings.imports.v1";
const SETTINGS_REGIONAL_KEY = "clover.settings.regional.v1";
const SETTINGS_DATA_USE_KEY = "clover.settings.data-use.v1";
const SETTINGS_WORKSPACE_DEFAULTS_KEY = "clover.settings.workspace-defaults.v1";
const SETTINGS_GUIDANCE_KEY = "clover.settings.guidance-level.v1";
const FALLBACK_TIME_ZONES = [
  "GMT",
  "UTC",
  "Africa/Johannesburg",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Phoenix",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Manila",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Pacific/Auckland",
] as const;

type SettingsAccountIdentityCache = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string;
  imageUrl?: string | null;
};

type GuidancePresetLevel = "learning" | "comfortable" | "very-comfortable";
type GuidanceLevel = GuidancePresetLevel | "custom";

const guidanceOptions: Array<{ value: GuidancePresetLevel; label: string; helper: string }> = [
  {
    value: "learning",
    label: "Still learning",
    helper: "Fewer choices, simpler language, and more guided next steps.",
  },
  {
    value: "comfortable",
    label: "Comfortable",
    helper: "Balanced detail with practical explanations when they help.",
  },
  {
    value: "very-comfortable",
    label: "Very comfortable",
    helper: "Keep Clover streamlined, with metrics and controls close at hand.",
  },
];

const readStoredAccountIdentity = (): SettingsAccountIdentityCache | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_ACCOUNT_IDENTITY_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as SettingsAccountIdentityCache;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const readStoredJsonValue = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
};

const writeStoredJsonValue = (key: string, value: unknown) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures and keep the in-memory preference state.
  }
};

const getDefaultProfileId = (profiles: ProfileSummary[]) =>
  profiles
    .filter((profile) => profile.type === "personal")
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())[0]?.id ?? "";

const sortProfiles = (profiles: ProfileSummary[]) =>
  [...profiles].sort((left, right) => {
    if (left.type === "personal" && right.type !== "personal") {
      return -1;
    }
    if (right.type === "personal" && left.type !== "personal") {
      return 1;
    }

    if (left.type === "personal" && right.type === "personal") {
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });

const normalizeProfileList = (profiles: ProfileSummary[], fallbackProfile?: { id: string; name: string }) => {
  const nextProfiles = [...profiles];

  if (fallbackProfile?.id && !nextProfiles.some((profile) => profile.id === fallbackProfile.id)) {
    nextProfiles.unshift({
      id: fallbackProfile.id,
      name: fallbackProfile.name || "Personal",
      type: "personal",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
  }

  return sortProfiles(nextProfiles);
};

const getTimeZoneOptions = () => {
  const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  const browserTimeZones = typeof supportedValuesOf === "function" ? supportedValuesOf("timeZone") : [];
  return Array.from(new Set(["GMT", "UTC", ...browserTimeZones, ...FALLBACK_TIME_ZONES])).sort((left, right) => left.localeCompare(right));
};

const formatTimeZoneLabel = (value: string) => (value === "GMT" || value === "UTC" ? value : value.replaceAll("_", " / "));

const formatRelativeSessionTime = (value: string | null) => {
  if (!value) {
    return "No recent activity";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No recent activity";
  }

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) {
    return `Active ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `Active ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `Active ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};

function SettingsToggleRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-toggle-row__copy">
        <strong>{label}</strong>
      </div>
      <button
        type="button"
        className={`settings-ios-switch${checked ? " is-on" : ""}`}
        aria-pressed={checked}
        aria-label={`${label}: ${checked ? "On" : "Off"}`}
        onClick={onToggle}
      >
        <span className="settings-ios-switch__track" aria-hidden="true">
          <span className="settings-ios-switch__thumb" />
        </span>
      </button>
    </div>
  );
}

const writeStoredAccountIdentity = (identity: SettingsAccountIdentityCache) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SETTINGS_ACCOUNT_IDENTITY_CACHE_KEY, JSON.stringify(identity));
  } catch {
    // Ignore storage failures; the live Clerk/API values still populate the form.
  }
};

function SettingsIcon({ src }: { src: string }) {
  const nextSrc = src.includes("notifications.png") ? `${src}?v=20260709` : src;
  return <img aria-hidden="true" src={nextSrc} alt="" className="settings-hub__menu-icon" />;
}

const sectionCopy: Record<
  SettingsSectionKey,
  {
    title: string;
    icon: ReactNode;
  }
> = {
  account: {
    title: "Account",
    icon: <SettingsIcon src="/assets/3d%20icons/account.png" />,
  },
  profiles: {
    title: "Profiles",
    icon: <SettingsIcon src="/assets/3d%20icons/profiles.png" />,
  },
  display: {
    title: "Display",
    icon: <SettingsIcon src="/assets/3d%20icons/display.png" />,
  },
  data: {
    title: "Data",
    icon: <SettingsIcon src="/assets/3d%20icons/data.png" />,
  },
  imports: {
    title: "Review",
    icon: <SettingsIcon src="/assets/3d%20icons/review.png" />,
  },
  categories: {
    title: "Categories",
    icon: <SettingsIcon src="/assets/3d%20icons/categories.png" />,
  },
  notifications: {
    title: "Notifications",
    icon: <SettingsIcon src="/assets/3d%20icons/notifications.png" />,
  },
  security: {
    title: "Security",
    icon: <SettingsIcon src="/assets/3d%20icons/security.png" />,
  },
  regional: {
    title: "Region",
    icon: <SettingsIcon src="/assets/3d%20icons/region.png" />,
  },
  plan: {
    title: "Plan",
    icon: <SettingsIcon src="/assets/3d%20icons/plan.png" />,
  },
};

const themeOptions: Array<{
  value: ThemeMode;
  label: string;
  helper: string;
}> = [
  { value: "light", label: "Light", helper: "Bright, high-contrast profile view." },
  { value: "dark", label: "Dark", helper: "Muted contrast for low-light sessions." },
];

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function SettingsHub({
  mode = "full",
  initialSection = "account",
  preferredBillingInterval,
  workspaceId: initialWorkspaceId,
  billingCustomerId: initialBillingCustomerId,
  workspaceName: initialWorkspaceName,
  selectedProfileId: initialSelectedProfileId,
  initialProfileList = [],
  firstName: initialFirstName,
  lastName: initialLastName,
  email: initialEmail,
  avatarUrl: initialAvatarUrl,
  planTier: initialPlanTier,
  profileLimit,
  initialPlanLimits = null,
  initialPlanUsage = null,
  paypalClientId: initialPaypalClientId,
  paypalMonthlyPlanId: initialPaypalMonthlyPlanId,
  paypalAnnualPlanId: initialPaypalAnnualPlanId,
  paypalBuyerCountry: initialPaypalBuyerCountry,
  disableWorkspaceBootstrap = false,
}: SettingsHubProps) {
  const router = useRouter();
  const { signOut } = useClerk();
  const { session } = useSession();
  const { isLoaded: sessionListLoaded, sessions: deviceSessions } = useSessionList();
  const { isLoaded, isSignedIn, user } = useUser();
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(initialSection);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [billingCustomerId, setBillingCustomerId] = useState(initialBillingCustomerId ?? null);
  const [workspaceName, setWorkspaceName] = useState(initialWorkspaceName);
  const [selectedProfileId, setSelectedProfileId] = useState(initialSelectedProfileId);
  const [firstName, setFirstName] = useState<string | null>(initialFirstName);
  const [lastName, setLastName] = useState<string | null>(initialLastName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl ?? null);
  const [email, setEmail] = useState(initialEmail);
  const [planTier, setPlanTier] = useState<"free" | "pro">(initialPlanTier);
  const [paypalClientId, setPaypalClientId] = useState<string | null>(initialPaypalClientId ?? null);
  const [paypalMonthlyPlanId, setPaypalMonthlyPlanId] = useState<string | null>(initialPaypalMonthlyPlanId ?? null);
  const [paypalAnnualPlanId, setPaypalAnnualPlanId] = useState<string | null>(initialPaypalAnnualPlanId ?? null);
  const [paypalBuyerCountry, setPaypalBuyerCountry] = useState<string | null>(initialPaypalBuyerCountry ?? null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [helperTextVisible, setHelperTextVisible] = useState(true);
  const [guidanceLevel, setGuidanceLevel] = useState<GuidanceLevel>("very-comfortable");
  const [guidanceMenuVisibility, setGuidanceMenuVisibility] = useState<GuidanceMenuVisibility>(() =>
    getGuidanceMenuPreset("very-comfortable")
  );
  const [guidancePreferenceLoaded, setGuidancePreferenceLoaded] = useState(false);
  const [historyCutoff, setHistoryCutoff] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [profileRenameDrafts, setProfileRenameDrafts] = useState<Record<string, string>>({});
  const [activeProfileId, setActiveProfileId] = useState(initialSelectedProfileId);
  const [firstNameDraft, setFirstNameDraft] = useState(initialFirstName ?? "");
  const [lastNameDraft, setLastNameDraft] = useState(initialLastName ?? "");
  const [passwordCurrentDraft, setPasswordCurrentDraft] = useState("");
  const [passwordNewDraft, setPasswordNewDraft] = useState("");
  const [passwordConfirmDraft, setPasswordConfirmDraft] = useState("");
  const [profileList, setProfileList] = useState<ProfileSummary[]>(() =>
    normalizeProfileList(initialProfileList, initialWorkspaceId ? { id: initialWorkspaceId, name: initialWorkspaceName || "Personal" } : undefined)
  );
  const [profilesLoaded, setProfilesLoaded] = useState(initialProfileList.length > 0);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profileListMessage, setProfileListMessage] = useState<string | null>(null);
  const [billingSubscription, setBillingSubscription] = useState<BillingSubscriptionSummary | null>(null);
  const [planLimits, setPlanLimits] = useState({
    accountLimit: initialPlanLimits?.accountLimit ?? 0,
    monthlyUploadLimit: initialPlanLimits?.monthlyUploadLimit ?? 0,
    transactionLimit: initialPlanLimits?.transactionLimit ?? null,
  });
  const [planUsage, setPlanUsage] = useState({
    accountCount: initialPlanUsage?.accountCount ?? 0,
    cashAccountCount: initialPlanUsage?.cashAccountCount ?? 0,
    monthlyUploadCount: initialPlanUsage?.monthlyUploadCount ?? 0,
    transactionCount: initialPlanUsage?.transactionCount ?? 0,
  });
  const [planLoaded, setPlanLoaded] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    weeklySummary: true,
    importComplete: true,
    transactionsNeedReview: true,
    budgetWarnings: true,
    inApp: true,
    email: false,
  });
  const [importPreferences, setImportPreferences] = useState<ImportPreferences>({
    duplicateHandling: "ask",
    reviewLowConfidence: true,
    openReviewAfterImport: true,
    askBeforeDifferentProfile: true,
  });
  const [regionalPreferences, setRegionalPreferences] = useState<RegionalPreferences>({
    baseCurrency: "PHP",
    dateFormat: "MM/DD/YYYY",
    numberFormat: "1,234.56",
    timeZone: "Asia/Manila",
  });
  const [dataUsePreferences, setDataUsePreferences] = useState<DataUsePreferences>({
    improveSuggestions: true,
    adviserUsesContext: true,
    clearCachedStateOnSignOut: true,
  });
  const [workspaceDefaults, setWorkspaceDefaults] = useState<WorkspaceDefaults>({
    defaultLandingPage: "dashboard",
    defaultImportProfileId: initialSelectedProfileId,
  });
  const [securitySessions, setSecuritySessions] = useState<SecuritySessionSummary[]>([]);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [dataDeleteModal, setDataDeleteModal] = useState<DataDeleteModalState | null>(null);
  const [dataDeleteInFlight, setDataDeleteInFlight] = useState(false);
  const [isPending, startTransition] = useTransition();
  const accountNameDraftDirtyRef = useRef(false);
  const workspaceReady = Boolean(workspaceId);

  const activeProfile = profileList.find((profile) => profile.id === activeProfileId) ?? profileList[0] ?? null;
  const defaultProfileId = getDefaultProfileId(profileList);
  const accountDraftChanged = firstNameDraft.trim() !== (firstName ?? "").trim() || lastNameDraft.trim() !== (lastName ?? "").trim();
  const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? email;
  const connectedAccounts = user?.externalAccounts ?? [];
  const currencyOptions = getCurrencyCatalogCodes().map((code) => getCurrencyCatalogOption(code));
  const timeZoneOptions = getTimeZoneOptions();

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    const storedTheme = readStoredThemeMode();
    const initialTheme = storedTheme === "dark" ? "dark" : "light";
    setThemeMode(initialTheme);
    applyThemeMode(initialTheme);
  }, []);

  useEffect(() => {
    const cachedIdentity = readStoredAccountIdentity();
    if (!cachedIdentity) {
      return;
    }

    setFirstName((current) => current ?? cachedIdentity.firstName ?? null);
    setLastName((current) => current ?? cachedIdentity.lastName ?? null);
    setEmail((current) => current || cachedIdentity.email || initialEmail);
    setAvatarUrl((current) => current ?? cachedIdentity.imageUrl ?? null);

    if (!accountNameDraftDirtyRef.current) {
      setFirstNameDraft((current) => current || cachedIdentity.firstName || "");
      setLastNameDraft((current) => current || cachedIdentity.lastName || "");
    }
  }, [initialEmail]);

  useEffect(() => {
    if (!isLoaded || !user) {
      return;
    }

    const clerkFirstName = user.firstName ?? null;
    const clerkLastName = user.lastName ?? null;
    const clerkEmail = user.primaryEmailAddress?.emailAddress ?? email;
    const clerkImageUrl = user.imageUrl ?? avatarUrl;
    const cachedIdentity = readStoredAccountIdentity();

    writeStoredAccountIdentity({
      firstName: clerkFirstName ?? cachedIdentity?.firstName ?? null,
      lastName: clerkLastName ?? cachedIdentity?.lastName ?? null,
      email: clerkEmail,
      imageUrl: clerkImageUrl,
    });

    setFirstName((current) => current ?? clerkFirstName);
    setLastName((current) => current ?? clerkLastName);
    setEmail((current) => current || clerkEmail);
    setAvatarUrl((current) => current ?? clerkImageUrl ?? null);

    if (!accountNameDraftDirtyRef.current) {
      setFirstNameDraft((current) => current || clerkFirstName || "");
      setLastNameDraft((current) => current || clerkLastName || "");
    }
  }, [avatarUrl, email, isLoaded, user]);

  useEffect(() => {
    if (initialWorkspaceId || disableWorkspaceBootstrap) {
      return;
    }

    let cancelled = false;

    const loadBootstrap = async () => {
      try {
        const response = await fetch("/api/settings/bootstrap", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          workspaceId?: string;
          billingCustomerId?: string | null;
          workspaceName?: string;
          selectedProfileId?: string;
          firstName?: string | null;
          lastName?: string | null;
          email?: string;
          imageUrl?: string | null;
          planTier?: "free" | "pro";
          paypalClientId?: string | null;
          paypalMonthlyPlanId?: string | null;
          paypalAnnualPlanId?: string | null;
          paypalBuyerCountry?: string | null;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load settings data.");
        }

        if (cancelled) {
          return;
        }

        setWorkspaceId(payload.workspaceId ?? "");
        setBillingCustomerId(payload.billingCustomerId ?? initialBillingCustomerId ?? null);
        setWorkspaceName(payload.workspaceName ?? "Settings");
        setSelectedProfileId(payload.selectedProfileId ?? "");
        setActiveProfileId(payload.selectedProfileId ?? "");
        setFirstName(payload.firstName ?? initialFirstName);
        setLastName(payload.lastName ?? initialLastName);
        setEmail(payload.email ?? initialEmail);
        setAvatarUrl(payload.imageUrl ?? initialAvatarUrl ?? null);
        writeStoredAccountIdentity({
          firstName: payload.firstName ?? initialFirstName,
          lastName: payload.lastName ?? initialLastName,
          email: payload.email ?? initialEmail,
          imageUrl: payload.imageUrl ?? initialAvatarUrl ?? null,
        });
        setPlanTier(payload.planTier ?? "free");
        setPaypalClientId(payload.paypalClientId ?? null);
        setPaypalMonthlyPlanId(payload.paypalMonthlyPlanId ?? null);
        setPaypalAnnualPlanId(payload.paypalAnnualPlanId ?? null);
        setPaypalBuyerCountry(payload.paypalBuyerCountry ?? null);
      } catch {
        if (!cancelled) {
          setWorkspaceId("");
          setBillingCustomerId(initialBillingCustomerId ?? null);
          setWorkspaceName(initialWorkspaceName);
          setSelectedProfileId(initialSelectedProfileId);
          setActiveProfileId(initialSelectedProfileId);
          setFirstName(initialFirstName);
          setLastName(initialLastName);
          setEmail(initialEmail);
          setAvatarUrl(initialAvatarUrl ?? null);
          setPlanTier(initialPlanTier);
          setPaypalClientId(initialPaypalClientId ?? null);
          setPaypalMonthlyPlanId(initialPaypalMonthlyPlanId ?? null);
          setPaypalAnnualPlanId(initialPaypalAnnualPlanId ?? null);
          setPaypalBuyerCountry(initialPaypalBuyerCountry ?? null);
        }
      }
    };

    void loadBootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    initialEmail,
    initialFirstName,
    initialLastName,
    initialAvatarUrl,
    initialPlanTier,
    initialPaypalAnnualPlanId,
    initialPaypalBuyerCountry,
    initialPaypalClientId,
    initialPaypalMonthlyPlanId,
    initialSelectedProfileId,
    initialWorkspaceId,
    initialBillingCustomerId,
    initialWorkspaceName,
    disableWorkspaceBootstrap,
  ]);

  const resolveWorkspaceId = async () => {
    if (workspaceId || disableWorkspaceBootstrap) {
      return workspaceId;
    }

    const response = await fetch("/api/settings/bootstrap", {
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => ({}))) as {
      workspaceId?: string;
      billingCustomerId?: string | null;
      workspaceName?: string;
      selectedProfileId?: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string;
      imageUrl?: string | null;
      planTier?: "free" | "pro";
      paypalClientId?: string | null;
      paypalMonthlyPlanId?: string | null;
      paypalAnnualPlanId?: string | null;
      paypalBuyerCountry?: string | null;
      error?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to load workspace details.");
    }

    const nextWorkspaceId = payload.workspaceId ?? "";
    if (nextWorkspaceId) {
      setWorkspaceId(nextWorkspaceId);
      setBillingCustomerId(payload.billingCustomerId ?? initialBillingCustomerId ?? null);
      setWorkspaceName(payload.workspaceName ?? "Personal");
      setSelectedProfileId(payload.selectedProfileId ?? nextWorkspaceId);
      setActiveProfileId(payload.selectedProfileId ?? nextWorkspaceId);
      setFirstName(payload.firstName ?? initialFirstName);
      setLastName(payload.lastName ?? initialLastName);
      setAvatarUrl(payload.imageUrl ?? null);
      setEmail(payload.email ?? email);
      writeStoredAccountIdentity({
        firstName: payload.firstName ?? initialFirstName,
        lastName: payload.lastName ?? initialLastName,
        email: payload.email ?? email,
        imageUrl: payload.imageUrl ?? null,
      });
      setPlanTier(payload.planTier ?? "free");
      setPaypalClientId(payload.paypalClientId ?? null);
      setPaypalMonthlyPlanId(payload.paypalMonthlyPlanId ?? null);
      setPaypalAnnualPlanId(payload.paypalAnnualPlanId ?? null);
      setPaypalBuyerCountry(payload.paypalBuyerCountry ?? null);
    }

    return nextWorkspaceId;
  };

  useEffect(() => {
    setActiveProfileId(selectedProfileId);
  }, [selectedProfileId]);

  useEffect(() => {
    setProfileRenameDrafts(
      profileList.reduce<Record<string, string>>((drafts, profile) => {
        drafts[profile.id] = profile.name;
        return drafts;
      }, {})
    );
  }, [profileList]);

  useEffect(() => {
    setProfileList((current) =>
      normalizeProfileList(current, workspaceId ? { id: workspaceId, name: workspaceName || "Personal" } : undefined)
    );
  }, [workspaceId, workspaceName]);

  useEffect(() => {
    if (accountNameDraftDirtyRef.current) {
      return;
    }

    setFirstNameDraft(firstName ?? "");
    setLastNameDraft(lastName ?? "");
  }, [firstName, lastName]);

  useEffect(() => {
    let cancelled = false;

    const loadProfiles = async () => {
      if (profilesLoaded || profilesLoading || activeSection !== "profiles") {
        return;
      }

      setProfilesLoading(true);
      setProfileListMessage(null);

      try {
        const response = await fetch("/api/workspaces", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as { workspaces?: ProfileSummary[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load profiles.");
        }

        if (!cancelled) {
          setProfileList(normalizeProfileList(payload.workspaces ?? [], workspaceId ? { id: workspaceId, name: workspaceName || "Personal" } : undefined));
          setProfilesLoaded(true);
        }
      } catch (error) {
        if (!cancelled) {
          setProfileListMessage(error instanceof Error ? error.message : "Unable to load profiles.");
        }
      } finally {
        if (!cancelled) {
          setProfilesLoading(false);
        }
      }
    };

    void loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [activeSection, profilesLoaded, profilesLoading, workspaceId, workspaceName]);

  useEffect(() => {
    let cancelled = false;

    const loadPlan = async () => {
      if (planLoaded || planLoading || activeSection !== "plan" || !workspaceReady) {
        return;
      }

      setPlanLoading(true);

      try {
        const meResponse = await fetch("/api/me", { cache: "no-store" });

        const mePayload = (await meResponse.json().catch(() => ({}))) as {
          user?: {
            billingSubscription?: BillingSubscriptionSummary | null;
            accountLimit?: number;
            monthlyUploadLimit?: number;
            transactionLimit?: number | null;
            usage?: {
              accountCount: number;
              cashAccountCount: number;
              monthlyUploadCount: number;
              transactionCount: number;
            };
          };
          error?: string;
        };
        if (!meResponse.ok) {
          throw new Error(mePayload.error ?? "Unable to load plan details.");
        }

        if (!cancelled) {
          setBillingSubscription(mePayload.user?.billingSubscription ?? null);
          setPlanLimits({
            accountLimit: mePayload.user?.accountLimit ?? 0,
            monthlyUploadLimit: mePayload.user?.monthlyUploadLimit ?? 0,
            transactionLimit: mePayload.user?.transactionLimit ?? null,
          });
          setPlanUsage(
            mePayload.user?.usage ?? {
              accountCount: 0,
              cashAccountCount: 0,
              monthlyUploadCount: 0,
              transactionCount: 0,
            }
          );
          setPlanLoaded(true);
        }
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : "Unable to load plan details.");
          setPlanLoaded(true);
        }
      } finally {
        if (!cancelled) {
          setPlanLoading(false);
        }
      }
    };

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, [activeSection, planLoaded, planLoading, workspaceId, workspaceReady]);

  useEffect(() => {
    const initialHelperText = readStoredHelperTextPreference();
    setHelperTextVisible(initialHelperText);
    applyHelperTextPreference(initialHelperText);

    const storedGuidanceLevel = window.localStorage.getItem(SETTINGS_GUIDANCE_KEY);
    if (storedGuidanceLevel === "learning" || storedGuidanceLevel === "comfortable" || storedGuidanceLevel === "very-comfortable" || storedGuidanceLevel === "custom") {
      setGuidanceLevel(storedGuidanceLevel);

      const storedMenuVisibility = window.localStorage.getItem(SETTINGS_GUIDANCE_MENU_KEY);
      try {
        const parsedMenuVisibility = storedMenuVisibility ? (JSON.parse(storedMenuVisibility) as unknown) : null;
        setGuidanceMenuVisibility(
          isGuidanceMenuVisibility(parsedMenuVisibility)
            ? parsedMenuVisibility
          : storedGuidanceLevel === "custom"
            ? getGuidanceMenuPreset("very-comfortable")
            : getGuidanceMenuPreset(storedGuidanceLevel)
        );
      } catch {
        setGuidanceMenuVisibility(
          storedGuidanceLevel === "custom" ? getGuidanceMenuPreset("very-comfortable") : getGuidanceMenuPreset(storedGuidanceLevel)
        );
      }
    } else {
      setGuidanceMenuVisibility(getGuidanceMenuPreset("very-comfortable"));
    }
    setGuidancePreferenceLoaded(true);
  }, []);

  useEffect(() => {
    const guessedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Manila";
    setNotificationPreferences(
      readStoredJsonValue<NotificationPreferences>(SETTINGS_NOTIFICATIONS_KEY, {
        weeklySummary: true,
        importComplete: true,
        transactionsNeedReview: true,
        budgetWarnings: true,
        inApp: true,
        email: false,
      })
    );
    setImportPreferences(
      readStoredJsonValue<ImportPreferences>(SETTINGS_IMPORTS_KEY, {
        duplicateHandling: "ask",
        reviewLowConfidence: true,
        openReviewAfterImport: true,
        askBeforeDifferentProfile: true,
      })
    );
    setRegionalPreferences(
      readStoredJsonValue<RegionalPreferences>(SETTINGS_REGIONAL_KEY, {
        baseCurrency: "PHP",
        dateFormat: "MM/DD/YYYY",
        numberFormat: "1,234.56",
        timeZone: guessedTimeZone,
      })
    );
    setDataUsePreferences(
      readStoredJsonValue<DataUsePreferences>(SETTINGS_DATA_USE_KEY, {
        improveSuggestions: true,
        adviserUsesContext: true,
        clearCachedStateOnSignOut: true,
      })
    );
    setWorkspaceDefaults(
      readStoredJsonValue<WorkspaceDefaults>(SETTINGS_WORKSPACE_DEFAULTS_KEY, {
        defaultLandingPage: "dashboard",
        defaultImportProfileId: initialSelectedProfileId,
      })
    );
  }, [initialSelectedProfileId]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    applyThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(HELPER_TEXT_STORAGE_KEY, helperTextVisible ? "visible" : "hidden");
    applyHelperTextPreference(helperTextVisible);
  }, [helperTextVisible]);

  useEffect(() => {
    if (!guidancePreferenceLoaded) {
      return;
    }

    window.localStorage.setItem(SETTINGS_GUIDANCE_KEY, guidanceLevel);
    document.documentElement.dataset.cloverGuidance = guidanceLevel;
    window.localStorage.setItem(SETTINGS_GUIDANCE_MENU_KEY, JSON.stringify(guidanceMenuVisibility));
    window.dispatchEvent(new CustomEvent(SETTINGS_GUIDANCE_MENU_EVENT, { detail: guidanceMenuVisibility }));
  }, [guidanceLevel, guidanceMenuVisibility, guidancePreferenceLoaded]);

  useEffect(() => {
    writeStoredJsonValue(SETTINGS_NOTIFICATIONS_KEY, notificationPreferences);
  }, [notificationPreferences]);

  useEffect(() => {
    writeStoredJsonValue(SETTINGS_IMPORTS_KEY, importPreferences);
  }, [importPreferences]);

  useEffect(() => {
    writeStoredJsonValue(SETTINGS_REGIONAL_KEY, regionalPreferences);
  }, [regionalPreferences]);

  useEffect(() => {
    writeStoredJsonValue(SETTINGS_DATA_USE_KEY, dataUsePreferences);
  }, [dataUsePreferences]);

  useEffect(() => {
    writeStoredJsonValue(SETTINGS_WORKSPACE_DEFAULTS_KEY, workspaceDefaults);
  }, [workspaceDefaults]);

  useEffect(() => {
    if (!profileList.length) {
      return;
    }

    setWorkspaceDefaults((current) => {
      const fallbackProfileId = defaultProfileId || profileList[0]?.id || "";
      if (!current.defaultImportProfileId || !profileList.some((profile) => profile.id === current.defaultImportProfileId)) {
        return {
          ...current,
          defaultImportProfileId: fallbackProfileId,
        };
      }

      return current;
    });
  }, [defaultProfileId, profileList]);

  useEffect(() => {
    if (activeSection !== "security") {
      return;
    }

    if (!sessionListLoaded) {
      setSecurityLoading(true);
      return;
    }

    setSecuritySessions(
      (deviceSessions ?? []).map((entry) => ({
        id: entry.id,
        status: entry.status,
        lastActiveAt:
          typeof entry.lastActiveAt === "number"
            ? new Date(entry.lastActiveAt).toISOString()
            : typeof entry.expireAt === "number"
              ? new Date(entry.expireAt).toISOString()
              : null,
        isCurrent: entry.id === session?.id,
      }))
    );
    setSecurityLoading(false);
    setSecurityMessage(null);
  }, [activeSection, deviceSessions, session?.id, sessionListLoaded]);

  useEffect(() => {
    if (!dataDeleteModal) {
      return;
    }

    document.body.setAttribute("data-clover-page-modal", "true");
    return () => {
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [dataDeleteModal]);

  const runDownload = async (path: string, fileName: string) => {
    const resolvedWorkspaceId = await resolveWorkspaceId();
    if (!resolvedWorkspaceId) {
      throw new Error("Workspace is still loading.");
    }

    const url = new URL(path, window.location.origin);
    url.searchParams.set("workspaceId", resolvedWorkspaceId);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error("Unable to prepare the download.");
    }

    const blob = await response.blob();
    downloadBlob(blob, fileName);
  };

  const handleSignOutOtherDevices = () => {
    if (!user || !session?.id) {
      setSecurityMessage("No additional sessions found.");
      return;
    }

    startTransition(async () => {
      setSecurityMessage(null);

      try {
        const sessions = await user.getSessions();
        const otherSessions = sessions.filter((entry) => entry.id !== session.id);

        if (!otherSessions.length) {
          setSecurityMessage("No other signed-in devices were found.");
          return;
        }

        await Promise.all(otherSessions.map((entry) => (entry as unknown as { revoke: () => Promise<void> }).revoke()));
        const refreshedSessions = await user.getSessions();
        setSecuritySessions(
          refreshedSessions.map((entry) => ({
            id: entry.id,
            status: entry.status,
            lastActiveAt:
              (typeof entry.lastActiveAt === "number" ? new Date(entry.lastActiveAt).toISOString() : null) ??
              (typeof entry.expireAt === "number" ? new Date(entry.expireAt).toISOString() : null),
            isCurrent: entry.id === session.id,
          }))
        );
        setSecurityMessage("Signed out of other devices.");
      } catch (error) {
        setSecurityMessage(error instanceof Error ? error.message : "Unable to sign out other devices.");
      }
    });
  };

  const handleAccountSave = () => {
    if (!isLoaded || !isSignedIn || !user) {
      setAccountMessage("Sign in again to update your account.");
      return;
    }

    const nextFirstName = firstNameDraft.trim();
    const nextLastName = lastNameDraft.trim();

    startTransition(async () => {
      setAccountMessage(null);

      try {
        await user.update({
          firstName: nextFirstName || undefined,
          lastName: nextLastName || undefined,
        });
        await user.reload();
        const response = await fetch("/api/settings/account", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firstName: nextFirstName || null,
            lastName: nextLastName || null,
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          firstName?: string | null;
          lastName?: string | null;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to update account details.");
        }
        setFirstName(payload.firstName ?? null);
        setLastName(payload.lastName ?? null);
        accountNameDraftDirtyRef.current = false;
        writeStoredAccountIdentity({
          firstName: payload.firstName ?? null,
          lastName: payload.lastName ?? null,
          email,
          imageUrl: avatarUrl ?? user?.imageUrl ?? null,
        });
        setAccountMessage("Account details updated.");
      } catch (error) {
        setAccountMessage(error instanceof Error ? error.message : "Unable to update account details.");
      }
    });
  };

  const handlePasswordSave = () => {
    if (!isLoaded || !isSignedIn || !user) {
      setPasswordMessage("Sign in again to update your password.");
      return;
    }

    if (!passwordNewDraft.trim()) {
      setPasswordMessage("Enter a new password first.");
      return;
    }

    if (passwordNewDraft.trim() !== passwordConfirmDraft.trim()) {
      setPasswordMessage("New passwords do not match.");
      return;
    }

    startTransition(async () => {
      setPasswordMessage(null);

      try {
        await user.updatePassword({
          currentPassword: passwordCurrentDraft.trim() || undefined,
          newPassword: passwordNewDraft.trim(),
          signOutOfOtherSessions: true,
        });
        setPasswordCurrentDraft("");
        setPasswordNewDraft("");
        setPasswordConfirmDraft("");
        setPasswordMessage("Password updated.");
      } catch (error) {
        setPasswordMessage(error instanceof Error ? error.message : "Unable to update your password.");
      }
    });
  };

  const handleDeleteAccount = () => {
    if (!isLoaded || !isSignedIn || !user) {
      return;
    }

    const confirmed = window.confirm(
      "Delete your Clover account? This removes your profile and cannot be undone."
    );

    if (!confirmed) {
      return;
    }

    startTransition(async () => {
      try {
        await user.delete();
        window.location.assign("/");
      } catch (error) {
        setAccountMessage(error instanceof Error ? error.message : "Unable to delete your account.");
      }
    });
  };

  const dataDeleteCopy = {
    transactions: {
      confirmTitle: "Delete transaction history?",
      body: "This removes transactions before the selected date and keeps your accounts in place.",
      confirmLabel: "Delete transactions",
      successTitle: "Transactions deleted",
      successBody: (count: number | null) =>
        count === null
          ? "Transaction history was deleted."
          : count === 0
          ? "No transactions matched the selected date."
          : `Deleted ${count.toLocaleString()} transaction${count === 1 ? "" : "s"}.`,
    },
    accounts: {
      confirmTitle: "Delete accounts and linked transactions?",
      body: "This removes your accounts and the transactions tied to them.",
      confirmLabel: "Delete accounts",
      successTitle: "Accounts deleted",
      successBody: (count: number | null) =>
        count === null
          ? "Accounts and linked import data were deleted."
          : count === 0
          ? "No accounts were available to delete."
          : `Deleted ${count.toLocaleString()} account${count === 1 ? "" : "s"}.`,
    },
    all: {
      confirmTitle: "Delete all Clover data?",
      body: "This removes your accounts, transactions, imports, and learned data while keeping your Clover login.",
      confirmLabel: "Delete all data",
      successTitle: "All Clover data deleted",
      successBody: () => "Your Clover data has been deleted and the page is ready for a fresh start.",
    },
  } as const;

  const openDeleteModal = (scope: DataDeleteScope) => {
    setStatusMessage(null);
    setDataDeleteModal({
      scope,
      phase: "confirm",
      deletedCount: null,
    });
  };

  const closeDeleteModal = () => {
    setDataDeleteModal(null);
    setDataDeleteInFlight(false);
  };

  const runDelete = async (scope: "transactions" | "balances" | "accounts") => {
    const resolvedWorkspaceId = await resolveWorkspaceId();
    if (!resolvedWorkspaceId) {
      throw new Error("Workspace is still loading.");
    }

    const response = await fetch("/api/settings/data", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: resolvedWorkspaceId,
        beforeDate: historyCutoff,
        scope,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string; deleted?: number };
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to update data.");
    }

    clearAllWorkspaceCaches();

    return payload.deleted ?? 0;
  };

  const handleDeleteConfirm = async () => {
    if (!dataDeleteModal || dataDeleteInFlight) {
      return;
    }

    setDataDeleteInFlight(true);
    setStatusMessage(null);

    try {
      if (dataDeleteModal.scope === "all") {
        const response = await fetch("/api/account/wipe-data", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to delete Clover data.");
        }

        persistSelectedWorkspaceId("");
        syncSelectedWorkspaceCookie();
        clearAllWorkspaceCaches();
        setWorkspaceId("");
        setWorkspaceName("Settings");
        setSelectedProfileId("");
        setActiveProfileId("");
        setProfileList([]);
        setProfilesLoaded(false);
        setProfilesLoading(false);
        setProfileListMessage(null);
        setBillingSubscription(null);
        setPlanUsage({
          accountCount: 0,
          cashAccountCount: 0,
          monthlyUploadCount: 0,
          transactionCount: 0,
        });
        setPlanLimits({ accountLimit: 0, monthlyUploadLimit: 0, transactionLimit: null });
        setPlanLoaded(false);

        setDataDeleteModal({
          scope: dataDeleteModal.scope,
          phase: "success",
          deletedCount: null,
        });
        setStatusMessage("All Clover data was deleted successfully.");
        return;
      }

      const deleted = await runDelete(dataDeleteModal.scope);
      setDataDeleteModal({
        scope: dataDeleteModal.scope,
        phase: "success",
        deletedCount: deleted,
      });
      setStatusMessage(dataDeleteCopy[dataDeleteModal.scope].successBody(deleted));
      setPlanLoaded(false);
      if (dataDeleteModal.scope === "accounts") {
        setProfilesLoaded(false);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Something went wrong.");
      closeDeleteModal();
    } finally {
      setDataDeleteInFlight(false);
    }
  };

  const handleProfileSwitch = (profileId: string) => {
    if (!profileId || profileId === activeProfileId) {
      return;
    }

    const nextProfile = profileList.find((profile) => profile.id === profileId);
    if (!nextProfile) {
      setProfileMessage("Profile not found.");
      return;
    }

    persistSelectedWorkspaceId(profileId);
    syncSelectedWorkspaceCookie();
    setWorkspaceId(profileId);
    setWorkspaceName(nextProfile.name);
    setSelectedProfileId(profileId);
    setActiveProfileId(profileId);
    setPlanLoaded(false);
    setBillingSubscription(null);
    setProfileMessage("Profile switched.");
    router.refresh();
  };

  const handleProfileCreate = () => {
    const name = newProfileName.trim();
    if (!name) {
      setProfileMessage("Profile name cannot be empty.");
      return;
    }

    setProfileMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/workspaces", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            type: "personal",
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to create profile.");
        }

        setNewProfileName("");
        setProfileMessage("Profile created.");
        setProfilesLoaded(false);
        router.refresh();
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : "Unable to create profile.");
      }
    });
  };

  const handleProfileRename = (profileId: string) => {
    const nextName = profileRenameDrafts[profileId]?.trim();
    const currentProfile = profileList.find((profile) => profile.id === profileId);

    if (!nextName) {
      setProfileMessage("Profile name cannot be empty.");
      return;
    }

    if (currentProfile && nextName === currentProfile.name) {
      setProfileMessage("Profile name is unchanged.");
      return;
    }

    setProfileMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(profileId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: nextName,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to update profile.");
        }

        setProfileMessage("Profile updated.");
        setProfilesLoaded(false);
        router.refresh();
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : "Unable to update profile.");
      }
    });
  };

  const handleProfileRemove = (profileId: string, profileName: string) => {
    if (profileId === defaultProfileId) {
      setProfileMessage("The Personal profile is required and cannot be removed.");
      return;
    }

    if (
      !window.confirm(
        `Remove ${profileName}? Clover will only allow this if the profile does not contain imported or confirmed data yet.`
      )
    ) {
      return;
    }

    setProfileMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/workspaces/${encodeURIComponent(profileId)}`, {
          method: "DELETE",
        });

        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to remove profile.");
        }

        if (profileId === activeProfileId) {
          persistSelectedWorkspaceId("");
          syncSelectedWorkspaceCookie();
          setActiveProfileId("");
        }

        setProfileMessage("Profile removed.");
        setProfilesLoaded(false);
        router.refresh();
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : "Unable to remove profile.");
      }
    });
  };

  const handleSafeSignOut = () => {
    if (dataUsePreferences.clearCachedStateOnSignOut) {
      clearAllWorkspaceCaches();
    }

    void signOutToLanding(signOut);
  };

  return (
    <section className={`settings-hub${mode === "panel" ? " settings-hub--panel-only" : mode === "menu" ? " settings-hub--menu-only" : ""}`}>
      {mode !== "panel" ? (
        <aside className="settings-hub__menu glass">
          <Link className="settings-hub__brand" href="/dashboard" aria-label="Go to dashboard">
            <img className="settings-hub__brand-mark" src="/clover-mark.svg" alt="" aria-hidden="true" loading="eager" fetchPriority="high" />
            <div className="settings-hub__brand-copy">
              <strong>Clover</strong>
              <span>{activeProfile?.name ?? workspaceName}</span>
            </div>
          </Link>
          <div className="settings-hub__menu-list" role="list" aria-label="Settings sections">
            {(Object.keys(sectionCopy) as SettingsSectionKey[]).map((sectionKey) => {
              const section = sectionCopy[sectionKey];
              const isActive = activeSection === sectionKey;

              if (mode === "full") {
                return (
                  <button
                    key={sectionKey}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`settings-hub__menu-item${isActive ? " is-active" : ""}`}
                    onClick={() => setActiveSection(sectionKey)}
                  >
                    {section.icon}
                    <strong>{section.title}</strong>
                  </button>
                );
              }

              return (
                <Link
                  key={sectionKey}
                  href={`/settings/${sectionKey}`}
                  className={`settings-hub__menu-item${isActive ? " is-active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {section.icon}
                  <strong>{section.title}</strong>
                </Link>
              );
            })}
          </div>
        </aside>
      ) : null}

      {mode !== "menu" ? (
      <div className="settings-hub__panel glass">
        {mode === "panel" ? (
          <div className="settings-hub__panel-back">
            <Link className="help-page__back-button settings-hub__back-button" href="/settings" aria-label="Back to settings" prefetch={false}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
              </svg>
            </Link>
          </div>
        ) : null}
        {activeSection === "account" ? (
          <section className="settings-section settings-section--profile settings-section--swap" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Account Details</h4>
              </div>
            </div>

            <div className="settings-account-layout">
              <article className="settings-action-card settings-account-card settings-account-card--photo">
                <div className="settings-account-card__head">
                  <h5>Photo</h5>
                </div>
                <UserAvatarEditor displayName={`${firstNameDraft} ${lastNameDraft}`.trim() || workspaceName} avatarUrl={avatarUrl ?? user?.imageUrl ?? null} />
              </article>

              <article className="settings-action-card settings-account-card settings-account-card--details">
                <div className="settings-account-card__head">
                  <h5>Account details</h5>
                </div>
                <div className="settings-account-form">
                  <label className="settings-inline-field">
                    <span>First name</span>
                    <input
                      value={firstNameDraft}
                      onChange={(event) => {
                        accountNameDraftDirtyRef.current = true;
                        setFirstNameDraft(event.target.value);
                      }}
                      placeholder="First name"
                    />
                  </label>
                  <label className="settings-inline-field">
                    <span>Last name</span>
                    <input
                      value={lastNameDraft}
                      onChange={(event) => {
                        accountNameDraftDirtyRef.current = true;
                        setLastNameDraft(event.target.value);
                      }}
                      placeholder="Last name"
                    />
                  </label>
                  <label className="settings-inline-field">
                    <span>Email</span>
                    <input value={primaryEmail} readOnly />
                  </label>
                  {accountDraftChanged || accountMessage ? (
                    <div className="settings-account-form__actions">
                      {accountDraftChanged ? (
                        <button
                          type="button"
                          className="button button-primary button-small"
                          onClick={handleAccountSave}
                          disabled={isPending}
                        >
                          Save account
                        </button>
                      ) : null}
                      {accountMessage ? <p className="settings-helper">{accountMessage}</p> : null}
                    </div>
                  ) : null}

                  <div className="settings-account-password">
                    <button
                      type="button"
                      className="settings-account-password__chip"
                      aria-expanded={passwordEditorOpen}
                      onClick={() => setPasswordEditorOpen((current) => !current)}
                    >
                      Change password
                    </button>
                    {passwordEditorOpen ? (
                      <div className="settings-account-password__panel">
                        <label className="settings-inline-field">
                          <span>Current password</span>
                          <input
                            type="password"
                            value={passwordCurrentDraft}
                            onChange={(event) => setPasswordCurrentDraft(event.target.value)}
                            placeholder="Enter current password"
                            autoComplete="current-password"
                          />
                        </label>
                        <label className="settings-inline-field">
                          <span>New password</span>
                          <input
                            type="password"
                            value={passwordNewDraft}
                            onChange={(event) => setPasswordNewDraft(event.target.value)}
                            placeholder="Enter new password"
                            autoComplete="new-password"
                          />
                        </label>
                        <label className="settings-inline-field">
                          <span>Confirm new password</span>
                          <input
                            type="password"
                            value={passwordConfirmDraft}
                            onChange={(event) => setPasswordConfirmDraft(event.target.value)}
                            placeholder="Confirm new password"
                            autoComplete="new-password"
                          />
                        </label>
                        <div className="settings-account-form__actions">
                          <button
                            type="button"
                            className="button button-primary button-small"
                            onClick={handlePasswordSave}
                            disabled={isPending}
                          >
                            Update password
                          </button>
                          {passwordMessage ? <p className="settings-helper">{passwordMessage}</p> : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            </div>

            <article className="settings-action-card settings-account-card">
              <div className="settings-account-card__head">
                <h5>Social sign-ins and connected accounts</h5>
              </div>
              <div className="settings-account-connected-list">
                {connectedAccounts.length ? (
                  connectedAccounts.map((account) => (
                    <div key={account.id} className="settings-account-connected-item">
                      <strong>{account.providerTitle()}</strong>
                      <span>{account.accountIdentifier()}</span>
                    </div>
                  ))
                ) : (
                  <div className="settings-account-connected-item">
                    <strong>No connected accounts yet</strong>
                    <span>Sign in with Google, Facebook, or another provider to link it here.</span>
                  </div>
                )}
              </div>
            </article>

            <article className="settings-action-card settings-account-card settings-account-card--danger">
              <div className="settings-account-card__head">
                <h5>Delete account</h5>
              </div>
              <p>This permanently deletes your Clover account and all data tied to it.</p>
              <button type="button" className="button button-danger button-small" onClick={handleDeleteAccount} disabled={isPending}>
                Delete account
              </button>
            </article>
          </section>
        ) : null}

        {activeSection === "profiles" ? (
          <SettingsProfilesPanel
            workspaceName={workspaceName}
            userImageUrl={avatarUrl ?? user?.imageUrl ?? null}
            activeProfileId={activeProfileId}
            profileList={profileList}
            profilesLoading={profilesLoading}
            profileLimit={profileLimit}
            newProfileName={newProfileName}
            profileRenameDrafts={profileRenameDrafts}
            isPending={isPending}
            profileMessage={profileMessage}
            profileListMessage={profileListMessage}
            defaultProfileId={defaultProfileId}
            workspaceDefaults={workspaceDefaults}
            onNewProfileNameChange={setNewProfileName}
            onRenameDraftChange={(profileId, value) =>
              setProfileRenameDrafts((current) => ({
                ...current,
                [profileId]: value,
              }))
            }
            onWorkspaceDefaultsChange={setWorkspaceDefaults}
            onCreateProfile={handleProfileCreate}
            onRenameProfile={handleProfileRename}
            onSwitchProfile={handleProfileSwitch}
            onRemoveProfile={handleProfileRemove}
          />
        ) : null}

        {activeSection === "notifications" ? (
          <section className="settings-section settings-section--swap" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Notifications</h4>
              </div>
            </div>

            <article className="settings-action-card settings-preference-card">
              <div className="settings-preference-card__list">
                <SettingsToggleRow
                  label="Weekly summary"
                  checked={notificationPreferences.weeklySummary}
                  onToggle={() =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      weeklySummary: !current.weeklySummary,
                    }))
                  }
                />
                <SettingsToggleRow
                  label="Import complete"
                  checked={notificationPreferences.importComplete}
                  onToggle={() =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      importComplete: !current.importComplete,
                    }))
                  }
                />
                <SettingsToggleRow
                  label="Transactions need review"
                  checked={notificationPreferences.transactionsNeedReview}
                  onToggle={() =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      transactionsNeedReview: !current.transactionsNeedReview,
                    }))
                  }
                />
                <SettingsToggleRow
                  label="Budget or plan-limit warnings"
                  checked={notificationPreferences.budgetWarnings}
                  onToggle={() =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      budgetWarnings: !current.budgetWarnings,
                    }))
                  }
                />
                <SettingsToggleRow
                  label="In-app notifications"
                  checked={notificationPreferences.inApp}
                  onToggle={() =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      inApp: !current.inApp,
                    }))
                  }
                />
                <SettingsToggleRow
                  label="Email notifications"
                  checked={notificationPreferences.email}
                  onToggle={() =>
                    setNotificationPreferences((current) => ({
                      ...current,
                      email: !current.email,
                    }))
                  }
                />
              </div>
            </article>
          </section>
        ) : null}

        {activeSection === "security" ? (
          <section className="settings-section settings-section--swap" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Security</h4>
              </div>
            </div>

            <div className="settings-preference-grid">
              <article className="settings-action-card settings-preference-card">
                <div className="settings-preference-card__head">
                  <h5>Active Sessions</h5>
                </div>
                <div className="settings-session-list">
                  {securitySessions.length ? (
                    securitySessions.map((entry) => (
                      <div key={entry.id} className="settings-session-item">
                        <strong>{entry.isCurrent ? "Current device" : "Signed-in device"}</strong>
                        <span>{formatRelativeSessionTime(entry.lastActiveAt)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="settings-session-item">
                      <strong>{securityLoading ? "Loading..." : "Current device"}</strong>
                      <span>{securityLoading ? "Fetching active sessions" : "This device is active."}</span>
                    </div>
                  )}
                </div>
              </article>

              <article className="settings-action-card settings-preference-card">
                <div className="settings-preference-card__head">
                  <h5>Sign Out Other Devices</h5>
                </div>
                <p>End all other active sessions and keep only this device signed in.</p>
                <div className="settings-action-card__row">
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    disabled={isPending || securityLoading}
                    onClick={handleSignOutOtherDevices}
                  >
                    Sign out other devices
                  </button>
                  <button type="button" className="button button-secondary button-small" onClick={handleSafeSignOut}>
                    Sign out here
                  </button>
                </div>
                {securityMessage ? <p className="settings-helper">{securityMessage}</p> : null}
              </article>
            </div>
          </section>
        ) : null}

        {activeSection === "imports" ? (
          <section className="settings-section settings-section--swap" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Import Preferences</h4>
              </div>
            </div>

            <div className="settings-preference-grid">
              <article className="settings-action-card settings-preference-card">
                <div className="settings-preference-card__head">
                  <h5>Review flow</h5>
                </div>
                <div className="settings-preference-card__list">
                  <SettingsToggleRow
                    label="Require manual review for low-confidence rows"
                    checked={importPreferences.reviewLowConfidence}
                    onToggle={() =>
                      setImportPreferences((current) => ({
                        ...current,
                        reviewLowConfidence: !current.reviewLowConfidence,
                      }))
                    }
                  />
                  <SettingsToggleRow
                    label="Open review automatically after import"
                    checked={importPreferences.openReviewAfterImport}
                    onToggle={() =>
                      setImportPreferences((current) => ({
                        ...current,
                        openReviewAfterImport: !current.openReviewAfterImport,
                      }))
                    }
                  />
                  <SettingsToggleRow
                    label="Ask before importing into a different profile"
                    checked={importPreferences.askBeforeDifferentProfile}
                    onToggle={() =>
                      setImportPreferences((current) => ({
                        ...current,
                        askBeforeDifferentProfile: !current.askBeforeDifferentProfile,
                      }))
                    }
                  />
                </div>
              </article>

              <article className="settings-action-card settings-preference-card">
                <div className="settings-preference-card__head">
                  <h5>Duplicates</h5>
                </div>
                <label className="settings-inline-field">
                  <span>When Clover suspects a duplicate import</span>
                  <select
                    value={importPreferences.duplicateHandling}
                    onChange={(event) =>
                      setImportPreferences((current) => ({
                        ...current,
                        duplicateHandling: event.target.value as ImportPreferences["duplicateHandling"],
                      }))
                    }
                  >
                    <option value="ask">Ask me first</option>
                    <option value="skip">Skip duplicates</option>
                    <option value="replace">Replace older copy</option>
                  </select>
                </label>
              </article>
            </div>
          </section>
        ) : null}

        {activeSection === "regional" ? (
          <section className="settings-section settings-section--swap" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Regional Preferences</h4>
              </div>
            </div>

            <div className="settings-preference-grid">
              <article className="settings-action-card settings-preference-card">
                <label className="settings-inline-field">
                  <span>Base currency</span>
                  <select
                    value={regionalPreferences.baseCurrency}
                    onChange={(event) =>
                      setRegionalPreferences((current) => ({
                        ...current,
                        baseCurrency: event.target.value as RegionalPreferences["baseCurrency"],
                      }))
                    }
                  >
                    {currencyOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.code} · {option.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-inline-field">
                  <span>Date format</span>
                  <select
                    value={regionalPreferences.dateFormat}
                    onChange={(event) =>
                      setRegionalPreferences((current) => ({
                        ...current,
                        dateFormat: event.target.value as RegionalPreferences["dateFormat"],
                      }))
                    }
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </label>
              </article>

              <article className="settings-action-card settings-preference-card">
                <label className="settings-inline-field">
                  <span>Number format</span>
                  <select
                    value={regionalPreferences.numberFormat}
                    onChange={(event) =>
                      setRegionalPreferences((current) => ({
                        ...current,
                        numberFormat: event.target.value as RegionalPreferences["numberFormat"],
                      }))
                    }
                  >
                    <option value="1,234.56">1,234.56</option>
                    <option value="1.234,56">1.234,56</option>
                  </select>
                </label>
                <label className="settings-inline-field">
                  <span>Time zone</span>
                  <select
                    value={regionalPreferences.timeZone}
                    onChange={(event) =>
                      setRegionalPreferences((current) => ({
                        ...current,
                        timeZone: event.target.value,
                      }))
                    }
                  >
                    {timeZoneOptions.map((timeZone) => (
                      <option key={timeZone} value={timeZone}>
                        {formatTimeZoneLabel(timeZone)}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            </div>
          </section>
        ) : null}

        {activeSection === "display" ? (
          <section className="settings-section settings-section--swap" role="tabpanel">
            <div className="settings-section__intro">
              <div>
                <h4>Display</h4>
              </div>
            </div>

            <div className="settings-choice-grid">
              {themeOptions.map((option) => {
                const isSelected = themeMode === option.value;

                return (
                  <label key={option.value} className={`settings-choice-card${isSelected ? " is-selected" : ""}`}>
                    <input
                      type="radio"
                      name="theme-mode"
                      checked={isSelected}
                      onChange={() => setThemeMode(option.value)}
                    />
                    {isSelected ? <span className="settings-choice-card__selected">Selected</span> : null}
                    <strong>{option.label}</strong>
                    <span>{option.helper}</span>
                  </label>
                );
              })}
            </div>

            <article className="settings-guidance-card settings-action-card">
              <div className="settings-guidance-card__head">
                <div>
                  <h5>Guidance Preferences</h5>
                  <p>Choose how much explanation and detail Clover should show. This does not change your data or permissions.</p>
                </div>
              </div>
              <div className="settings-guidance-options" role="radiogroup" aria-label="Guidance level">
                {guidanceOptions.map((option) => {
                  const isSelected = guidanceLevel === option.value;

                  return (
                    <label key={option.value} className={`settings-guidance-option${isSelected ? " is-selected" : ""}`}>
                      <input
                        type="radio"
                        name="guidance-level"
                        value={option.value}
                        checked={isSelected}
                        onChange={() => {
                          setGuidanceLevel(option.value);
                          setGuidanceMenuVisibility(getGuidanceMenuPreset(option.value));
                        }}
                      />
                      <strong>{option.label}</strong>
                      <span>{option.helper}</span>
                    </label>
                  );
                })}
              </div>

              <div className="settings-guidance-menu-wrap">
                <div className="settings-guidance-menu-head">
                  <h6>Menu visibility</h6>
                </div>
                <table className="settings-guidance-menu-table">
                  <caption className="sr-only">Choose which Clover areas appear in the main menu</caption>
                  <thead>
                    <tr>
                      <th scope="col">Main menu</th>
                      <th scope="col">Show</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guidanceMenuItems.map((item) => {
                      const isVisible = guidanceMenuVisibility[item.key];

                      return (
                        <tr key={item.key}>
                          <th scope="row">
                            <span>{item.label}</span>
                            {isVisible ? <small>{item.description}</small> : null}
                          </th>
                          <td>
                            <label className="settings-guidance-checkbox">
                              <input
                                type="checkbox"
                                checked={isVisible}
                                onChange={(event) => {
                                  const nextVisibility = {
                                    ...guidanceMenuVisibility,
                                    [item.key as GuidanceMenuKey]: event.target.checked,
                                  };
                                  setGuidanceMenuVisibility(nextVisibility);
                                  setGuidanceLevel("custom");
                                }}
                              />
                              <span className="sr-only">Show {item.label} in the main menu</span>
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="settings-display-toggle">
              <div className="settings-display-toggle__copy">
                <h5>Helper text</h5>
                <p>Show guidance and supporting labels across Clover.</p>
              </div>
              <button
                type="button"
                className={`settings-display-toggle__button${helperTextVisible ? " is-on" : ""}`}
                aria-pressed={helperTextVisible}
                onClick={() => setHelperTextVisible((current) => !current)}
              >
                {helperTextVisible ? "Shown" : "Hidden"}
              </button>
            </article>
          </section>
        ) : null}

        {activeSection === "data" ? (
          <section className="settings-section settings-section--data settings-section--swap" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Data</h4>
              </div>
            </div>

            <article className="settings-action-card settings-data-shell">
              <div className="settings-data-shell__grid">
                <section className="settings-data-zone settings-data-zone--export">
                  <div className="settings-data-zone__header">
                    <h6>Download snapshots</h6>
                  </div>

                  <div className="settings-data-export-actions">
                    <div className="settings-data-export-card">
                      <strong>Transactions as PDF</strong>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        disabled={isPending}
                        onClick={() => {
                          setStatusMessage(null);
                          void (async () => {
                            try {
                              await runDownload("/api/settings/export/transactions", "clover-transactions.pdf");
                              setStatusMessage("Transactions download started.");
                            } catch (error) {
                              setStatusMessage(error instanceof Error ? error.message : "Something went wrong.");
                            }
                          })();
                        }}
                      >
                        Download
                      </button>
                    </div>

                    <div className="settings-data-export-card">
                      <strong>Accounts as PDF</strong>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        disabled={isPending}
                        onClick={() => {
                          setStatusMessage(null);
                          void (async () => {
                            try {
                              await runDownload("/api/settings/export/account-balances", "clover-account-balances.pdf");
                              setStatusMessage("Account balances download started.");
                            } catch (error) {
                              setStatusMessage(error instanceof Error ? error.message : "Something went wrong.");
                            }
                          })();
                        }}
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </section>

                <section className="settings-data-zone settings-data-zone--delete">
                  <div className="settings-data-zone__header">
                    <h6>Remove Clover data</h6>
                  </div>

                  <div className="settings-data-danger-list">
                    <div className="settings-data-danger-item settings-data-danger-item--history">
                      <div className="settings-data-danger-copy">
                        <strong>Transactions</strong>
                        <label className="settings-inline-field settings-inline-field--history">
                          <span>Before date</span>
                          <input type="date" value={historyCutoff} onChange={(event) => setHistoryCutoff(event.target.value)} />
                        </label>
                      </div>
                      <div className="settings-data-danger-controls">
                        <button
                          type="button"
                          className="button button-danger button-small button-danger--history"
                          disabled={isPending}
                          onClick={() => openDeleteModal("transactions")}
                        >
                          Delete transactions
                        </button>
                      </div>
                    </div>

                    <div className="settings-data-danger-item">
                      <div className="settings-data-danger-copy">
                        <strong>Accounts</strong>
                      </div>
                      <button
                        type="button"
                        className="button button-danger button-small"
                        disabled={isPending}
                        onClick={() => openDeleteModal("accounts")}
                      >
                        Delete accounts
                      </button>
                    </div>

                    <div className="settings-data-danger-item">
                      <div className="settings-data-danger-copy">
                        <strong>All Clover Data</strong>
                      </div>
                      <button
                        type="button"
                        className="button button-danger button-small"
                        disabled={isPending}
                        onClick={() => openDeleteModal("all")}
                      >
                        Delete all data
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              <section className="settings-data-privacy">
                <div className="settings-data-zone__header">
                  <h6>Privacy & Data Use</h6>
                </div>
                <div className="settings-preference-card__list">
                  <SettingsToggleRow
                    label="Improve Clover suggestions from my confirmed edits"
                    checked={dataUsePreferences.improveSuggestions}
                    onToggle={() =>
                      setDataUsePreferences((current) => ({
                        ...current,
                        improveSuggestions: !current.improveSuggestions,
                      }))
                    }
                  />
                  <SettingsToggleRow
                    label="Use my data context in Adviser"
                    checked={dataUsePreferences.adviserUsesContext}
                    onToggle={() =>
                      setDataUsePreferences((current) => ({
                        ...current,
                        adviserUsesContext: !current.adviserUsesContext,
                      }))
                    }
                  />
                  <SettingsToggleRow
                    label="Clear cached app state on sign out"
                    checked={dataUsePreferences.clearCachedStateOnSignOut}
                    onToggle={() =>
                      setDataUsePreferences((current) => ({
                        ...current,
                        clearCachedStateOnSignOut: !current.clearCachedStateOnSignOut,
                      }))
                    }
                  />
                </div>
              </section>
            </article>
          </section>
        ) : null}

        {activeSection === "categories" ? (
          workspaceReady ? (
            <SettingsCategoriesPanel workspaceId={workspaceId} />
          ) : null
        ) : null}

        {activeSection === "plan" ? (
          <SettingsPlanPanel
            workspaceId={workspaceId}
            billingCustomerId={billingCustomerId}
            planTier={planTier}
            preferredBillingInterval={preferredBillingInterval}
            paypalClientId={paypalClientId}
            paypalMonthlyPlanId={paypalMonthlyPlanId}
            paypalAnnualPlanId={paypalAnnualPlanId}
            paypalBuyerCountry={paypalBuyerCountry}
            billingSubscription={billingSubscription}
            planLimits={planLimits}
            planUsage={planUsage}
            planLoading={planLoading}
            planLoaded={planLoaded}
          />
        ) : null}

        {dataDeleteModal && typeof document !== "undefined"
          ? createPortal(
              <div
                className="account-actions-modal settings-delete-modal"
                role="presentation"
                onClick={(event) => {
                  if (event.target === event.currentTarget && !dataDeleteInFlight) {
                    closeDeleteModal();
                  }
                }}
              >
                <section
                  className="account-actions-modal__card panel settings-delete-modal__card"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="settings-delete-modal-title"
                  aria-describedby="settings-delete-modal-copy"
                >
                  {dataDeleteModal.phase === "confirm" ? (
                    <>
                      <div className="account-actions-modal__head">
                        <div>
                          <p className="eyebrow">Confirm deletion</p>
                          <h4 id="settings-delete-modal-title">{dataDeleteCopy[dataDeleteModal.scope].confirmTitle}</h4>
                        </div>
                      </div>

                      <p id="settings-delete-modal-copy" className="account-actions-modal__copy">
                        {dataDeleteCopy[dataDeleteModal.scope].body}
                      </p>

                      {dataDeleteModal.scope === "transactions" ? (
                        <label className="account-actions-modal__field">
                          <span>Before date</span>
                          <input type="date" value={historyCutoff} onChange={(event) => setHistoryCutoff(event.target.value)} disabled={dataDeleteInFlight} />
                        </label>
                      ) : null}

                      <div className="account-actions-modal__actions">
                        <button className="button button-secondary button-small" type="button" onClick={closeDeleteModal} disabled={dataDeleteInFlight}>
                          Cancel
                        </button>
                        <button className="button button-danger button-small" type="button" onClick={() => void handleDeleteConfirm()} disabled={dataDeleteInFlight}>
                          {dataDeleteInFlight ? "Deleting..." : dataDeleteCopy[dataDeleteModal.scope].confirmLabel}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="account-actions-modal__head">
                        <div>
                          <p className="eyebrow">Deletion complete</p>
                          <h4 id="settings-delete-modal-title">{dataDeleteCopy[dataDeleteModal.scope].successTitle}</h4>
                        </div>
                      </div>

                      <p id="settings-delete-modal-copy" className="account-actions-modal__copy">
                        {dataDeleteCopy[dataDeleteModal.scope].successBody(dataDeleteModal.deletedCount)}
                      </p>

                      <div className="account-actions-modal__actions">
                        <button className="button button-primary button-small" type="button" onClick={closeDeleteModal}>
                          Done
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>,
              document.body
            )
          : null}

        {(activeSection === "account" || activeSection === "profiles") && (profileMessage || profileListMessage) ? (
          <p className="settings-status">{profileMessage ?? profileListMessage}</p>
        ) : null}
        {activeSection === "data" && statusMessage ? <p className="settings-status">{statusMessage}</p> : null}
      </div>
      ) : null}
    </section>
  );
}

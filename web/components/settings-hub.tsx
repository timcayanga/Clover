"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import { BillingActions } from "@/components/billing-actions";
import { PlanFeatureItem } from "@/components/plan-feature-item";
import { SettingsCategoriesPanel } from "@/components/settings-categories-panel";
import { type BillingInterval } from "@/lib/billing-plans";
import { applyHelperTextPreference, HELPER_TEXT_STORAGE_KEY, readStoredHelperTextPreference } from "@/lib/helper-text-preference";
import { getPlanDisplayLabel } from "@/lib/user-limits";
import { applyThemeMode, readStoredThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme-preference";
import { clearAllWorkspaceCaches } from "@/lib/workspace-cache";
import { persistSelectedWorkspaceId, syncSelectedWorkspaceCookie } from "@/lib/workspace-selection";

type SettingsSectionKey = "account" | "profiles" | "display" | "data" | "categories" | "plan";

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

type SettingsHubProps = {
  workspaceId: string;
  workspaceName: string;
  profiles: ProfileSummary[];
  selectedProfileId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  planTier: "free" | "pro";
  billingSubscription: BillingSubscriptionSummary | null;
  paypalClientId?: string | null;
  paypalMonthlyPlanId?: string | null;
  paypalAnnualPlanId?: string | null;
  paypalBuyerCountry?: string | null;
  planLimits: {
    accountLimit: number;
    monthlyUploadLimit: number;
    transactionLimit: number | null;
  };
  planUsage: {
    accountCount: number;
    cashAccountCount: number;
    monthlyUploadCount: number;
    transactionCount: number;
  };
};

function SettingsIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="settings-hub__menu-icon">
      <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function PlanIcon({ name }: { name: "free" | "annual" | "monthly" }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "free") {
    return (
      <svg {...common}>
        <path d="M12 3.5 5.5 8l6.5 4.5L18.5 8 12 3.5Z" />
        <path d="M5.5 16l6.5 4.5 6.5-4.5" />
      </svg>
    );
  }

  if (name === "annual") {
    return (
      <svg {...common}>
        <path d="m12 3 1.7 4.8 4.9.2-3.8 3 1.3 4.7L12 13.3 7.9 15.7l1.3-4.7-3.8-3 4.9-.2L12 3Z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="m12 3 1.7 4.8 4.9.2-3.8 3 1.3 4.7L12 13.3 7.9 15.7l1.3-4.7-3.8-3 4.9-.2L12 3Z" />
    </svg>
  );
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
    icon: <SettingsIcon path="M12 13.5c2.761 0 5-2.462 5-5.5S14.761 2.5 12 2.5 7 4.962 7 8s2.239 5.5 5 5.5Zm0 1.5c-4.418 0-8 2.91-8 6.5V22h16v-.5c0-3.59-3.582-6.5-8-6.5Z" />,
  },
  profiles: {
    title: "Profiles",
    icon: <SettingsIcon path="M12 13.5c2.761 0 5-2.462 5-5.5S14.761 2.5 12 2.5 7 4.962 7 8s2.239 5.5 5 5.5Zm0 1.5c-4.418 0-8 2.91-8 6.5V22h16v-.5c0-3.59-3.582-6.5-8-6.5Z" />,
  },
  display: {
    title: "Display",
    icon: <SettingsIcon path="M7 7h10v10H7z M4 4h2M18 4h2M4 20h2M18 20h2M4 18V6M20 18V6" />,
  },
  data: {
    title: "Data",
    icon: <SettingsIcon path="M4 6h16M6 6v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6M9 10v6M15 10v6M10 3h4a1 1 0 0 1 1 1v2H9V4a1 1 0 0 1 1-1Z" />,
  },
  categories: {
    title: "Categories",
    icon: <SettingsIcon path="M5 6h14M5 12h14M5 18h14M8 6v12M12 6v12M16 6v12" />,
  },
  plan: {
    title: "Plan",
    icon: <SettingsIcon path="M12 3.5 14.9 8.8 21 9.7l-4.4 4.3 1 6.1L12 17.8 6.4 20.1l1-6.1L3 9.7l6.1-.9L12 3.5Z" />,
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

const planCards = [
  {
    value: "free" as const,
    title: "Free",
    price: "PHP 0",
    icon: "free" as const,
    badge: "",
    helper: "Start here during beta and keep the core Clover workflow open.",
    description: "Best for getting a small profile organized without commitment.",
    features: [
      "Manual transaction tracking",
      "5 non-cash accounts",
      "10 monthly uploads",
      "1,000 transaction rows",
      "Basic investment tracking",
      "Basic reports and insights",
      "Basic goal tracking",
    ],
  },
  {
    value: "annual" as const,
    title: "Annual",
    price: "PHP 1,299 / year",
    icon: "annual" as const,
    badge: "Pro",
    savings: "Save PHP 489 vs monthly",
    helper: "Best value for people who want to stay on Pro all year.",
    description: "Upgrade for the yearly price and get the same Pro access for less than monthly billing.",
    features: [
      "Everything in Free",
      "20 non-cash accounts",
      "100 monthly uploads",
      "Unlimited transaction rows",
      "Full investment portfolio tools",
      "Advanced reports and insights",
      "Enhanced goal tracking and recommendations",
    ],
  },
  {
    value: "monthly" as const,
    title: "Monthly",
    price: "PHP 149 / month",
    icon: "monthly" as const,
    badge: "",
    helper: "Flexible Pro access for people who prefer month-to-month billing.",
    description: "Upgrade for shorter commitment while keeping the same Pro feature set.",
    features: [
      "Everything in Free",
      "20 non-cash accounts",
      "100 monthly uploads",
      "Unlimited transaction rows",
      "Full investment portfolio tools",
      "Advanced reports and insights",
      "Enhanced goal tracking and recommendations",
    ],
  },
] as const;

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

function formatLimitCount(used: number, limit: number | null, suffix?: string) {
  if (limit === null) {
    return `Unlimited${suffix ? ` ${suffix}` : ""}`;
  }

  return `${used.toLocaleString()} / ${limit.toLocaleString()}${suffix ? ` ${suffix}` : ""}`;
}

function formatPlanDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function getUsagePercent(used: number, limit: number | null) {
  if (limit === null) {
    return 100;
  }

  return Math.max(0, Math.min((used / limit) * 100, 100));
}

export function SettingsHub({
  workspaceId,
  workspaceName,
  profiles,
  selectedProfileId,
  firstName,
  lastName,
  email,
  planTier,
  billingSubscription,
  paypalClientId,
  paypalMonthlyPlanId,
  paypalAnnualPlanId,
  paypalBuyerCountry,
  planLimits,
  planUsage,
}: SettingsHubProps) {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("account");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [helperTextVisible, setHelperTextVisible] = useState(true);
  const [historyCutoff, setHistoryCutoff] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [profileRenameDrafts, setProfileRenameDrafts] = useState<Record<string, string>>({});
  const [activeProfileId, setActiveProfileId] = useState(selectedProfileId);
  const [firstNameDraft, setFirstNameDraft] = useState(firstName ?? "");
  const [lastNameDraft, setLastNameDraft] = useState(lastName ?? "");
  const [passwordCurrentDraft, setPasswordCurrentDraft] = useState("");
  const [passwordNewDraft, setPasswordNewDraft] = useState("");
  const [passwordConfirmDraft, setPasswordConfirmDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);

  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null;
  const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? email;
  const profileImage = user?.imageUrl ?? null;
  const connectedAccounts = user?.externalAccounts ?? [];

  useEffect(() => {
    const storedTheme = readStoredThemeMode();
    const initialTheme = storedTheme === "dark" ? "dark" : "light";
    setThemeMode(initialTheme);
    applyThemeMode(initialTheme);
  }, []);

  useEffect(() => {
    setActiveProfileId(selectedProfileId);
  }, [selectedProfileId]);

  useEffect(() => {
    setProfileRenameDrafts(
      profiles.reduce<Record<string, string>>((drafts, profile) => {
        drafts[profile.id] = profile.name;
        return drafts;
      }, {})
    );
  }, [profiles]);

  useEffect(() => {
    setFirstNameDraft(firstName ?? "");
    setLastNameDraft(lastName ?? "");
  }, [firstName, lastName]);

  useEffect(() => {
    const initialHelperText = readStoredHelperTextPreference();
    setHelperTextVisible(initialHelperText);
    applyHelperTextPreference(initialHelperText);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    applyThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem(HELPER_TEXT_STORAGE_KEY, helperTextVisible ? "visible" : "hidden");
    applyHelperTextPreference(helperTextVisible);
  }, [helperTextVisible]);

  const runDownload = async (path: string, fileName: string) => {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error("Unable to prepare the download.");
    }

    const blob = await response.blob();
    downloadBlob(blob, fileName);
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

  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";

    if (!file || !isLoaded || !isSignedIn || !user) {
      return;
    }

    startTransition(async () => {
      setPhotoMessage(null);

      try {
        await user.setProfileImage({ file });
        await user.reload();
        setPhotoMessage("Profile picture updated.");
      } catch (error) {
        setPhotoMessage(error instanceof Error ? error.message : "Unable to update your profile picture.");
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

  const runDelete = async (scope: "transactions" | "balances" | "accounts") => {
    const response = await fetch("/api/settings/data", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId,
        beforeDate: historyCutoff,
        scope,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string; deleted?: number };
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to update data.");
    }

    clearAllWorkspaceCaches();
    router.refresh();

    return payload.deleted ?? 0;
  };

  const handleAction = (action: () => Promise<void>) => {
    setStatusMessage(null);
    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "Something went wrong.");
      }
    });
  };

  const handleProfileSwitch = (profileId: string) => {
    if (!profileId || profileId === activeProfileId) {
      return;
    }

    persistSelectedWorkspaceId(profileId);
    syncSelectedWorkspaceCookie();
    setActiveProfileId(profileId);
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
        router.refresh();
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : "Unable to create profile.");
      }
    });
  };

  const handleProfileRename = (profileId: string) => {
    const nextName = profileRenameDrafts[profileId]?.trim();
    const currentProfile = profiles.find((profile) => profile.id === profileId);

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
        router.refresh();
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : "Unable to update profile.");
      }
    });
  };

  const handleProfileRemove = (profileId: string, profileName: string) => {
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
        router.refresh();
      } catch (error) {
        setProfileMessage(error instanceof Error ? error.message : "Unable to remove profile.");
      }
    });
  };

  const isFree = planTier === "free";
  const currentPlanValue = planTier === "free" ? "free" : billingSubscription?.interval ?? "annual";
  const currentPlanCard = planCards.find((plan) => plan.value === currentPlanValue) ?? planCards[0];
  const currentPlanLabel = getPlanDisplayLabel(planTier, billingSubscription?.interval ?? null);
  const renewalDate = formatPlanDate(billingSubscription?.currentPeriodEnd ?? billingSubscription?.nextBillingTime ?? null);
  const annualCheckoutReady = Boolean(paypalClientId && paypalAnnualPlanId);
  const monthlyCheckoutReady = Boolean(paypalClientId && paypalMonthlyPlanId);
  const planUsageCards = [
    {
      label: "Accounts",
      value: formatLimitCount(planUsage.accountCount, planLimits.accountLimit, "accounts"),
      used: planUsage.accountCount,
      limit: planLimits.accountLimit,
    },
    {
      label: "Monthly uploads",
      value: formatLimitCount(planUsage.monthlyUploadCount, planLimits.monthlyUploadLimit, "uploads"),
      used: planUsage.monthlyUploadCount,
      limit: planLimits.monthlyUploadLimit,
    },
    {
      label: "Transaction rows",
      value: formatLimitCount(planUsage.transactionCount, planLimits.transactionLimit, "rows"),
      used: planUsage.transactionCount,
      limit: planLimits.transactionLimit,
    },
  ];

  return (
    <section className="settings-hub">
      <aside className="settings-hub__menu glass">
        <Link className="settings-hub__brand" href="/dashboard" aria-label="Go to dashboard">
          <img className="settings-hub__brand-mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
          <div className="settings-hub__brand-copy">
            <strong>Clover</strong>
            <span>{activeProfile?.name ?? workspaceName}</span>
          </div>
        </Link>
        <div className="settings-hub__menu-list" role="tablist" aria-label="Settings sections">
          {(Object.keys(sectionCopy) as SettingsSectionKey[]).map((sectionKey) => {
            const section = sectionCopy[sectionKey];
            const isActive = activeSection === sectionKey;

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
          })}
        </div>
      </aside>

      <div className="settings-hub__panel glass">
        {activeSection === "account" ? (
          <section className="settings-section settings-section--profile" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Account Details</h4>
              </div>
            </div>

            <div className="settings-account-grid">
              <article className="settings-action-card settings-account-card">
                <div className="settings-account-card__head">
                  <h5>Picture</h5>
                </div>
                <div className="settings-account-photo-row">
                  <span className="settings-account-photo" aria-hidden="true">
                    {profileImage ? <img src={profileImage} alt="" /> : <span>{(firstNameDraft || workspaceName).trim().slice(0, 1).toUpperCase()}</span>}
                  </span>
                  <div className="settings-account-photo-actions">
                    <p>Update the photo used across Clover.</p>
                    <input
                      ref={profileImageInputRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={handleProfileImageChange}
                    />
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => profileImageInputRef.current?.click()}
                      disabled={isPending}
                    >
                      Change picture
                    </button>
                    {photoMessage ? <p className="settings-helper">{photoMessage}</p> : null}
                  </div>
                </div>
              </article>

              <article className="settings-action-card settings-account-card">
                <div className="settings-account-card__head">
                  <h5>Account details</h5>
                </div>
                <div className="settings-account-form">
                  <label className="settings-inline-field">
                    <span>First name</span>
                    <input value={firstNameDraft} onChange={(event) => setFirstNameDraft(event.target.value)} placeholder="First name" />
                  </label>
                  <label className="settings-inline-field">
                    <span>Last name</span>
                    <input value={lastNameDraft} onChange={(event) => setLastNameDraft(event.target.value)} placeholder="Last name" />
                  </label>
                  <label className="settings-inline-field">
                    <span>Email</span>
                    <input value={primaryEmail} readOnly />
                  </label>
                  <div className="settings-account-form__actions">
                    <button
                      type="button"
                      className="button button-primary button-small"
                      onClick={handleAccountSave}
                      disabled={isPending}
                    >
                      Save account
                    </button>
                    {accountMessage ? <p className="settings-helper">{accountMessage}</p> : null}
                  </div>
                </div>
              </article>

              <article className="settings-action-card settings-account-card">
                <div className="settings-account-card__head">
                  <h5>Password</h5>
                </div>
                <div className="settings-account-form">
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
              </article>

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
            </div>
          </section>
        ) : null}

        {activeSection === "profiles" ? (
          <section className="settings-section" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Profiles</h4>
              </div>
            </div>

            <div className="settings-data-grid">
              <article className="settings-action-card">
                <div>
                  <h5>Create a profile</h5>
                  <p>New profiles stay separated by default so Clover can keep personal and shared money clear.</p>
                </div>
                <div className="settings-action-card__row">
                  <label className="settings-inline-field">
                    <span>Profile name</span>
                    <input
                      value={newProfileName}
                      onChange={(event) => setNewProfileName(event.target.value)}
                      placeholder="Personal, Shared, Partner..."
                    />
                  </label>
                  <button
                    type="button"
                    className="button button-primary button-small"
                    disabled={isPending}
                    onClick={() => handleProfileCreate()}
                  >
                    Create profile
                  </button>
                </div>
              </article>
            </div>

            <div className="settings-data-grid">
              {profiles.map((profile) => {
                const isActive = profile.id === activeProfileId;
                const renameDraft = profileRenameDrafts[profile.id] ?? profile.name;

                return (
                  <article key={profile.id} className={`settings-action-card${isActive ? " is-active" : ""}`}>
                    <div>
                      <h5>{profile.name}</h5>
                      <p>{profile.type === "shared" ? "Shared profile" : "Personal profile"}</p>
                    </div>
                    <div className="settings-action-card__row">
                      <label className="settings-inline-field">
                        <span>Rename</span>
                        <input
                          value={renameDraft}
                          onChange={(event) =>
                            setProfileRenameDrafts((current) => ({
                              ...current,
                              [profile.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        disabled={isPending}
                        onClick={() => handleProfileRename(profile.id)}
                      >
                        Save name
                      </button>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        disabled={isPending || isActive}
                        onClick={() => handleProfileSwitch(profile.id)}
                      >
                        {isActive ? "Active" : "Switch"}
                      </button>
                      <button
                        type="button"
                        className="button button-danger button-small"
                        disabled={isPending}
                        onClick={() => handleProfileRemove(profile.id, profile.name)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <p className="settings-helper">Profiles are scoped to the signed-in email account and will not move data silently between each other.</p>
          </section>
        ) : null}

        {activeSection === "display" ? (
          <section className="settings-section" role="tabpanel">
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
          <section className="settings-section" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Data</h4>
              </div>
            </div>

            <div className="settings-data-grid">
              <article className="settings-action-card">
                <div>
                  <h5>Download transactions</h5>
                  <p>Export the selected profile’s transactions as CSV.</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  disabled={isPending}
                  onClick={() =>
                    handleAction(async () => {
                      await runDownload(`/api/settings/export/transactions?workspaceId=${encodeURIComponent(workspaceId)}`, "clover-transactions.csv");
                      setStatusMessage("Transactions download started.");
                    })
                  }
                >
                  Download transactions
                </button>
              </article>

              <article className="settings-action-card">
                <div>
                  <h5>Download account balances</h5>
                  <p>Export the latest balances for each account in CSV format.</p>
                </div>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  disabled={isPending}
                  onClick={() =>
                    handleAction(async () => {
                      await runDownload(
                        `/api/settings/export/account-balances?workspaceId=${encodeURIComponent(workspaceId)}`,
                        "clover-account-balances.csv"
                      );
                      setStatusMessage("Account balances download started.");
                    })
                  }
                >
                  Download balances
                </button>
              </article>
            </div>

            <div className="settings-data-delete">
              <article className="settings-action-card">
                <div>
                  <h5>Delete transaction history</h5>
                  <p>Remove transactions before a chosen date from this profile.</p>
                </div>
                <div className="settings-action-card__row">
                  <label className="settings-inline-field">
                    <span>Before date</span>
                    <input type="date" value={historyCutoff} onChange={(event) => setHistoryCutoff(event.target.value)} />
                  </label>
                  <button
                    type="button"
                    className="button button-danger button-small"
                    disabled={isPending}
                    onClick={() =>
                      handleAction(async () => {
                        if (!window.confirm("Delete transaction history before the selected date? This only removes transactions and leaves your accounts in place.")) {
                          return;
                        }
                        const deleted = await runDelete("transactions");
                        setStatusMessage(`Deleted ${deleted} transaction${deleted === 1 ? "" : "s"}.`);
                      })
                    }
                  >
                    Delete transactions
                  </button>
                </div>
              </article>

              <article className="settings-action-card">
                <div>
                  <h5>Delete accounts</h5>
                  <p>Remove non-cash accounts in this profile together with their linked transactions.</p>
                </div>
                <div className="settings-action-card__row">
                  <button
                    type="button"
                    className="button button-danger button-small"
                    disabled={isPending}
                    onClick={() =>
                      handleAction(async () => {
                        if (
                          !window.confirm(
                            "Delete all non-cash accounts in this profile? Their linked transactions will be removed too. Clover can recreate the default Cash account later if needed."
                          )
                        ) {
                          return;
                        }
                        const deleted = await runDelete("accounts");
                        setStatusMessage(`Deleted ${deleted} account${deleted === 1 ? "" : "s"} from this profile.`);
                      })
                    }
                  >
                    Delete accounts
                  </button>
                </div>
              </article>

              <article className="settings-action-card">
                <div>
                  <h5>Delete all Clover data</h5>
                  <p>Start fresh by removing app data across all of your profiles while keeping your login.</p>
                </div>
                <div className="settings-action-card__row">
                  <button
                    type="button"
                    className="button button-danger button-small"
                    disabled={isPending}
                    onClick={() =>
                      handleAction(async () => {
                        if (
                          !window.confirm(
                            "Delete all Clover data across every profile? This removes your accounts, transactions, imports, and learned data, but keeps your Clover login."
                          )
                        ) {
                          return;
                        }

                        const response = await fetch("/api/account/wipe-data", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                        });

                        const payload = (await response.json().catch(() => ({}))) as { error?: string };
                        if (!response.ok) {
                          throw new Error(payload.error ?? "Unable to delete Clover data.");
                        }

                        persistSelectedWorkspaceId("");
                        syncSelectedWorkspaceCookie();
                        clearAllWorkspaceCaches();
                        window.location.assign("/dashboard");
                      })
                    }
                  >
                    Delete all data
                  </button>
                </div>
              </article>

              <article className="settings-action-card">
                <div>
                  <h5>Delete balance history</h5>
                  <p>Remove older statement checkpoints before the chosen date without deleting the accounts themselves.</p>
                </div>
                <div className="settings-action-card__row">
                  <label className="settings-inline-field">
                    <span>Before date</span>
                    <input type="date" value={historyCutoff} onChange={(event) => setHistoryCutoff(event.target.value)} />
                  </label>
                  <button
                    type="button"
                    className="button button-danger button-small"
                    disabled={isPending}
                    onClick={() =>
                      handleAction(async () => {
                        if (!window.confirm("Delete balance history before the selected date? This only removes old statement checkpoints.")) {
                          return;
                        }
                        const deleted = await runDelete("balances");
                        setStatusMessage(`Deleted ${deleted} balance record${deleted === 1 ? "" : "s"}.`);
                      })
                    }
                  >
                    Delete balance history
                  </button>
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {activeSection === "categories" ? (
          <section className="settings-section" role="tabpanel">
            <SettingsCategoriesPanel workspaceId={workspaceId} />
          </section>
        ) : null}

        {activeSection === "plan" ? (
          <section className="settings-section" role="tabpanel">
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <h4>Plan</h4>
              </div>
            </div>

            <div className="settings-plan-usage settings-plan-usage--with-plan" aria-label="Current plan usage">
              <article className="settings-plan-usage__card settings-plan-usage__card--plan">
                <div className="settings-plan-usage__head">
                  <strong>Current plan</strong>
                  <span className="settings-plan-usage__tier">
                    <PlanIcon name={currentPlanValue === "free" ? "free" : "annual"} />
                    {currentPlanCard.title}
                  </span>
                </div>
                <div className="settings-plan-usage__value">{currentPlanLabel}</div>
                {planTier === "pro" && renewalDate ? (
                  <div className="settings-plan-usage__renewal">
                    <span>Renewal</span>
                    <strong>{renewalDate}</strong>
                    <p>Charge and limits refresh on this date.</p>
                  </div>
                ) : null}
              </article>

              {planUsageCards.map((usage) => {
                const percent = getUsagePercent(usage.used, usage.limit);
                const usageTierIcon = planTier === "free" ? "free" : "annual";

                return (
                  <article key={usage.label} className="settings-plan-usage__card">
                    <div className="settings-plan-usage__head">
                      <strong>{usage.label}</strong>
                      <span className="settings-plan-usage__tier">
                        <PlanIcon name={usageTierIcon} />
                        {planTier === "free" ? "Free" : "Pro"}
                      </span>
                    </div>
                    <div className="settings-plan-usage__meter" aria-hidden="true">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <div className="settings-plan-usage__value">{usage.value}</div>
                  </article>
                );
              })}
            </div>

            <div className="settings-plan-grid" role="radiogroup" aria-label="Billing plan">
              {planCards.map((option) => {
                const isCurrent = currentPlanValue === option.value;

                return (
                  <article
                    key={option.value}
                    className={`settings-plan-card settings-plan-card--${option.value}${isCurrent ? " is-current" : ""}`}
                  >
                    <div className="settings-plan-card__band">
                      <div className="settings-plan-card__band-copy">
                        <div className="settings-plan-card__icon">
                          <PlanIcon name={option.icon} />
                        </div>
                        <div className="settings-plan-card__band-text">
                      <span className="settings-plan-card__band-title">{option.title}</span>
                      <span className="settings-plan-card__band-price">{option.price}</span>
                    </div>
                  </div>
                      {option.badge ? <span className="settings-plan-card__band-badge">{option.badge}</span> : null}
                    </div>

                    <div className="settings-plan-card__body">
                      <ul className="settings-plan-card__features">
                        {option.features.map((feature) => (
                          <PlanFeatureItem key={feature} label={feature} className="settings-plan-card__feature-row" />
                        ))}
                      </ul>

                      <div className="settings-plan-card__footer">
                        {option.value === "annual" ? (
                          <p className="settings-plan-card__savings">{option.savings}</p>
                        ) : null}

                        {option.value !== "free" && planTier === "pro" && renewalDate ? (
                          <p className="settings-plan-card__renewal">
                            Renews on <strong>{renewalDate}</strong>
                          </p>
                        ) : null}

                        {option.value === "free" ? (
                          <div className="settings-plan-card__current">
                            {isCurrent ? <span className="settings-pill">Current plan</span> : null}
                          </div>
                        ) : isFree ? (
                          <div className="settings-plan-card__cta">
                            {option.value === "annual" && annualCheckoutReady ? (
                              <PayPalSubscribeButton
                                clientId={paypalClientId!}
                                planId={paypalAnnualPlanId!}
                                customId={workspaceId}
                                buyerCountry={paypalBuyerCountry}
                                className="settings-plan-card__paypal"
                                fundingSource="card"
                              />
                            ) : option.value === "monthly" && monthlyCheckoutReady ? (
                              <PayPalSubscribeButton
                                clientId={paypalClientId!}
                                planId={paypalMonthlyPlanId!}
                                customId={workspaceId}
                                buyerCountry={paypalBuyerCountry}
                                className="settings-plan-card__paypal"
                                fundingSource="card"
                              />
                            ) : (
                              <p className="settings-helper">PayPal checkout is not configured yet.</p>
                            )}
                          </div>
                        ) : (
                          <div className="settings-plan-card__current">
                            {isCurrent ? <span className="settings-pill">Current plan</span> : <span className="settings-helper">Manage this plan below.</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {planTier === "pro" ? (
              <div className="settings-plan-panel">
                <BillingActions
                  planTier="pro"
                  clientId={paypalClientId}
                  monthlyPlanId={paypalMonthlyPlanId}
                  annualPlanId={paypalAnnualPlanId}
                  buyerCountry={paypalBuyerCountry}
                  customId={workspaceId}
                  returnPath="/settings"
                  subscription={billingSubscription}
                  className="settings-plan-panel__billing"
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {(activeSection === "account" || activeSection === "profiles") && profileMessage ? (
          <p className="settings-status">{profileMessage}</p>
        ) : null}
        {activeSection === "data" && statusMessage ? <p className="settings-status">{statusMessage}</p> : null}
      </div>
    </section>
  );
}

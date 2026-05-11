"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { UserAvatarEditor } from "@/components/user-avatar-editor";
import { applyHelperTextPreference, HELPER_TEXT_STORAGE_KEY, readStoredHelperTextPreference } from "@/lib/helper-text-preference";
import { applyThemeMode, readStoredThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme-preference";
import { clearAllWorkspaceCaches } from "@/lib/workspace-cache";
import { persistSelectedWorkspaceId, syncSelectedWorkspaceCookie } from "@/lib/workspace-selection";
import type { BillingInterval } from "@/lib/billing-plans";

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
  {
    loading: () => (
      <article className="settings-action-card">
        <div>
          <h5>Loading profiles</h5>
          <p>Fetching your workspace list now.</p>
        </div>
      </article>
    ),
  }
);

const SettingsPlanPanel = dynamic(
  () => import("@/components/settings-plan-panel").then((module) => module.SettingsPlanPanel),
  {
    loading: () => (
      <article className="settings-action-card">
        <div>
          <h5>Loading plan details</h5>
          <p>Fetching your limits, usage, and billing status.</p>
        </div>
      </article>
    ),
  }
);

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
  mode?: "menu" | "panel" | "full";
  initialSection?: SettingsSectionKey;
  workspaceId: string;
  workspaceName: string;
  selectedProfileId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  planTier: "free" | "pro";
  paypalClientId?: string | null;
  paypalMonthlyPlanId?: string | null;
  paypalAnnualPlanId?: string | null;
  paypalBuyerCountry?: string | null;
};

function SettingsIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="settings-hub__menu-icon">
      <path d={path} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
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
    icon: <SettingsIcon path="M5 6h14v4H5zM5 11h14v4H5zM5 16h14v2H5z" />,
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
  workspaceId,
  workspaceName,
  selectedProfileId,
  firstName,
  lastName,
  email,
  planTier,
  paypalClientId,
  paypalMonthlyPlanId,
  paypalAnnualPlanId,
  paypalBuyerCountry,
}: SettingsHubProps) {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(initialSection);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [helperTextVisible, setHelperTextVisible] = useState(true);
  const [historyCutoff, setHistoryCutoff] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordEditorOpen, setPasswordEditorOpen] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [profileRenameDrafts, setProfileRenameDrafts] = useState<Record<string, string>>({});
  const [activeProfileId, setActiveProfileId] = useState(selectedProfileId);
  const [firstNameDraft, setFirstNameDraft] = useState(firstName ?? "");
  const [lastNameDraft, setLastNameDraft] = useState(lastName ?? "");
  const [passwordCurrentDraft, setPasswordCurrentDraft] = useState("");
  const [passwordNewDraft, setPasswordNewDraft] = useState("");
  const [passwordConfirmDraft, setPasswordConfirmDraft] = useState("");
  const [profileList, setProfileList] = useState<ProfileSummary[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profileListMessage, setProfileListMessage] = useState<string | null>(null);
  const [billingSubscription, setBillingSubscription] = useState<BillingSubscriptionSummary | null>(null);
  const [planLimits, setPlanLimits] = useState({
    accountLimit: 0,
    monthlyUploadLimit: 0,
    transactionLimit: null as number | null,
  });
  const [planUsage, setPlanUsage] = useState({
    accountCount: 0,
    cashAccountCount: 0,
    monthlyUploadCount: 0,
    transactionCount: 0,
  });
  const [planLoaded, setPlanLoaded] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeProfile = profileList.find((profile) => profile.id === activeProfileId) ?? profileList[0] ?? null;
  const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? email;
  const connectedAccounts = user?.externalAccounts ?? [];

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
          setProfileList(payload.workspaces ?? []);
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
  }, [activeSection, profilesLoaded, profilesLoading]);

  useEffect(() => {
    let cancelled = false;

    const loadPlan = async () => {
      if (planLoaded || planLoading || activeSection !== "plan") {
        return;
      }

      setPlanLoading(true);

      try {
        const [meResponse, summaryResponse] = await Promise.all([
          fetch("/api/me", { cache: "no-store" }),
          fetch(`/api/settings/summary?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }),
        ]);

        const mePayload = (await meResponse.json().catch(() => ({}))) as {
          user?: {
            billingSubscription?: BillingSubscriptionSummary | null;
            accountLimit?: number;
            monthlyUploadLimit?: number;
            transactionLimit?: number | null;
          };
          error?: string;
        };
        const summaryPayload = (await summaryResponse.json().catch(() => ({}))) as {
          planUsage?: {
            accountCount: number;
            cashAccountCount: number;
            monthlyUploadCount: number;
            transactionCount: number;
          };
          error?: string;
        };

        if (!meResponse.ok) {
          throw new Error(mePayload.error ?? "Unable to load plan details.");
        }

        if (!summaryResponse.ok) {
          throw new Error(summaryPayload.error ?? "Unable to load plan usage.");
        }

        if (!cancelled) {
          setBillingSubscription(mePayload.user?.billingSubscription ?? null);
          setPlanLimits({
            accountLimit: mePayload.user?.accountLimit ?? 0,
            monthlyUploadLimit: mePayload.user?.monthlyUploadLimit ?? 0,
            transactionLimit: mePayload.user?.transactionLimit ?? null,
          });
          setPlanUsage(
            summaryPayload.planUsage ?? {
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
  }, [activeSection, planLoaded, planLoading, workspaceId]);

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

  return (
    <section className={`settings-hub${mode === "panel" ? " settings-hub--panel-only" : mode === "menu" ? " settings-hub--menu-only" : ""}`}>
      {mode !== "panel" ? (
        <aside className="settings-hub__menu glass">
          <Link className="settings-hub__brand" href="/dashboard" aria-label="Go to dashboard">
            <img className="settings-hub__brand-mark" src="/clover-mark.svg" alt="" aria-hidden="true" />
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
                  <span className="settings-pill">Account</span>
                </div>
                <UserAvatarEditor displayName={`${firstNameDraft} ${lastNameDraft}`.trim() || workspaceName} avatarUrl={user?.imageUrl ?? null} />
              </article>

              <article className="settings-action-card settings-account-card settings-account-card--details">
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
            userImageUrl={user?.imageUrl ?? null}
            activeProfileId={activeProfileId}
            profileList={profileList}
            profilesLoading={profilesLoading}
            newProfileName={newProfileName}
            profileRenameDrafts={profileRenameDrafts}
            isPending={isPending}
            profileMessage={profileMessage}
            profileListMessage={profileListMessage}
            onNewProfileNameChange={setNewProfileName}
            onRenameDraftChange={(profileId, value) =>
              setProfileRenameDrafts((current) => ({
                ...current,
                [profileId]: value,
              }))
            }
            onCreateProfile={handleProfileCreate}
            onRenameProfile={handleProfileRename}
            onSwitchProfile={handleProfileSwitch}
            onRemoveProfile={handleProfileRemove}
          />
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

            <div className="settings-data-grid settings-data-grid--split">
              <article className="settings-action-card settings-data-download">
                <div>
                  <h5>Download</h5>
                </div>

                <div className="settings-data-download__list">
                  <div className="settings-data-download__item">
                    <div className="settings-data-download__item-copy">
                      <strong>Transactions as PDF</strong>
                      <span>Download the selected profile’s transactions as a PDF.</span>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      disabled={isPending}
                      onClick={() =>
                        handleAction(async () => {
                          await runDownload(
                            `/api/settings/export/transactions?workspaceId=${encodeURIComponent(workspaceId)}`,
                            "clover-transactions.pdf"
                          );
                          setStatusMessage("Transactions download started.");
                        })
                      }
                    >
                      Download Transactions
                    </button>
                  </div>

                  <div className="settings-data-download__item">
                    <div className="settings-data-download__item-copy">
                      <strong>Accounts as PDF</strong>
                      <span>Download the latest balances for each account as a PDF.</span>
                    </div>
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      disabled={isPending}
                      onClick={() =>
                        handleAction(async () => {
                          await runDownload(
                            `/api/settings/export/account-balances?workspaceId=${encodeURIComponent(workspaceId)}`,
                            "clover-account-balances.pdf"
                          );
                          setStatusMessage("Account balances download started.");
                        })
                      }
                    >
                      Download Accounts
                    </button>
                  </div>
                </div>
              </article>

              <article className="settings-action-card settings-data-delete settings-data-delete--compact">
                <div>
                  <h5>Delete</h5>
                </div>

                <div className="settings-data-delete__list">
                <div className="settings-data-delete__item">
                  <div className="settings-data-delete__item-copy">
                    <strong>Transactions</strong>
                    <span>Delete transactions before the selected date.</span>
                  </div>
                  <div className="settings-data-delete__controls">
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
                </div>

                <div className="settings-data-delete__item">
                  <div className="settings-data-delete__item-copy">
                    <strong>Accounts</strong>
                    <span>Delete accounts and linked transactions.</span>
                  </div>
                  <div className="settings-data-delete__controls">
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
                </div>

                <div className="settings-data-delete__item">
                  <div className="settings-data-delete__item-copy">
                    <strong>All Clover Data</strong>
                    <span>Delete everything in Clover while keeping your login.</span>
                  </div>
                  <div className="settings-data-delete__controls">
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
                </div>
              </div>
              </article>
            </div>
          </section>
        ) : null}

        {activeSection === "categories" ? <SettingsCategoriesPanel workspaceId={workspaceId} /> : null}

        {activeSection === "plan" ? (
          <SettingsPlanPanel
            workspaceId={workspaceId}
            planTier={planTier}
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

        {(activeSection === "account" || activeSection === "profiles") && (profileMessage || profileListMessage) ? (
          <p className="settings-status">{profileMessage ?? profileListMessage}</p>
        ) : null}
        {activeSection === "data" && statusMessage ? <p className="settings-status">{statusMessage}</p> : null}
      </div>
      ) : null}
    </section>
  );
}

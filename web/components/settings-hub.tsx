"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { UserProfile } from "@clerk/nextjs";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import { BillingActions } from "@/components/billing-actions";
import { getBillingPlanLabel, type BillingInterval } from "@/lib/billing-plans";

type ThemeMode = "light" | "dark" | "system";
type SettingsSectionKey = "profile" | "display" | "data" | "plan";

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
  firstName: string | null;
  lastName: string | null;
  email: string;
  planTier: "free" | "pro";
  billingSubscription: BillingSubscriptionSummary | null;
  paypalClientId?: string | null;
  paypalMonthlyPlanId?: string | null;
  paypalAnnualPlanId?: string | null;
};

const sectionCopy: Record<
  SettingsSectionKey,
  {
    title: string;
    description: string;
  }
> = {
  profile: {
    title: "Profile",
    description: "Manage the account details Clerk owns for you.",
  },
  display: {
    title: "Display",
    description: "Choose how Clover looks on this device.",
  },
  data: {
    title: "Data",
    description: "Download or prune data in the active workspace.",
  },
  plan: {
    title: "Plan",
    description: "See the current plan and switch billing cadence.",
  },
};

const themeOptions: Array<{
  value: ThemeMode;
  label: string;
  helper: string;
}> = [
  { value: "light", label: "Light", helper: "Bright, high-contrast workspace view." },
  { value: "dark", label: "Dark", helper: "Muted contrast for low-light sessions." },
  { value: "system", label: "Match system", helper: "Follows the device preference automatically." },
];

function getResolvedTheme(mode: ThemeMode) {
  if (mode !== "system") {
    return mode;
  }

  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function formatPlanLabel(planTier: "free" | "pro", interval: BillingInterval | null) {
  if (planTier === "free") {
    return "Free";
  }

  return interval ? getBillingPlanLabel(interval) : "Pro";
}

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
  workspaceId,
  workspaceName,
  firstName,
  lastName,
  email,
  planTier,
  billingSubscription,
  paypalClientId,
  paypalMonthlyPlanId,
  paypalAnnualPlanId,
}: SettingsHubProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("profile");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [selectedPlan, setSelectedPlan] = useState<BillingInterval | "free">("annual");
  const [historyCutoff, setHistoryCutoff] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentPlanLabel = useMemo(() => formatPlanLabel(planTier, billingSubscription?.interval ?? null), [billingSubscription?.interval, planTier]);
  const subscriptionStatusLabel = useMemo(() => {
    if (!billingSubscription) {
      return null;
    }

    if (planTier === "free") {
      return "Free";
    }

    if (billingSubscription.pendingInterval) {
      return `Pending ${getBillingPlanLabel(billingSubscription.pendingInterval)}`;
    }

    return billingSubscription.interval ? getBillingPlanLabel(billingSubscription.interval) : "Pro";
  }, [billingSubscription, planTier]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("clover.settings-theme") as ThemeMode | null;
    const initialTheme: ThemeMode = savedTheme === "light" || savedTheme === "dark" || savedTheme === "system" ? savedTheme : "system";
    setThemeMode(initialTheme);
    document.documentElement.dataset.theme = getResolvedTheme(initialTheme);
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme = getResolvedTheme(themeMode);
    };

    window.localStorage.setItem("clover.settings-theme", themeMode);
    applyTheme();

    if (themeMode !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => applyTheme();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themeMode]);

  useEffect(() => {
    setSelectedPlan(planTier === "pro" ? billingSubscription?.interval ?? "annual" : "annual");
  }, [billingSubscription?.interval, planTier]);

  const runDownload = async (path: string, fileName: string) => {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error("Unable to prepare the download.");
    }

    const blob = await response.blob();
    downloadBlob(blob, fileName);
  };

  const runDelete = async (scope: "transactions" | "balances") => {
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

  const isFree = planTier === "free";
  const selectedPlanLabel = selectedPlan === "free" ? "Free" : getBillingPlanLabel(selectedPlan);
  const selectedPlanPrice = selectedPlan === "free" ? "PHP 0" : selectedPlan === "annual" ? "PHP 1,299 / year" : "PHP 149 / month";

  return (
    <section className="settings-hub">
      <aside className="settings-hub__menu glass">
        <div className="settings-hub__menu-head">
          <p className="eyebrow">Settings</p>
          <h3>Control center</h3>
          <p>Pick a section. Clover keeps the rest tucked away.</p>
        </div>

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
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <div className="settings-hub__panel glass">
        {activeSection === "profile" ? (
          <section className="settings-section settings-section--profile" role="tabpanel">
            <div className="settings-section__intro">
              <div>
                <p className="eyebrow">Profile</p>
                <h4>{[firstName, lastName].filter(Boolean).join(" ") || "Your account"}</h4>
                <p>
                  Manage picture, names, email, password, social sign-ins, connected accounts, and account deletion with
                  Clerk’s built-in profile experience.
                </p>
              </div>
              <div className="settings-profile-summary">
                <span className="settings-profile-summary__label">Email</span>
                <strong>{email}</strong>
                <span className="settings-profile-summary__label">Workspace</span>
                <strong>{workspaceName}</strong>
              </div>
            </div>

            <div className="settings-clerk-frame">
              <UserProfile routing="virtual" />
            </div>
          </section>
        ) : null}

        {activeSection === "display" ? (
          <section className="settings-section" role="tabpanel">
            <div className="settings-section__intro">
              <div>
                <p className="eyebrow">Display</p>
                <h4>Look and feel</h4>
                <p>Choose the color mode Clover should use on this device.</p>
              </div>
              <div className="settings-profile-summary">
                <span className="settings-profile-summary__label">Current mode</span>
                <strong>{themeMode === "system" ? "Match system" : themeMode === "light" ? "Light" : "Dark"}</strong>
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
                    <strong>{option.label}</strong>
                    <span>{option.helper}</span>
                  </label>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeSection === "data" ? (
          <section className="settings-section" role="tabpanel">
            <div className="settings-section__intro">
              <div>
                <p className="eyebrow">Data</p>
                <h4>Export and cleanup</h4>
                <p>Download your data or prune older history without touching the rest of the workspace.</p>
              </div>
              <div className="settings-profile-summary">
                <span className="settings-profile-summary__label">Workspace</span>
                <strong>{workspaceName}</strong>
                <span className="settings-profile-summary__label">Cutoff date</span>
                <strong>{historyCutoff}</strong>
              </div>
            </div>

            <div className="settings-data-grid">
              <article className="settings-action-card">
                <div>
                  <h5>Download transactions</h5>
                  <p>Export the selected workspace’s transactions as CSV.</p>
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
                  <p>Remove transactions before a chosen date from this workspace.</p>
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
                        if (!window.confirm("Delete transaction history before the selected date?")) {
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
                  <h5>Delete account balance history</h5>
                  <p>Remove statement checkpoint history before the chosen date.</p>
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
                        if (!window.confirm("Delete balance history before the selected date?")) {
                          return;
                        }
                        const deleted = await runDelete("balances");
                        setStatusMessage(`Deleted ${deleted} balance record${deleted === 1 ? "" : "s"}.`);
                      })
                    }
                  >
                    Delete balances
                  </button>
                </div>
              </article>
            </div>
          </section>
        ) : null}

        {activeSection === "plan" ? (
          <section className="settings-section" role="tabpanel">
            <div className="settings-section__intro">
              <div>
                <p className="eyebrow">Plan</p>
                <h4>Billing and access</h4>
                <p>See what you are on now, and switch cadence when you are ready.</p>
              </div>
              <div className="settings-profile-summary">
                <span className="settings-profile-summary__label">Current plan</span>
                <strong>{currentPlanLabel}</strong>
                {subscriptionStatusLabel ? (
                  <>
                    <span className="settings-profile-summary__label">Status</span>
                    <strong>{subscriptionStatusLabel}</strong>
                  </>
                ) : null}
              </div>
            </div>

            <div className="settings-plan-grid" role="radiogroup" aria-label="Billing plan">
              {[
                {
                  value: "free" as const,
                  title: "Free",
                  price: "PHP 0",
                  helper: "Great for beta testing and basic review flows.",
                },
                {
                  value: "annual" as const,
                  title: "Annual",
                  price: "PHP 1,299 / year",
                  helper: "Best value. Selected by default when you open Plan.",
                },
                {
                  value: "monthly" as const,
                  title: "Monthly",
                  price: "PHP 149 / month",
                  helper: "Flexible if you want a shorter commitment.",
                },
              ].map((option) => {
                const isSelected = selectedPlan === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`settings-plan-card${isSelected ? " is-selected" : ""}`}
                    onClick={() => setSelectedPlan(option.value)}
                  >
                    <span className="settings-plan-card__title-row">
                      <strong>{option.title}</strong>
                      {planTier === "free" && option.value === "annual" ? <span className="settings-pill">Default</span> : null}
                    </span>
                    <span className="settings-plan-card__price">{option.price}</span>
                    <span className="settings-plan-card__helper">{option.helper}</span>
                  </button>
                );
              })}
            </div>

            <div className="settings-plan-panel">
              {planTier === "free" ? (
                <>
                  <div className="settings-plan-panel__copy">
                    <h5>{selectedPlanLabel}</h5>
                    <p>
                      {selectedPlan === "free"
                        ? "You are currently on the Free plan."
                        : `Checkout for the ${selectedPlanLabel} plan will appear below.`}
                    </p>
                  </div>

                  {selectedPlan === "free" ? (
                    <p className="settings-helper">Free stays available during the beta and includes the core Clover workflow.</p>
                  ) : selectedPlan === "annual" ? (
                    paypalClientId && paypalAnnualPlanId ? (
                      <div className="settings-plan-panel__checkout">
                        <p className="settings-helper">{selectedPlanPrice}</p>
                        <PayPalSubscribeButton
                          clientId={paypalClientId}
                          planId={paypalAnnualPlanId}
                          customId={workspaceId}
                          className="settings-plan-panel__paypal"
                        />
                      </div>
                    ) : (
                      <p className="settings-helper">Annual checkout is not configured yet.</p>
                    )
                  ) : paypalClientId && paypalMonthlyPlanId ? (
                    <div className="settings-plan-panel__checkout">
                      <p className="settings-helper">{selectedPlanPrice}</p>
                      <PayPalSubscribeButton
                        clientId={paypalClientId}
                        planId={paypalMonthlyPlanId}
                        customId={workspaceId}
                        className="settings-plan-panel__paypal"
                      />
                    </div>
                  ) : (
                    <p className="settings-helper">Monthly checkout is not configured yet.</p>
                  )}
                </>
              ) : (
                <BillingActions
                  planTier="pro"
                  clientId={paypalClientId}
                  monthlyPlanId={paypalMonthlyPlanId}
                  annualPlanId={paypalAnnualPlanId}
                  customId={workspaceId}
                  returnPath="/settings"
                  subscription={billingSubscription}
                  className="settings-plan-panel__billing"
                />
              )}
            </div>
          </section>
        ) : null}

        {statusMessage ? <p className="settings-status">{statusMessage}</p> : null}
      </div>
    </section>
  );
}

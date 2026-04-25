"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
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

const sectionCopy: Record<
  SettingsSectionKey,
  {
    title: string;
    icon: ReactNode;
  }
> = {
  profile: {
    title: "Profile",
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
  { value: "light", label: "Light", helper: "Bright, high-contrast workspace view." },
  { value: "dark", label: "Dark", helper: "Muted contrast for low-light sessions." },
  { value: "system", label: "Match system", helper: "Follows the device preference automatically." },
];

const planCards = [
  {
    value: "free" as const,
    title: "Free",
    price: "PHP 0",
    badge: "Current",
    helper: "Start here during beta and keep the core Clover workflow open.",
    description: "Best for getting a small workspace organized without commitment.",
    features: [
      "Manual transaction tracking",
      "Receipt scanning",
      "5 accounts in addition to Cash",
      "10 monthly uploads total",
      "1,000 transaction rows",
      "Basic reports",
    ],
  },
  {
    value: "annual" as const,
    title: "Annual",
    price: "PHP 1,299 / year",
    badge: "Default",
    helper: "Best value. Selected automatically for new users when Plan opens.",
    description: "Upgrade for the yearly price and keep the same Pro feature set.",
    features: [
      "Everything in Free",
      "Unlimited accounts",
      "Unlimited monthly uploads",
      "Unlimited transaction rows",
      "Advanced reports",
      "Future Pro features",
    ],
  },
  {
    value: "monthly" as const,
    title: "Monthly",
    price: "PHP 149 / month",
    helper: "Flexible Pro access for people who prefer month-to-month billing.",
    description: "Upgrade for shorter commitment while keeping the same Pro feature set.",
    features: [
      "Everything in Free",
      "Unlimited accounts",
      "Unlimited monthly uploads",
      "Unlimited transaction rows",
      "Advanced reports",
      "Future Pro features",
    ],
  },
] as const;

const usageLimits = {
  free: {
    accounts: 5,
    uploads: 10,
    transactions: 1000,
  },
  pro: {
    accounts: null,
    uploads: null,
    transactions: null,
  },
} as const;

function getResolvedTheme(mode: ThemeMode) {
  if (mode !== "system") {
    return mode;
  }

  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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

function formatLimitCount(used: number, limit: number | null, suffix?: string) {
  if (limit === null) {
    return `Unlimited${suffix ? ` ${suffix}` : ""}`;
  }

  return `${used.toLocaleString()} / ${limit.toLocaleString()}${suffix ? ` ${suffix}` : ""}`;
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
  firstName,
  lastName,
  email,
  planTier,
  billingSubscription,
  paypalClientId,
  paypalMonthlyPlanId,
  paypalAnnualPlanId,
  planUsage,
}: SettingsHubProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("profile");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [selectedPlan, setSelectedPlan] = useState<BillingInterval | "free">("annual");
  const [historyCutoff, setHistoryCutoff] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
  const currentPlanValue = planTier === "free" ? "free" : billingSubscription?.interval ?? "annual";
  const currentPlanCard = planCards.find((plan) => plan.value === currentPlanValue) ?? planCards[0];
  const selectedPlanCard = planCards.find((plan) => plan.value === selectedPlan) ?? planCards[1];
  const usageLimit = isFree ? usageLimits.free : usageLimits.pro;
  const planUsageCards = [
    {
      label: "Accounts",
      value: formatLimitCount(planUsage.accountCount, usageLimit.accounts, "accounts"),
      note: isFree
        ? `${planUsage.cashAccountCount > 0 ? "Cash is included." : "Cash is ready to be added."} Free covers 5 accounts in addition to Cash.`
        : "Pro keeps accounts unlimited.",
      used: planUsage.accountCount,
      limit: usageLimit.accounts,
    },
    {
      label: "Monthly uploads",
      value: formatLimitCount(planUsage.monthlyUploadCount, usageLimit.uploads, "uploads"),
      note: isFree ? "Free covers 10 uploads per month." : "Pro keeps uploads unlimited.",
      used: planUsage.monthlyUploadCount,
      limit: usageLimit.uploads,
    },
    {
      label: "Transaction rows",
      value: formatLimitCount(planUsage.transactionCount, usageLimit.transactions, "rows"),
      note: isFree ? "Free covers 1,000 rows total." : "Pro keeps transaction rows unlimited.",
      used: planUsage.transactionCount,
      limit: usageLimit.transactions,
    },
  ];

  return (
    <section className="settings-hub">
      <aside className="settings-hub__menu glass">
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
                <p>Pick a plan, see what is included, and keep an eye on the limits that matter most.</p>
              </div>
              <div className="settings-profile-summary">
                <span className="settings-profile-summary__label">Current plan</span>
                <strong>{currentPlanCard.title}</strong>
                {subscriptionStatusLabel ? (
                  <>
                    <span className="settings-profile-summary__label">Status</span>
                    <strong>{subscriptionStatusLabel}</strong>
                  </>
                ) : null}
                <span className="settings-profile-summary__label">Usage snapshot</span>
                <strong>
                  {formatLimitCount(planUsage.transactionCount, usageLimit.transactions, "transaction rows")}
                  <br />
                  {formatLimitCount(planUsage.accountCount, usageLimit.accounts, "accounts")}
                </strong>
              </div>
            </div>

            <div className="settings-plan-usage" aria-label="Current plan usage">
              {planUsageCards.map((usage) => {
                const percent = getUsagePercent(usage.used, usage.limit);

                return (
                  <article key={usage.label} className="settings-plan-usage__card">
                    <div className="settings-plan-usage__head">
                      <strong>{usage.label}</strong>
                      <span>{usage.value}</span>
                    </div>
                    <div className="settings-plan-usage__meter" aria-hidden="true">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                    <p>{usage.note}</p>
                  </article>
                );
              })}
            </div>

            <div className="settings-plan-grid" role="radiogroup" aria-label="Billing plan">
              {planCards.map((option) => {
                const isSelected = selectedPlan === option.value;
                const isCurrent = currentPlanValue === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`settings-plan-card${isSelected ? " is-selected" : ""}`}
                    onClick={() => setSelectedPlan(option.value)}
                  >
                    <div className="settings-plan-card__header">
                      <span className="settings-plan-card__title-row">
                        <strong>{option.title}</strong>
                        {isCurrent ? (
                          <span className="settings-pill">Current</span>
                        ) : option.value === "annual" ? (
                          <span className="settings-pill settings-pill--muted">Default</span>
                        ) : null}
                      </span>
                      <span className="settings-plan-card__price">{option.price}</span>
                      <span className="settings-plan-card__helper">{option.helper}</span>
                    </div>
                    <p className="settings-plan-card__summary">{option.description}</p>
                    <ul className="settings-plan-card__features">
                      {option.features.map((feature) => (
                        <li key={feature}>
                          <span className="settings-plan-card__check" aria-hidden="true">
                            ✓
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>

            <div className="settings-plan-panel">
              {planTier === "free" ? (
                <>
                  <div className="settings-plan-panel__copy">
                    <h5>{selectedPlanCard.title}</h5>
                    <p>
                      {selectedPlan === "free"
                        ? "You are currently on the Free plan."
                        : `Checkout for the ${selectedPlanCard.title} plan will appear below.`}
                    </p>
                  </div>

                  {selectedPlan === "free" ? (
                    <div className="settings-plan-panel__current">
                      <p className="settings-helper">Free stays available during the beta and includes the core Clover workflow.</p>
                      <div className="settings-plan-panel__note-grid">
                        <span>Accounts: 5 + Cash</span>
                        <span>Monthly uploads: 10</span>
                        <span>Transaction rows: 1,000</span>
                      </div>
                    </div>
                  ) : selectedPlan === "annual" ? (
                    paypalClientId && paypalAnnualPlanId ? (
                      <div className="settings-plan-panel__checkout">
                        <p className="settings-helper">Annual billing selected. Choose this plan to move into Pro with yearly billing.</p>
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
                      <p className="settings-helper">Monthly billing selected. Choose this plan to move into Pro with monthly billing.</p>
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

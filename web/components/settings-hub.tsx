"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { UserProfile } from "@clerk/nextjs";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import { BillingActions } from "@/components/billing-actions";
import { type BillingInterval } from "@/lib/billing-plans";

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
  paypalBuyerCountry?: string | null;
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

function FeatureIcon({ tier }: { tier: "free" | "pro" }) {
  if (tier === "pro") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="settings-plan-card__feature-icon"
      >
        <path d="m10 2.5 1.4 3.9 4 .2-3.1 2.5 1.1 3.8L10 10.7 6.6 12.9l1.1-3.8-3.1-2.5 4-.2L10 2.5Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="settings-plan-card__feature-icon"
    >
      <circle cx="10" cy="10" r="4" fill="currentColor" />
      <path d="M10 3.8V2.2M10 17.8v-1.6M3.8 10H2.2M17.8 10h-1.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
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
    icon: "free" as const,
    badge: "",
    helper: "Start here during beta and keep the core Clover workflow open.",
    description: "Best for getting a small workspace organized without commitment.",
    features: [
      "Manual transaction tracking",
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
    icon: "annual" as const,
    badge: "Pro",
    savings: "Save PHP 489 vs monthly",
    helper: "Best value for people who want to stay on Pro all year.",
    description: "Upgrade for the yearly price and get the same Pro access for less than monthly billing.",
    features: [
      "Everything in Free",
      "20 accounts",
      "100 monthly uploads",
      "Unlimited transaction rows",
      "Advanced reports",
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
      "20 accounts",
      "100 monthly uploads",
      "Unlimited transaction rows",
      "Advanced reports",
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
    accounts: 20,
    uploads: 100,
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
  firstName,
  lastName,
  email,
  planTier,
  billingSubscription,
  paypalClientId,
  paypalMonthlyPlanId,
  paypalAnnualPlanId,
  paypalBuyerCountry,
  planUsage,
}: SettingsHubProps) {
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("profile");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [historyCutoff, setHistoryCutoff] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
  const renewalDate = formatPlanDate(billingSubscription?.currentPeriodEnd ?? billingSubscription?.nextBillingTime ?? null);
  const usageLimit = isFree ? usageLimits.free : usageLimits.pro;
  const annualCheckoutReady = Boolean(paypalClientId && paypalAnnualPlanId);
  const monthlyCheckoutReady = Boolean(paypalClientId && paypalMonthlyPlanId);
  const planUsageCards = [
    {
      label: "Accounts",
      value: formatLimitCount(planUsage.accountCount, usageLimit.accounts, "accounts"),
      used: planUsage.accountCount,
      limit: usageLimit.accounts,
    },
    {
      label: "Monthly uploads",
      value: formatLimitCount(planUsage.monthlyUploadCount, usageLimit.uploads, "uploads"),
      used: planUsage.monthlyUploadCount,
      limit: usageLimit.uploads,
    },
    {
      label: "Transaction rows",
      value: formatLimitCount(planUsage.transactionCount, usageLimit.transactions, "rows"),
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
            <div className="settings-section__intro settings-section__intro--single">
              <div>
                <p className="eyebrow">Plan</p>
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
                <div className="settings-plan-usage__value">{currentPlanCard.title}</div>
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
                          <li key={feature}>
                            <FeatureIcon tier={option.value === "free" ? "free" : "pro"} />
                            <span>{feature}</span>
                          </li>
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

        {statusMessage ? <p className="settings-status">{statusMessage}</p> : null}
      </div>
    </section>
  );
}

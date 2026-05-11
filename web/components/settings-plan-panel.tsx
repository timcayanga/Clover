"use client";

import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import { BillingActions } from "@/components/billing-actions";
import { PlanFeatureItem } from "@/components/plan-feature-item";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import { type BillingInterval } from "@/lib/billing-plans";
import { getPlanDisplayLabel } from "@/lib/user-limits";

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

type SettingsPlanPanelProps = {
  workspaceId: string;
  planTier: "free" | "pro";
  paypalClientId?: string | null;
  paypalMonthlyPlanId?: string | null;
  paypalAnnualPlanId?: string | null;
  paypalBuyerCountry?: string | null;
  billingSubscription: BillingSubscriptionSummary | null;
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
  planLoading: boolean;
  planLoaded: boolean;
};

type PlanCard = {
  value: "free" | "annual" | "monthly";
  title: string;
  price: string;
  badge: string;
  savings?: string;
  features: string[];
};

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

  return (
    <svg {...common}>
      <path d="m12 3 1.7 4.8 4.9.2-3.8 3 1.3 4.7L12 13.3 7.9 15.7l1.3-4.7-3.8-3 4.9-.2L12 3Z" />
    </svg>
  );
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

const planCards: PlanCard[] = [
  {
    value: "free",
    title: "Free",
    price: "PHP 0",
    badge: "",
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
    value: "annual",
    title: "Annual",
    price: "PHP 1,299 / year",
    badge: "Pro",
    savings: "Save PHP 489 vs monthly",
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
    value: "monthly",
    title: "Monthly",
    price: "PHP 149 / month",
    badge: "",
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
];

export function SettingsPlanPanel({
  workspaceId,
  planTier,
  paypalClientId,
  paypalMonthlyPlanId,
  paypalAnnualPlanId,
  paypalBuyerCountry,
  billingSubscription,
  planLimits,
  planUsage,
  planLoading,
  planLoaded,
}: SettingsPlanPanelProps) {
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
    <section className="settings-section settings-section--swap" role="tabpanel">
      <div className="settings-section__intro settings-section__intro--single">
        <div>
          <h4>Plan</h4>
        </div>
      </div>

      {planLoading && !planLoaded ? (
        <article className="settings-action-card">
          <div>
            <h5>Loading plan details</h5>
            <p>Fetching your limits, usage, and billing status.</p>
          </div>
        </article>
      ) : null}

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
            <article key={option.value} className={`settings-plan-card settings-plan-card--${option.value}${isCurrent ? " is-current" : ""}`}>
              <div className="settings-plan-card__band">
                <div className="settings-plan-card__band-copy">
                  <div className="settings-plan-card__icon">
                    <PlanIcon name={option.value === "free" ? "free" : "annual"} />
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
                  {option.value === "annual" ? <p className="settings-plan-card__savings">{option.savings}</p> : null}

                  {option.value !== "free" && planTier === "pro" && renewalDate ? (
                    <p className="settings-plan-card__renewal">
                      Renews on <strong>{renewalDate}</strong>
                    </p>
                  ) : null}

                  {option.value === "free" ? (
                    <div className="settings-plan-card__current">{isCurrent ? <span className="settings-pill">Current plan</span> : null}</div>
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
                          onStart={() =>
                            capturePostHogClientEvent("upgrade_cta_clicked", {
                              cta_location: "settings_billing_annual",
                              plan_tier: planTier,
                              plan_interval: "annual",
                            })
                          }
                        />
                      ) : option.value === "monthly" && monthlyCheckoutReady ? (
                        <PayPalSubscribeButton
                          clientId={paypalClientId!}
                          planId={paypalMonthlyPlanId!}
                          customId={workspaceId}
                          buyerCountry={paypalBuyerCountry}
                          className="settings-plan-card__paypal"
                          fundingSource="card"
                          onStart={() =>
                            capturePostHogClientEvent("upgrade_cta_clicked", {
                              cta_location: "settings_billing_monthly",
                              plan_tier: planTier,
                              plan_interval: "monthly",
                            })
                          }
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
  );
}

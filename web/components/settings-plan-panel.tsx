"use client";

import { useState } from "react";
import { BillingActions } from "@/components/billing-actions";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import { PaddleCheckoutButton } from "@/components/paddle-checkout-button";
import { PlanFeatureItem } from "@/components/plan-feature-item";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import { BILLING_PLANS, type BillingInterval } from "@/lib/billing-plans";

type BillingSubscriptionSummary = {
  provider: "paypal" | "paddle";
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
  billingCustomerId?: string | null;
  planTier: "free" | "pro";
  preferredBillingInterval?: BillingInterval;
  paypalClientId?: string | null;
  paypalMonthlyPlanId?: string | null;
  paypalAnnualPlanId?: string | null;
  paypalBuyerCountry?: string | null;
  paddleEnvironment: "sandbox" | "live";
  paddleClientToken: string | null;
  paddleMonthlyPriceId: string | null;
  paddleAnnualPriceId: string | null;
  paddleCheckoutReady: boolean;
  customerEmail: string;
  billingSubscription: BillingSubscriptionSummary | null;
  planLimits: {
    accountLimit: number | null;
    monthlyUploadLimit: number | null;
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

const freeFeatures = [
  "Manual transaction tracking",
  "No profile, account, upload, or transaction row caps for now",
  "Receipt scanning",
  "Basic investment tracking",
  "Basic Adviser guidance",
  "Basic goal tracking",
];

const proFeatures = [
  "Everything in Free",
  "Full investment portfolio tools",
  "Advanced Adviser guidance",
  "Enhanced goal tracking and recommendations",
];

function PlanIcon({ pro = false }: { pro?: boolean }) {
  return pro ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 1.7 4.8 4.9.2-3.8 3 1.3 4.7L12 13.3 7.9 15.7l1.3-4.7-3.8-3 4.9-.2L12 3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 5.5 8l6.5 4.5L18.5 8 12 3.5ZM5.5 16l6.5 4.5 6.5-4.5" />
    </svg>
  );
}

function getUsagePercent(used: number, limit: number | null) {
  return limit === null ? 100 : Math.max(0, Math.min((used / limit) * 100, 100));
}

export function SettingsPlanPanel({
  billingCustomerId,
  planTier,
  preferredBillingInterval,
  paypalClientId,
  paypalMonthlyPlanId,
  paypalAnnualPlanId,
  paypalBuyerCountry,
  paddleEnvironment,
  paddleClientToken,
  paddleMonthlyPriceId,
  paddleAnnualPriceId,
  paddleCheckoutReady,
  customerEmail,
  billingSubscription,
  planLimits,
  planUsage,
}: SettingsPlanPanelProps) {
  const initialInterval = preferredBillingInterval ?? billingSubscription?.interval ?? "annual";
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(initialInterval);
  const billingPlan = BILLING_PLANS.find((plan) => plan.interval === billingInterval);
  const checkoutPlanId = billingInterval === "monthly" ? paypalMonthlyPlanId : paypalAnnualPlanId;
  const paddlePriceId = billingInterval === "monthly" ? paddleMonthlyPriceId : paddleAnnualPriceId;
  const paypalCheckoutReady = Boolean(paypalClientId && checkoutPlanId && billingCustomerId);
  const paddleReady = Boolean(
    paddleCheckoutReady &&
      paddleClientToken &&
      paddlePriceId &&
      billingCustomerId
  );
  const isAwaitingApproval = billingSubscription?.status === "approval_pending";
  const currentInterval = billingSubscription?.interval ?? null;
  const currentProvider = billingSubscription?.provider ?? null;

  const usageRows = [
    {
      label: "Accounts",
      used: `${planUsage.accountCount.toLocaleString()} used`,
      limit: planLimits.accountLimit === null ? "Unlimited" : `${planLimits.accountLimit.toLocaleString()} limit`,
      percent: getUsagePercent(planUsage.accountCount, planLimits.accountLimit),
    },
    {
      label: "Monthly uploads",
      used: `${planUsage.monthlyUploadCount.toLocaleString()} used`,
      limit:
        planLimits.monthlyUploadLimit === null
          ? "Unlimited"
          : `${planLimits.monthlyUploadLimit.toLocaleString()} limit`,
      percent: getUsagePercent(planUsage.monthlyUploadCount, planLimits.monthlyUploadLimit),
    },
    {
      label: "Transaction rows",
      used: `${planUsage.transactionCount.toLocaleString()} used`,
      limit:
        planLimits.transactionLimit === null
          ? "Unlimited"
          : `${planLimits.transactionLimit.toLocaleString()} limit`,
      percent: getUsagePercent(planUsage.transactionCount, planLimits.transactionLimit),
    },
  ];

  return (
    <section className="settings-section settings-section--plan settings-section--swap" role="tabpanel">
      <div className="settings-section__intro settings-section__intro--single">
        <h4>Plan</h4>
      </div>

      <div className="settings-plan-usage" aria-label="Current plan and usage">
        <div className="settings-plan-usage__row settings-plan-usage__row--current">
          <strong>Current plan</strong>
          <span>{planTier === "pro" ? "Pro" : "Free"}</span>
        </div>
        {usageRows.map((usage) => (
          <div key={usage.label} className="settings-plan-usage__row">
            <strong>{usage.label}</strong>
            <div className="settings-plan-usage__visual">
              <span className="settings-plan-usage__legend">
                <span>{usage.used}</span>
                <span>{usage.limit}</span>
              </span>
              <span className="settings-plan-usage__meter" aria-hidden="true">
                <span style={{ width: `${usage.percent}%` }} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className={`settings-plan-grid settings-plan-grid--current-${planTier}`} aria-label="Available plans">
        <article className={`settings-plan-card settings-plan-card--free${planTier === "free" ? " is-current" : ""}`}>
          <div className="settings-plan-card__band">
            <span className="settings-plan-card__icon"><PlanIcon /></span>
            <span className="settings-plan-card__band-text">
              <strong className="settings-plan-card__band-title">Free</strong>
              <span className="settings-plan-card__band-price">PHP 0</span>
            </span>
          </div>
          <div className="settings-plan-card__body">
            <ul className="settings-plan-card__features">
              {freeFeatures.map((feature) => (
                <PlanFeatureItem key={feature} label={feature} className="settings-plan-card__feature-row" />
              ))}
            </ul>
            {planTier === "free" ? <span className="settings-pill">Current plan</span> : null}
          </div>
        </article>

        <article className={`settings-plan-card settings-plan-card--pro${planTier === "pro" ? " is-current" : ""}`}>
          <div className="settings-plan-card__band">
            <span className="settings-plan-card__icon"><PlanIcon pro /></span>
            <span className="settings-plan-card__band-text">
              <strong className="settings-plan-card__band-title">Pro</strong>
              <span className="settings-plan-card__band-price">
                {billingPlan?.priceLabel ?? (billingInterval === "monthly" ? "PHP 149" : "PHP 1,299")}
                {billingInterval === "monthly" ? " / month" : " / year"}
              </span>
            </span>
          </div>
          <div className="settings-plan-card__body">
            <div className="settings-plan-interval" role="group" aria-label="Pro billing interval">
              <button
                type="button"
                className={billingInterval === "monthly" ? "is-selected" : ""}
                onClick={() => setBillingInterval("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={billingInterval === "annual" ? "is-selected" : ""}
                onClick={() => setBillingInterval("annual")}
              >
                Annually
              </button>
            </div>
            <ul className="settings-plan-card__features">
              {proFeatures.map((feature) => (
                <PlanFeatureItem key={feature} label={feature} className="settings-plan-card__feature-row" />
              ))}
            </ul>
            <div className="settings-plan-card__cta">
              {planTier === "free" ? (
                isAwaitingApproval ? (
                  <p className="settings-helper">Waiting for PayPal confirmation.</p>
                ) : paddleReady ? (
                  <PaddleCheckoutButton
                    clientToken={paddleClientToken!}
                    environment={paddleEnvironment}
                    priceId={paddlePriceId!}
                    customerId={billingCustomerId ?? ""}
                    customerEmail={customerEmail}
                    interval={billingInterval}
                    className="settings-plan-card__paddle"
                    onStart={() =>
                      capturePostHogClientEvent("upgrade_cta_clicked", {
                        cta_location: `settings_billing_${billingInterval}`,
                        billing_provider: "paddle",
                        plan_tier: planTier,
                        plan_interval: billingInterval,
                      })
                    }
                  />
                ) : paypalCheckoutReady ? (
                  <PayPalSubscribeButton
                    clientId={paypalClientId!}
                    planId={checkoutPlanId!}
                    customId={billingCustomerId ?? ""}
                    buyerCountry={paypalBuyerCountry}
                    className="settings-plan-card__paypal"
                    fundingSource="card"
                    onStart={() =>
                      capturePostHogClientEvent("upgrade_cta_clicked", {
                        cta_location: `settings_billing_${billingInterval}`,
                        plan_tier: planTier,
                        plan_interval: billingInterval,
                      })
                    }
                  />
                ) : (
                  <p className="settings-helper">
                    {paddleClientToken
                      ? "Paddle checkout will unlock after its webhook is connected."
                      : "Subscription checkout is not configured yet."}
                  </p>
                )
              ) : currentProvider === "paddle" ? (
                billingInterval === currentInterval ? (
                  <span className="settings-pill">Current plan</span>
                ) : (
                  <p className="settings-helper">Paddle plan changes will be available from subscription management.</p>
                )
              ) : billingInterval === currentInterval ? (
                <span className="settings-pill">Current plan</span>
              ) : (
                <BillingActions
                  planTier="pro"
                  clientId={paypalClientId}
                  monthlyPlanId={paypalMonthlyPlanId}
                  annualPlanId={paypalAnnualPlanId}
                  buyerCountry={paypalBuyerCountry}
                  customId={billingCustomerId ?? ""}
                  returnPath="/settings"
                  subscription={billingSubscription}
                  compactInterval={billingInterval}
                />
              )}
            </div>
          </div>
        </article>
      </div>

      {planTier === "pro" && currentProvider !== "paddle" ? (
        <BillingActions
          planTier="pro"
          clientId={paypalClientId}
          monthlyPlanId={paypalMonthlyPlanId}
          annualPlanId={paypalAnnualPlanId}
          buyerCountry={paypalBuyerCountry}
          customId={billingCustomerId ?? ""}
          returnPath="/settings"
          subscription={billingSubscription}
          className="settings-plan-unsubscribe"
          minimalManagement
        />
      ) : null}
    </section>
  );
}

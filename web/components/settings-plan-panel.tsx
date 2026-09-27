"use client";
import type { RetentionSnapshot } from "../../shared/plan-retention";
import cardSurface from "./plan-card-surface.module.css";
import { PlanDialog } from "./settings-plan-dialog";

import dynamic from "next/dynamic";
const TermsDocument = dynamic(() => import("./legal-terms-document").then(m => m.TermsOfServiceDocument));
const PrivacyDocument = dynamic(() => import("./legal-privacy-document").then(m => m.PrivacyPolicyDocument));

import { plannedPremiumPrices } from "@/lib/public-plan-comparison";
import { PLAN_CATALOG, planName } from "../../shared/plan-catalog";
import { useEffect, useState } from "react";
import { BillingActions } from "@/components/billing-actions";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import { PaddleCheckoutButton } from "@/components/paddle-checkout-button";
import { PlanFeatureItem } from "@/components/plan-feature-item";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";
import { type BillingInterval } from "@/lib/billing-plans";
import type { BillingOffers } from "@/lib/billing-offer-rules";
import type { CloverTokenUsageSnapshot } from "@/lib/clover-token-usage";

type BillingSubscriptionSummary = {
  provider: "paypal" | "paddle";
  status: string;
  interval: BillingInterval | null;
  pendingPlanId: string | null;
  pendingInterval: BillingInterval | null;
  providerSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  nextBillingTime: string | null;
  planTier: "free" | "pro" | "premium";
};

type PaddlePortalAction = "manage" | "payment_method" | "cancel" | "plan_change";

type SettingsPlanPanelProps = {
  workspaceId: string;
  billingCustomerId?: string | null;
  planTier: "free" | "pro" | "premium";
  profileCount: number;
  profileLimit: number | null;
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
  cloverTokenUsage: CloverTokenUsageSnapshot | null;
  planLoading: boolean;
  planLoaded: boolean;
};

function getUsagePercent(used: number, limit: number | null) {
  return limit === null ? 100 : Math.max(0, Math.min((used / limit) * 100, 100));
}

export function SettingsPlanPanel({
  billingCustomerId,
  planTier,
  profileCount,
  profileLimit,
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
  cloverTokenUsage,
  planLoading,
  planLoaded,
}: SettingsPlanPanelProps) {
  const initialInterval = preferredBillingInterval ?? billingSubscription?.interval ?? "annual";
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(initialInterval);
  const [paddlePortalAction, setPaddlePortalAction] = useState<PaddlePortalAction | null>(null);
  const [paddlePortalMessage, setPaddlePortalMessage] = useState<string | null>(null);
  const [offers, setOffers] = useState<BillingOffers | null>(null);
  const [offersLoading, setOffersLoading] = useState(true);
  const [retention, setRetention] = useState<RetentionSnapshot | null>(null);
  const [campaignActive, setCampaignActive] = useState(false);
  const [dialog, setDialog] = useState<"usage" | "terms-of-service" | "privacy-policy" | "free" | "pro" | "premium" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/billing/retention", { signal: controller.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(value => { if (!controller.signal.aborted) setRetention(value); }).catch(() => {});
    void fetch("/api/referrals", { signal: controller.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(value => { if (!controller.signal.aborted) setCampaignActive(Boolean(value?.campaigns?.length)); }).catch(() => {});
    return () => controller.abort();
  }, [billingCustomerId]);
  useEffect(() => {
    const controller = new AbortController();
    setOffersLoading(true);
    setOffers(null);
    fetch("/api/billing/offers", { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("Offers unavailable"); return response.json() as Promise<BillingOffers>; })
      .then(value => { if (!controller.signal.aborted) setOffers(value); })
      .catch(() => { /* Keep checkout unavailable until the offer can be verified. */ })
      .finally(() => { if (!controller.signal.aborted) setOffersLoading(false); });
    return () => controller.abort();
  }, [billingCustomerId]);
  const checkoutPlanId = offers?.paypal[billingInterval];
  const paddlePriceId = offers?.paddle[billingInterval];
  const paypalCheckoutReady = Boolean(paypalClientId && checkoutPlanId && billingCustomerId);
  const paddleReady = Boolean(
    paddleCheckoutReady &&
      paddleClientToken &&
      paddlePriceId &&
      billingCustomerId
  );
  const premiumPriceId = offers?.pro?.paddle[billingInterval];
  const premiumReady = Boolean(paddleCheckoutReady && paddleClientToken && premiumPriceId && billingCustomerId);
  const isAwaitingApproval = billingSubscription?.status === "approval_pending";
  const currentInterval = billingSubscription?.interval ?? null;
  const currentProvider = billingSubscription?.provider ?? null;
  const billingDetailsReady = planLoaded && !planLoading;
  const hasPaddleSubscription =
    currentProvider === "paddle" &&
    Boolean(billingSubscription?.providerSubscriptionId) &&
    !["cancelled", "expired"].includes(billingSubscription?.status ?? "");

  useEffect(() => {
    if (billingDetailsReady && currentInterval) {
      setBillingInterval(currentInterval);
    }
  }, [billingDetailsReady, currentInterval]);

  const openPaddlePortal = async (action: PaddlePortalAction) => {
    setPaddlePortalAction(action);
    setPaddlePortalMessage(null);

    try {
      const response = await fetch("/api/billing/paddle/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action:
            action === "payment_method" || action === "cancel"
              ? action
              : "overview",
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Unable to open subscription management.");
      }

      capturePostHogClientEvent("billing_started", {
        billing_action: action,
        billing_provider: "paddle",
        plan_interval: currentInterval,
        target_plan_interval:
          action === "plan_change" ? billingInterval : undefined,
      });
      window.location.assign(payload.url);
    } catch (error) {
      setPaddlePortalMessage(
        error instanceof Error
          ? error.message
          : "Unable to open subscription management."
      );
      setPaddlePortalAction(null);
    }
  };

  const usageRows = [
    {
      label: "Profiles",
      used: `${profileCount.toLocaleString()}`,
      limit: profileLimit === null ? "Unlimited" : `${profileLimit.toLocaleString()}`,
      percent: getUsagePercent(profileCount, profileLimit),
      donut: false,
    },
    {
      label: "Accounts",
      used: `${planUsage.accountCount.toLocaleString()}`,
      limit: planLimits.accountLimit === null ? "Unlimited" : `${planLimits.accountLimit.toLocaleString()}`,
      percent: getUsagePercent(planUsage.accountCount, planLimits.accountLimit),
      donut: false,
    },
    {
      label: "Clover tokens this month",
      used: `${(cloverTokenUsage?.monthly.used ?? 0).toLocaleString()}`,
      limit: cloverTokenUsage?.monthly.limit === null
        ? "Unlimited"
        : `${(cloverTokenUsage?.monthly.limit ?? PLAN_CATALOG[planTier].monthlyTokens).toLocaleString()}`,
      percent: cloverTokenUsage?.monthly.percent ?? 0,
      donut: true,
    },
    {
      label: "Clover tokens, rolling 24h",
      used: `${(cloverTokenUsage?.rolling24h.used ?? 0).toLocaleString()}`,
      limit: cloverTokenUsage?.rolling24h.limit === null
        ? "Unlimited"
        : `${(cloverTokenUsage?.rolling24h.limit ?? PLAN_CATALOG[planTier].dailyTokens).toLocaleString()}`,
      percent: cloverTokenUsage?.rolling24h.percent ?? 0,
      donut: true,
    },
    ...(["budgets", "goals", "circles", "linkedBanks"] as const).map(key => {
      const meter = key === "linkedBanks" ? retention?.linkedBanks : retention ? { used: retention.usage[key], limit: retention.limits[key] === undefined ? PLAN_CATALOG[retention.planTier][key] : retention.limits[key]! } : null;
      return { label: key === "linkedBanks" ? "Linked Banks" : key[0].toUpperCase() + key.slice(1), used: meter ? meter.used.toLocaleString() : "—", limit: meter ? meter.limit === null ? "Unlimited" : meter.limit.toLocaleString() : "—", percent: meter ? getUsagePercent(meter.used, meter.limit) : 0, donut: false };
    }),
  ];

  return (
    <section className="settings-section settings-section--plan settings-section--swap" role="tabpanel">
      <div className="settings-section__intro settings-section__intro--single">
        <h4>Clover {planName(planTier)}</h4>
      </div>

      <div className="settings-plan-usage-heading"><h5>Plan usage</h5><button type="button" className="settings-plan-info" aria-label="About plan usage" onClick={() => setDialog("usage")}>i</button></div>
      <div className="settings-plan-usage" aria-label="Plan usage">
        {usageRows.map((usage) => (
          <article key={usage.label} className="settings-plan-usage__card">
            <div className="settings-plan-usage__head">
              <strong>{usage.label}</strong>
            </div>
            <span className="settings-plan-usage__legend">
              <span>{usage.used}</span>
              <span>/ {usage.limit}</span>
            </span>
            <span className="settings-plan-usage__meter" aria-hidden="true">
              <span style={{ width: `${usage.percent}%` }} />
            </span>
          </article>
        ))}
      </div>
      <div className="settings-plan-interval" role="group" aria-label="Billing interval">
        <button type="button" className={billingInterval === "monthly" ? "is-selected" : ""} onClick={() => setBillingInterval("monthly")}>Monthly</button>
        <button type="button" className={billingInterval === "annual" ? "is-selected" : ""} onClick={() => setBillingInterval("annual")}>Annually</button>
      </div>
      <div className={`settings-plan-grid settings-plan-carousel`} aria-label="Available plans">
        {(["premium", "pro", "free"] as const).map(tier => {
          const plan = PLAN_CATALOG[tier];
          const price = tier === "free" ? "₱0 forever" : tier === "premium" ? (offers ? plannedPremiumPrices(offers.market)[billingInterval] : undefined) : offers?.prices[billingInterval];
          const features = [
            ...(tier === "premium" ? ["Everything in Plus"] : tier === "pro" ? ["Everything in Free"] : ["Manual tracking and file imports"]),
            `${plan.profiles} profiles · ${plan.accounts} non-cash accounts`,
            `${plan.linkedBanks} linked bank accounts`,
            `${plan.budgets} budgets · ${plan.goals} goals · ${plan.circles} ${plan.circles === 1 ? "Circle" : "Circles"}`,
            `${plan.monthlyTokens.toLocaleString()} Clover tokens monthly`,
            `${plan.dailyTokens.toLocaleString()} tokens per rolling 24 hours`,
            ...(tier === "free" ? ["Basic Adviser and investment tracking"] : ["Full Adviser and investment tools"]),
          ];
          return <article key={tier} className={`${cardSurface.surface} ${cardSurface[tier]} settings-plan-card settings-plan-card--${tier === "premium" ? "premium" : tier === "pro" ? "pro" : "free"}${planTier === tier ? " is-current" : ""}`}>
            <div className="settings-plan-card__band"><span className="settings-plan-card__band-text">
              <strong className="settings-plan-card__band-title">{plan.name}</strong>
              <span className="settings-plan-card__band-price">{price ?? (offersLoading ? "Checking pricing…" : "Pricing unavailable")}{tier !== "free" && price ? (billingInterval === "monthly" ? " / month" : " / year") : ""}</span>
              {planTier === tier ? <span className="settings-pill">Current plan</span> : null}
            </span></div>
            <div className="settings-plan-card__body"><ul className="settings-plan-card__features">{features.map(feature => <PlanFeatureItem key={feature} label={feature} className="settings-plan-card__feature-row" />)}</ul>
              {planTier !== tier ? <button type="button" className="settings-plan-switch" onClick={() => setDialog(tier)}>Switch to {plan.name} →</button> : null}
            </div>
          </article>;
        })}
      </div>
      {campaignActive ? <section className="settings-plan-referral"><h5>Refer and Earn</h5><p>Invite friends and explore your available rewards.</p><a href="/referrals">View referral offer →</a></section> : null}
      <footer className="settings-plan-footer"><button type="button" onClick={() => setDialog("terms-of-service")}>Terms</button><button type="button" onClick={() => setDialog("privacy-policy")}>Privacy Policy</button></footer>
      <PlanDialog open={dialog !== null} title={dialog === "usage" ? "Plan usage" : dialog === "terms-of-service" ? "Terms" : dialog === "privacy-policy" ? "Privacy Policy" : `Switch to ${dialog ? planName(dialog) : ""}`} onClose={() => setDialog(null)}>
      {dialog === "usage" ? <p>Monthly Clover tokens reset on the first day of each month in Asia/Manila. Unused tokens do not roll over. The 24-hour allowance is a rolling window. Cash accounts do not count toward the account limit. Investments count by institution. Only active budgets and non-archived Circles you own count. Linked bank slots remain reserved after unlinking until the next monthly period. Changing plans preserves your existing records.</p> : dialog === "terms-of-service" || dialog === "privacy-policy" ? <div className="settings-plan-legal-view">{dialog === "privacy-policy" ? <PrivacyDocument /> : <TermsDocument />}</div> : <div className="settings-plan-management" aria-label="Subscription options">
        {hasPaddleSubscription ? <div className="settings-plan-management__actions">
          <button type="button" className="button button-primary" disabled={paddlePortalAction !== null} onClick={() => void openPaddlePortal("plan_change")}>Change plan</button>
          <button type="button" className="button button-secondary" disabled={paddlePortalAction !== null} onClick={() => void openPaddlePortal("payment_method")}>Change payment method</button>
          <button type="button" className="button button-secondary" disabled={paddlePortalAction !== null} onClick={() => void openPaddlePortal("cancel")}>Unsubscribe</button>
        </div> : currentProvider === "paypal" && billingDetailsReady ? <BillingActions planTier={planTier} clientId={paypalClientId} monthlyPlanId={paypalMonthlyPlanId} annualPlanId={paypalAnnualPlanId} buyerCountry={paypalBuyerCountry} customId={billingCustomerId ?? ""} returnPath="/settings/plan" subscription={billingSubscription} />
        : !billingDetailsReady ? <p role="status">Loading subscription options…</p>
        : isAwaitingApproval ? <p role="status">Waiting for payment confirmation.</p>
        : <div className="settings-plan-management__actions">
          {dialog === "pro" && planTier === "free" && (paddleReady ? <div><PaddleCheckoutButton clientToken={paddleClientToken!} environment={paddleEnvironment} priceId={paddlePriceId!} customerId={billingCustomerId ?? ""} customerEmail={customerEmail} interval={billingInterval} onStart={() => capturePostHogClientEvent("upgrade_cta_clicked", {cta_location:"settings_billing",billing_provider:"paddle",plan_tier:planTier,plan_interval:billingInterval})} /></div> : paypalCheckoutReady ? <PayPalSubscribeButton clientId={paypalClientId!} planId={checkoutPlanId!} customId={billingCustomerId ?? ""} buyerCountry={paypalBuyerCountry} fundingSource="card" /> : null)}
          {dialog === "premium" && planTier !== "premium" && premiumReady ? <div><PaddleCheckoutButton clientToken={paddleClientToken!} environment={paddleEnvironment} priceId={premiumPriceId!} planTier="premium" customerId={billingCustomerId ?? ""} customerEmail={customerEmail} interval={billingInterval} /></div> : null}
        </div>}
        {!hasPaddleSubscription && currentProvider !== "paypal" && billingDetailsReady && !isAwaitingApproval && ((dialog === "premium" && !premiumReady) || (dialog === "pro" && !paddleReady && !paypalCheckoutReady) || dialog === "free") ? <p>Manage this plan with your original billing provider. Available checkout options will appear here when pricing is verified.</p> : null}
        {paddlePortalMessage ? <p role="status">{paddlePortalMessage}</p> : null}
      </div>}
      </PlanDialog>
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";
import { capturePostHogClientEvent } from "@/components/posthog-analytics";

type BillingInterval = "monthly" | "annual";

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

type BillingActionsProps = {
  planTier: "free" | "pro";
  clientId?: string | null;
  monthlyPlanId?: string | null;
  annualPlanId?: string | null;
  buyerCountry?: string | null;
  customId?: string | null;
  returnPath: string;
  subscription?: BillingSubscriptionSummary | null;
  className?: string;
  compactInterval?: BillingInterval;
  hideIntervalActions?: boolean;
  minimalManagement?: boolean;
};

type ActionState = {
  key: string;
  message: string | null;
};

const planMeta: Record<BillingInterval, { label: string; price: string; helper: string }> = {
  monthly: {
    label: "Monthly",
    price: "PHP 99",
    helper: "Upgrade anytime. Great if you want flexibility while you test Clover Pro.",
  },
  annual: {
    label: "Annual",
    price: "PHP 999",
    helper: "Best value for people who already know they want the yearly plan.",
  },
};

function getBillingPlanLabel(interval: BillingInterval) {
  return interval === "monthly" ? "Monthly" : "Annual";
}

function formatBillingDate(value: string | null) {
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

async function postBillingAction<T extends Record<string, unknown>>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Unable to update billing.");
  }

  return payload;
}

export function BillingActions({
  planTier,
  clientId,
  monthlyPlanId,
  annualPlanId,
  buyerCountry,
  customId,
  returnPath,
  subscription,
  className,
  compactInterval,
  hideIntervalActions = false,
  minimalManagement = false,
}: BillingActionsProps) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ key: "", message: null });

  const currentInterval = subscription?.interval ?? null;
  const pendingInterval = subscription?.pendingInterval ?? null;
  const renewalDate = formatBillingDate(subscription?.currentPeriodEnd ?? subscription?.nextBillingTime ?? null);
  const hasMonthly = Boolean(clientId && monthlyPlanId && customId);
  const hasAnnual = Boolean(clientId && annualPlanId && customId);
  const isAwaitingApproval = subscription?.status === "approval_pending";

  const runAction = async (key: string, action: () => Promise<void>) => {
    setState({ key, message: null });
    try {
      await action();
    } catch (error) {
      setState({
        key: "",
        message: error instanceof Error ? error.message : "Unable to update billing.",
      });
    } finally {
      setState((current) => (current.key === key ? { ...current, key: "" } : current));
    }
  };

  const handleRevision = (interval: BillingInterval) =>
    runAction(`revise-${interval}`, async () => {
      const result = await postBillingAction<{ approvalUrl?: string; subscriptionId?: string }>(
        "/api/billing/paypal/revise",
        {
          interval,
          returnPath,
        }
      );

      if (result.approvalUrl) {
        window.location.assign(result.approvalUrl);
        return;
      }

      router.refresh();
    });

  const handleCancel = () =>
    runAction("cancel", async () => {
      await postBillingAction("/api/billing/paypal/cancel", {
        returnPath,
      });
      router.refresh();
    });

  const isFree = planTier === "free";

  if (!isFree && compactInterval) {
    if (!currentInterval || compactInterval === currentInterval) {
      return null;
    }

    const compactPlanId = compactInterval === "monthly" ? monthlyPlanId : annualPlanId;
    return compactPlanId ? (
      <button
        className="button button-secondary button-small settings-billing-action-button"
        type="button"
        onClick={() => void handleRevision(compactInterval)}
        disabled={state.key !== ""}
      >
        {state.key === `revise-${compactInterval}` ? "Opening PayPal..." : `Switch to ${getBillingPlanLabel(compactInterval)}`}
      </button>
    ) : null;
  }

  if (!isFree && minimalManagement) {
    return (
      <div className={className}>
        <button
          className="button button-danger button-small settings-billing-action-button"
          type="button"
          onClick={() => void handleCancel()}
          disabled={state.key !== ""}
        >
          {state.key === "cancel" ? "Unsubscribing..." : "Unsubscribe"}
        </button>
        {state.message ? <p className="billing-helper">{state.message}</p> : null}
      </div>
    );
  }

  return (
    <div className={className}>
      {isFree ? (
        isAwaitingApproval ? (
          <div className="billing-actions">
            <div className="billing-actions__intro">
              <p className="billing-actions__eyebrow">Payment approval in progress</p>
              <p className="billing-actions__text">
                Clover is waiting for PayPal to confirm your subscription. We will unlock Pro automatically after confirmation.
              </p>
            </div>
          </div>
        ) : (
        <div className="billing-actions">
          <div className="billing-actions__intro">
            <p className="billing-actions__eyebrow">Upgrade options</p>
            <p className="billing-actions__text">
              Choose the Clover Pro cadence that fits you best. Both options unlock the same Pro feature set.
            </p>
          </div>

          <div className="billing-actions__grid">
            <section className="billing-action-card">
              <div className="billing-action-card__copy">
                <p className="billing-action-card__label">{planMeta.monthly.label}</p>
                <strong>{planMeta.monthly.price}</strong>
                <p>{planMeta.monthly.helper}</p>
              </div>
              {hasMonthly ? (
                <PayPalSubscribeButton
                  clientId={clientId as string}
                  planId={monthlyPlanId as string}
                  customId={customId as string}
                  buyerCountry={buyerCountry}
                  className="billing-action-card__button"
                  onStart={() =>
                    capturePostHogClientEvent("upgrade_cta_clicked", {
                      cta_location: "billing_actions_monthly",
                      plan_tier: planTier,
                      plan_interval: "monthly",
                    })
                  }
                />
              ) : (
                <p className="billing-helper">Monthly checkout is not configured yet.</p>
              )}
            </section>

            <section className="billing-action-card billing-action-card--featured">
              <div className="billing-action-card__copy">
                <p className="billing-action-card__label">{planMeta.annual.label}</p>
                <strong>{planMeta.annual.price}</strong>
                <p>{planMeta.annual.helper}</p>
              </div>
              {hasAnnual ? (
                <PayPalSubscribeButton
                  clientId={clientId as string}
                  planId={annualPlanId as string}
                  customId={customId as string}
                  buyerCountry={buyerCountry}
                  className="billing-action-card__button"
                  onStart={() =>
                    capturePostHogClientEvent("upgrade_cta_clicked", {
                      cta_location: "billing_actions_annual",
                      plan_tier: planTier,
                      plan_interval: "annual",
                    })
                  }
                />
              ) : (
                <p className="billing-helper">Annual checkout is not configured yet.</p>
              )}
            </section>
          </div>
        </div>
        )
      ) : (
        <div className="billing-actions billing-actions--pro">
          <div className="billing-actions__intro">
            <p className="billing-actions__eyebrow">Manage subscription</p>
            <p className="billing-actions__text">
              You are on {subscription?.interval ? `the ${getBillingPlanLabel(subscription.interval)} Clover Pro plan` : "the Clover Pro plan"}.
              {pendingInterval ? ` A change to ${getBillingPlanLabel(pendingInterval)} is waiting for approval.` : ""}
            </p>
            {renewalDate ? (
              <p className="billing-helper">
                Renews on <strong>{renewalDate}</strong>. Limits refresh then.
              </p>
            ) : null}
          </div>

          <div className="billing-actions__stack">
            <div className="billing-actions__row">
              {!hideIntervalActions && currentInterval && currentInterval !== "monthly" && monthlyPlanId ? (
                <button
                  className="button button-secondary button-small settings-billing-action-button"
                  type="button"
                  onClick={() => void handleRevision("monthly")}
                  disabled={state.key !== "" }
                >
                  {state.key === "revise-monthly" ? "Opening PayPal..." : "Switch to Monthly"}
                </button>
              ) : null}
              {!hideIntervalActions && currentInterval && currentInterval !== "annual" && annualPlanId ? (
                <button
                  className="button button-secondary button-small settings-billing-action-button"
                  type="button"
                  onClick={() => void handleRevision("annual")}
                  disabled={state.key !== ""}
                >
                  {state.key === "revise-annual" ? "Opening PayPal..." : "Switch to Annual"}
                </button>
              ) : null}
              <button
                className="button button-danger button-small settings-billing-action-button"
                type="button"
                onClick={() => void handleCancel()}
                disabled={state.key !== ""}
              >
                {state.key === "cancel" ? "Unsubscribing..." : "Unsubscribe"}
              </button>
            </div>

          </div>
        </div>
      )}

      {state.message ? <p className="billing-helper">{state.message}</p> : null}
    </div>
  );
}

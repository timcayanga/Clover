"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";

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
};

type ActionState = {
  key: string;
  message: string | null;
};

const planMeta: Record<BillingInterval, { label: string; price: string; helper: string }> = {
  monthly: {
    label: "Monthly",
    price: "PHP 149",
    helper: "Upgrade anytime. Great if you want flexibility while you test Clover Pro.",
  },
  annual: {
    label: "Annual",
    price: "PHP 1,299",
    helper: "Best value for people who already know they want the yearly plan.",
  },
};

function getBillingPlanLabel(interval: BillingInterval) {
  return interval === "monthly" ? "Monthly" : "Annual";
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
}: BillingActionsProps) {
  const router = useRouter();
  const [state, setState] = useState<ActionState>({ key: "", message: null });

  const currentInterval = subscription?.interval ?? null;
  const pendingInterval = subscription?.pendingInterval ?? null;
  const hasMonthly = Boolean(clientId && monthlyPlanId && customId);
  const hasAnnual = Boolean(clientId && annualPlanId && customId);

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

  return (
    <div className={className}>
      {isFree ? (
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
                />
              ) : (
                <p className="billing-helper">Annual checkout is not configured yet.</p>
              )}
            </section>
          </div>
        </div>
      ) : (
        <div className="billing-actions billing-actions--pro">
          <div className="billing-actions__intro">
            <p className="billing-actions__eyebrow">Manage subscription</p>
            <p className="billing-actions__text">
              You are on {subscription?.interval ? `the ${getBillingPlanLabel(subscription.interval)} Clover Pro plan` : "the Clover Pro plan"}.
              {pendingInterval ? ` A change to ${getBillingPlanLabel(pendingInterval)} is waiting for approval.` : ""}
            </p>
          </div>

          <div className="billing-actions__stack">
            <div className="billing-actions__row">
              {currentInterval !== "monthly" && monthlyPlanId ? (
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => void handleRevision("monthly")}
                  disabled={state.key !== "" }
                >
                  {state.key === "revise-monthly" ? "Opening PayPal..." : "Switch to Monthly"}
                </button>
              ) : null}
              {currentInterval !== "annual" && annualPlanId ? (
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => void handleRevision("annual")}
                  disabled={state.key !== ""}
                >
                  {state.key === "revise-annual" ? "Opening PayPal..." : "Switch to Annual"}
                </button>
              ) : null}
              <button
                className="button button-danger button-small"
                type="button"
                onClick={() => void handleCancel()}
                disabled={state.key !== ""}
              >
                {state.key === "cancel" ? "Unsubscribing..." : "Unsubscribe"}
              </button>
            </div>

            <p className="billing-helper">
              Changes made through PayPal take effect after the buyer re-consents. Unsubscribing stops the subscription in PayPal and Clover will
              move the account back to Free.
            </p>
          </div>
        </div>
      )}

      {state.message ? <p className="billing-helper">{state.message}</p> : null}
    </div>
  );
}

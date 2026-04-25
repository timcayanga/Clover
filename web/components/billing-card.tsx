import Link from "next/link";
import { BillingActions } from "@/components/billing-actions";
import { BILLING_COPY, type BillingInterval } from "@/lib/billing-plans";

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

type BillingCardProps = {
  planTier: "free" | "pro";
  billingSubscription?: BillingSubscriptionSummary | null;
  paypalClientId?: string | null;
  paypalMonthlyPlanId?: string | null;
  paypalAnnualPlanId?: string | null;
  userId: string;
  clerkUserId: string;
  email: string;
};

function formatBillingDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function statusLabel(status: string) {
  switch (status) {
    case "approval_pending":
      return "Awaiting approval";
    case "active":
      return "Active";
    case "cancelled":
      return "Cancelled";
    case "suspended":
      return "Suspended";
    case "expired":
      return "Expired";
    default:
      return "Unknown";
  }
}

export function BillingCard({
  planTier,
  billingSubscription,
  paypalClientId,
  paypalMonthlyPlanId,
  paypalAnnualPlanId,
  userId,
  clerkUserId,
  email,
}: BillingCardProps) {
  const meta = BILLING_COPY[planTier];
  const customId = userId || clerkUserId || email;
  const formattedNextBilling = formatBillingDate(billingSubscription?.nextBillingTime ?? billingSubscription?.currentPeriodEnd ?? null);
  const isGuestBillingContext = clerkUserId === "staging-guest";

  return (
    <article id="billing" className="settings-billing-card glass">
      <div className="settings-card__head">
        <div>
          <p className="eyebrow">Billing</p>
          <h4>Plan and subscription</h4>
        </div>
        <p className="settings-card__summary">Use this area to manage Clover Pro access through PayPal.</p>
      </div>

      <div className="billing-card__body">
        <div className="billing-card__plan">
          <p className="billing-card__eyebrow">{meta.label}</p>
          <strong>{meta.headline}</strong>
          <p>{meta.detail}</p>
          {billingSubscription ? (
            <p className="billing-card__status">
              Subscription {statusLabel(billingSubscription.status)}
              {billingSubscription.interval ? ` · ${billingSubscription.interval === "monthly" ? "Monthly" : "Annual"}` : ""}
              {billingSubscription.pendingInterval ? ` · Pending ${billingSubscription.pendingInterval === "monthly" ? "Monthly" : "Annual"}` : ""}
              {formattedNextBilling ? ` · Next billing ${formattedNextBilling}` : ""}
            </p>
          ) : null}
        </div>

        {isGuestBillingContext ? (
          <div className="billing-card__cta">
            <p className="billing-card__cta-copy">
              Billing is available when you are signed in to a real Clover account. Sign in to manage a subscription, choose monthly or annual
              billing, or cancel a plan.
            </p>
            <Link className="button button-secondary button-small" href="/sign-in">
              Sign in to manage billing
            </Link>
          </div>
        ) : (
          <BillingActions
            planTier={planTier}
            clientId={paypalClientId}
            monthlyPlanId={paypalMonthlyPlanId}
            annualPlanId={paypalAnnualPlanId}
            customId={customId}
            returnPath="/settings"
            subscription={billingSubscription ?? null}
            className="billing-card__cta"
          />
        )}
      </div>
    </article>
  );
}

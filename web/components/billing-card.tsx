import Link from "next/link";
import { PayPalSubscribeButton } from "@/components/paypal-subscribe-button";

type BillingCardProps = {
  planTier: "free" | "pro";
  paypalClientId?: string | null;
  paypalPlanId?: string | null;
  paypalBuyerCountry?: string | null;
  userId: string;
  clerkUserId: string;
  email: string;
};

const tierMeta = {
  free: {
    label: "Free",
    headline: "Start free and upgrade when you need more room.",
    detail: "Free is the default Clover plan. It keeps the core workflow open while we validate the paid path.",
  },
  pro: {
    label: "Pro",
    headline: "Your Pro access is active.",
    detail: "PayPal manages the subscription, and Clover updates access automatically when billing events arrive.",
  },
} as const;

export function BillingCard({
  planTier,
  paypalClientId,
  paypalPlanId,
  paypalBuyerCountry,
  userId,
  clerkUserId,
  email,
}: BillingCardProps) {
  const meta = tierMeta[planTier];
  const canCheckout = Boolean(paypalClientId && paypalPlanId);
  const customId = userId || clerkUserId || email;

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
        </div>

        {planTier === "free" ? (
          <div className="billing-card__cta">
            <p className="billing-card__cta-copy">
              Upgrade from Settings, or tap the prompt when you hit a Free limit. The subscription stays tied to your Clover account via a stable
              custom ID.
            </p>
            {canCheckout ? (
              <PayPalSubscribeButton
                clientId={paypalClientId as string}
                planId={paypalPlanId as string}
                customId={customId}
                buyerCountry={paypalBuyerCountry}
                className="billing-card__paypal"
              />
            ) : (
              <p className="billing-helper">Add the PayPal client id and Pro plan id to enable checkout here.</p>
            )}
          </div>
        ) : (
          <div className="billing-card__cta">
            <p className="billing-card__cta-copy">You can keep using Clover Pro. If PayPal changes your subscription state, Clover will follow it.</p>
            <Link className="button button-secondary button-small" href="/settings#billing">
              Review billing
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

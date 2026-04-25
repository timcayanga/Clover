import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { buildBillingReturnUrl, normalizeBillingReturnPath } from "@/lib/billing-urls";
import { getBillingPlanByInterval, type BillingInterval } from "@/lib/billing-plans";
import {
  getUserBillingSubscription,
  revisePayPalSubscription,
  syncBillingSubscriptionFromPayPal,
} from "@/lib/paypal-billing";

export const dynamic = "force-dynamic";

function parseInterval(value: unknown): BillingInterval | null {
  return value === "monthly" || value === "annual" ? value : null;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = session;
    const user = await getOrCreateCurrentUser(userId);
    const payload = (await request.json().catch(() => ({}))) as { interval?: unknown; returnPath?: unknown };
    const targetInterval = parseInterval(payload.interval);
    if (!targetInterval) {
      return NextResponse.json({ error: "A valid billing interval is required." }, { status: 400 });
    }

    const subscription = await getUserBillingSubscription(user.id);
    if (!subscription?.providerSubscriptionId) {
      return NextResponse.json({ error: "No active PayPal subscription was found." }, { status: 404 });
    }

    const plan = getBillingPlanByInterval(targetInterval);
    if (!plan?.planId) {
      return NextResponse.json({ error: `PayPal plan id is missing for ${targetInterval}.` }, { status: 400 });
    }

    const returnPath = normalizeBillingReturnPath(payload.returnPath, "/settings");
    const returnUrl = buildBillingReturnUrl(request, returnPath, {
      billing: "success",
      interval: targetInterval,
    });
    const cancelUrl = buildBillingReturnUrl(request, returnPath, {
      billing: "cancelled",
    });

    const result = await revisePayPalSubscription({
      subscriptionId: subscription.providerSubscriptionId,
      planId: plan.planId,
      returnUrl,
      cancelUrl,
    });

    await syncBillingSubscriptionFromPayPal(subscription.providerSubscriptionId, user, {
      eventType: "MANUAL.REVISE",
      pendingPlanId: plan.planId,
      pendingInterval: targetInterval,
    });

    return NextResponse.json({
      ok: true,
      approvalUrl: result.approvalUrl,
      subscriptionId: result.subscriptionId,
      interval: targetInterval,
      planId: plan.planId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to revise PayPal subscription",
      },
      { status: 400 }
    );
  }
}

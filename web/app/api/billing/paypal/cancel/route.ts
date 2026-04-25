import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { cancelPayPalSubscription, syncBillingSubscriptionFromPayPal } from "@/lib/paypal-billing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = session;
    const user = await getOrCreateCurrentUser(userId);
    const subscription = await prisma.billingSubscription.findUnique({
      where: { userId: user.id },
    });

    if (!subscription?.providerSubscriptionId) {
      return NextResponse.json({ error: "No active PayPal subscription was found." }, { status: 404 });
    }

    await syncBillingSubscriptionFromPayPal(subscription.providerSubscriptionId, user, {
      eventType: "MANUAL.CANCEL_PREVIEW",
    });

    await cancelPayPalSubscription({
      subscriptionId: subscription.providerSubscriptionId,
      reason: "Clover subscription cancelled by the subscriber.",
    });

    await prisma.billingSubscription.update({
      where: { userId: user.id },
      data: {
        status: "cancelled",
        planTier: "free",
        pendingPlanId: null,
        pendingInterval: null,
        cancelledAt: new Date(),
        lastEventType: "MANUAL.CANCEL",
        lastSyncedAt: new Date(),
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: user.planTierLocked ? {} : { planTier: "free" },
    });

    return NextResponse.json({
      ok: true,
      subscriptionId: subscription.providerSubscriptionId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to cancel PayPal subscription",
      },
      { status: 400 }
    );
  }
}

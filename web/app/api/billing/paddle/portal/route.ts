import { BillingProvider } from "@prisma/client";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createPaddleCustomerPortalSession } from "@/lib/paddle-billing";
import { prisma } from "@/lib/prisma";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
import { summarizeErrorForLog } from "@/lib/security-logging";
import { getOrCreateCurrentUser } from "@/lib/user-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const portalActions = ["overview", "payment_method", "cancel"] as const;
type PortalAction = (typeof portalActions)[number];

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      action?: unknown;
    };
    const action: PortalAction =
      typeof payload.action === "string" &&
      portalActions.includes(payload.action as PortalAction)
        ? (payload.action as PortalAction)
        : "overview";

    const user = await getOrCreateCurrentUser(session.userId);
    const subscription = await prisma.billingSubscription.findUnique({
      where: { userId: user.id },
    });

    if (
      subscription?.provider !== BillingProvider.paddle ||
      !subscription.providerSubscriptionId
    ) {
      return NextResponse.json(
        { error: "No Paddle subscription was found." },
        { status: 404 }
      );
    }

    const links = await createPaddleCustomerPortalSession({
      subscriptionId: subscription.providerSubscriptionId,
      rawPayload: subscription.rawPayload,
    });
    const url =
      action === "payment_method"
        ? links.updatePaymentMethod
        : action === "cancel"
          ? links.cancel
          : links.overview;

    if (!url) {
      return NextResponse.json(
        { error: "This Paddle subscription action is not available." },
        { status: 409 }
      );
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error(
      "[paddle-portal] unable to create portal session",
      summarizeErrorForLog(error)
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to open Paddle subscription management.",
      },
      { status: 400 }
    );
  }
}

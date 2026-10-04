import { z } from "zod";
import { getStoreDeletionPlan } from "@/lib/store-account-deletion";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteClerkIdentity } from "@/lib/clerk-identity-lifecycle";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId, isGuest } = await requireAuth();

    if (isGuest) {
      return NextResponse.json({ error: "Guest accounts cannot be deleted." }, { status: 403 });
    }

    const body = await request.text();
    const input = z.object({ appleSubscriptionAcknowledged: z.boolean().optional() }).strict().parse(body ? JSON.parse(body) : {});
    await deleteClerkIdentity(userId, false, input.appleSubscriptionAcknowledged === true);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to delete account.",
      },
      { status: 400 }
    );
  }
}

export async function GET() {
  try {
    const { userId, isGuest } = await requireAuth();
    if (isGuest) return NextResponse.json({ error: "Sign in to manage your account." }, { status: 403 });
    const plan = await getStoreDeletionPlan(userId);
    return NextResponse.json({ appleCancellationRequired: plan.appleCancellationRequired, googleCancellationRequired: plan.googleTransactionIds.length > 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not check subscription billing. Please retry before deleting your account." }, { status: 503 });
  }
}

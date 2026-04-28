import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin";
import { getAdminUserDetail } from "@/lib/admin-users";
import { reconcileBillingPlanTier } from "@/lib/paypal-billing";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    await requireAdminAuth();
    const { userId } = await context.params;
    await reconcileBillingPlanTier(userId);
    const detail = await getAdminUserDetail(userId);
    return NextResponse.json({ detail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reconcile user.";

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (message === "User not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

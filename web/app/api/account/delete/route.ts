import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { deleteClerkIdentity } from "@/lib/clerk-identity-lifecycle";
import { capturePostHogServerEvent } from "@/lib/analytics-server";
import { assertTrustedRequestOrigin } from "@/lib/request-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertTrustedRequestOrigin(request);
    const { userId, isGuest } = await requireAuth();

    if (isGuest) {
      return NextResponse.json({ error: "Guest accounts cannot be deleted." }, { status: 403 });
    }

    await deleteClerkIdentity(userId);

    void capturePostHogServerEvent("account_deleted", userId, {
      account_scope: "full",
      delete_mode: "hard_delete",
    });

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

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { wipeLocalUserData } from "@/lib/account-management";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { userId, isGuest } = await requireAuth();

    if (isGuest) {
      return NextResponse.json({ error: "Guest accounts cannot be wiped." }, { status: 403 });
    }

    await wipeLocalUserData(userId);
    void capturePostHogServerEvent("account_wiped", userId, {
      wipe_scope: "all_app_data",
    });
    void capturePostHogServerEvent("account_reset", userId, {
      reset_scope: "all_app_data",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to wipe account data.",
      },
      { status: 400 }
    );
  }
}

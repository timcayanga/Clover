import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth";
import { deleteLocalUserAccount } from "@/lib/account-management";
import { capturePostHogServerEvent } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { userId, isGuest } = await requireAuth();

    if (isGuest) {
      return NextResponse.json({ error: "Guest accounts cannot be deleted." }, { status: 403 });
    }

    await deleteLocalUserAccount(userId);

    const client = await clerkClient();
    await client.users.deleteUser(userId);

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

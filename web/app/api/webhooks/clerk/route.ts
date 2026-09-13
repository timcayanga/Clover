import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import {
  deleteClerkIdentity,
  syncClerkIdentity,
} from "@/lib/clerk-identity-lifecycle";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET)
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 503 },
    );
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }
  try {
    if (event.type === "user.created" || event.type === "user.updated")
      await syncClerkIdentity(event.data.id);
    else if (event.type === "user.deleted" && event.data.id)
      await deleteClerkIdentity(event.data.id, true);
    return NextResponse.json({ received: true });
  } catch {
    console.error("Clerk identity webhook failed", {
      type: event.type,
      id: event.data.id,
    });
    return NextResponse.json(
      { error: "Identity synchronization failed; delivery must be retried." },
      { status: 503 },
    );
  }
}

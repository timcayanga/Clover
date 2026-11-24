import { NextResponse } from "next/server";
import { loadUnreadNotificationCount } from "@/lib/in-app-notifications.server";
import { resolveContext } from "../context";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await resolveContext();
  if (context instanceof NextResponse) return context;
  const count = context.workspaceId ? await loadUnreadNotificationCount(context.user, context.workspaceId) : 0;
  return NextResponse.json({ count, workspaceId: context.workspaceId }, { headers: { "Cache-Control": "private, no-store" } });
}

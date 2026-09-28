import { timingSafeEqual } from "node:crypto";
import { syncPendingAssignments } from "@/lib/team-agent-store";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (
    !secret ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await syncPendingAssignments());
  } catch {
    return Response.json({ error: "Assignment sync failed" }, { status: 503 });
  }
}

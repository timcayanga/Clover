import { sweepBankConnections } from "@/lib/finverse-lifecycle";
import { timingSafeEqual } from "node:crypto";
import { dispatchNotificationEmails } from "@/lib/notification-dispatch.server";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const bankConnections=await sweepBankConnections();
    return Response.json({ ...(await dispatchNotificationEmails()), bankConnections });
  } catch {
    return Response.json(
      {
        error:
          "Notification dispatch failed. Check the Admin delivery ledger and server configuration.",
      },
      { status: 500 },
    );
  }
}

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
    const { sweepSwitchCampaign, dispatchSwitchEmails } = await import("@/lib/switch-campaign-notifications.server");
    const campaign = await sweepSwitchCampaign().catch(() => ({error:"Campaign lifecycle failed; retry required."}));
    const campaignEmails = await dispatchSwitchEmails().catch(() => ({error:"Campaign email delivery failed; inspect ledger."}));
    const { dispatchContactNotifications } = await import("@/lib/contact-notification.server");
    const supportNotifications = await dispatchContactNotifications().catch(() => ({ error: "Support email recovery could not finish; inspect delivery status." }));
    const bankConnections=await sweepBankConnections();
    return Response.json({ ...(await dispatchNotificationEmails()), bankConnections, campaign, campaignEmails, supportNotifications });
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

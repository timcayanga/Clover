import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildInAppNotificationCandidates } from "@/lib/in-app-notifications.server";
import { loadNotificationTemplates } from "@/lib/notification-templates.server";
import {
  eligibleNotificationEmail,
  notificationValues,
  renderNotificationText,
} from "@/lib/notification-template-rules";
import { sendNotificationMail } from "@/lib/notification-mail.server";
import { getAdminRealUserWhere } from "@/lib/admin-data-scope";

// Daily transactional digest, never a broadcast. SMTP has no idempotency key:
// claim each event before sending; ambiguous outcomes are not retried automatically.
export async function dispatchNotificationEmails() {
  if (process.env.VERCEL_ENV !== "production")
    return { skipped: "Production delivery only." };
  if (!process.env.ZOHO_SMTP_PASSWORD)
    throw new Error("SMTP is not configured.");
  const environment = "production";
  const templates = await loadNotificationTemplates(environment);
  const emailTemplates = templates.filter(
    (t) =>
      t.enabled &&
      t.email &&
      !t.archived &&
      t.triggerKey !== "circle-invitation",
  );
  if (!emailTemplates.length)
    return { skipped: "No daily email templates enabled." };
  await prisma.notificationDispatchCursor.upsert({
    where: { environment },
    create: { environment },
    update: {},
  });
  const lease = new Date(Date.now() + 360_000);
  const locked = await prisma.notificationDispatchCursor.updateMany({
    where: {
      environment,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { leaseUntil: lease },
  });
  if (!locked.count) return { skipped: "Another notification run is active." };
  try {
    const started = Date.now();
    let cursor =
      (
        await prisma.notificationDispatchCursor.findUnique({
          where: { environment },
        })
      )?.userId ?? "";
    let scanned = 0,
      accepted = 0;
    while (Date.now() - started < 200_000 && scanned < 100) {
      const user = await prisma.user.findFirst({
        where: {
          ...getAdminRealUserWhere(),
          verified: true,
          id: { gt: cursor },
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          email: true,
          clerkUserId: true,
          planTier: true,
          accountLimit: true,
          monthlyUploadLimit: true,
          transactionLimit: true,
          workspaces: { select: { id: true } },
        },
      });
      if (!user) {
        await prisma.notificationDispatchCursor.upsert({
          where: { environment },
          create: { environment, userId: "" },
          update: { userId: "" },
        });
        break;
      }
      const parts: string[] = [];
      const claims: string[] = [];
      try {
        const seen = new Set<string>();
        for (const workspace of user.workspaces) {
          const items = await buildInAppNotificationCandidates(
            user,
            workspace.id,
            new Date(),
            { raw: true },
          );
          // Re-read controls for each Profile so pause/delete takes effect during a run.
          const currentTemplates = await loadNotificationTemplates(environment);
          for (const item of items)
            for (const template of currentTemplates) {
              const event = `${template.key}:${item.id}`;
              if (
                claims.length >= 10 ||
                seen.has(event) ||
                !eligibleNotificationEmail(template, item)
              )
                continue;
              seen.add(event);
              try {
                const claim = await prisma.notificationEmailDelivery.create({
                  data: {
                    environment,
                    userId: user.id,
                    templateKey: template.key,
                    eventKey: item.id,
                  },
                });
                claims.push(claim.id);
              } catch (error) {
                if (
                  error instanceof Prisma.PrismaClientKnownRequestError &&
                  error.code === "P2002"
                )
                  continue;
                throw error;
              }
              const values = notificationValues(item);
              parts.push(
                `${renderNotificationText(template.emailSubject, values)}\n\n${renderNotificationText(template.emailBody, values)}`,
              );
            }
        }
        if (parts.length) {
          await sendNotificationMail(
            user.email,
            "Your Clover notifications",
            `${parts.join("\n\n———\n\n")}\n\nView your notifications: https://clover.ph/notifications`,
          );
          await prisma.notificationEmailDelivery.updateMany({
            where: { id: { in: claims } },
            data: { status: "accepted" },
          });
          accepted += claims.length;
        }
      } catch {
        if (claims.length)
          await prisma.notificationEmailDelivery.updateMany({
            where: { id: { in: claims } },
            data: { status: "uncertain" },
          });
        // Stop without advancing the user cursor. Claim keys prevent duplicate retry.
        throw new Error(
          "Notification dispatch stopped; inspect the delivery ledger.",
        );
      }
      cursor = user.id;
      await prisma.notificationDispatchCursor.upsert({
        where: { environment },
        create: { environment, userId: cursor },
        update: { userId: cursor },
      });
      scanned++;
    }
    return {
      scanned,
      accepted,
      cursor,
      capped: scanned >= 100 || Date.now() - started >= 200_000,
    };
  } finally {
    await prisma.notificationDispatchCursor.updateMany({
      where: { environment, leaseUntil: lease },
      data: { leaseUntil: null },
    });
  }
}

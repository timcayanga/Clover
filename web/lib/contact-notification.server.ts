import { prisma } from "./prisma";
import { getAdminDataEnvironment } from "./admin";
import { sendContactInquiryEmail } from "./contact-email";
import { mailFailure } from "./mail-delivery";
import { z } from "zod";
import { readContactInquiryAttachment } from "./contact-inquiries";

/** Persisted inquiry is the outbox. Claims never resend an ambiguous SMTP attempt. */
export async function deliverContactNotification(id: string, retry = false) {
  const environment = getAdminDataEnvironment();
  const row = await prisma.contactInquiry.findFirstOrThrow({
    where: { id, environment },
  });
  const recipient =
    environment === "production"
      ? "hello@clover.ph"
      : z.string().email().safeParse(process.env.SUPPORT_MAIL_TEST_RECIPIENT)
          .data;
  if (!recipient) return row; // Preview must opt into a controlled test inbox.
  const allowed = retry ? ["pending", "failed", "untracked"] : ["pending"];
  if (!allowed.includes(row.notificationStatus)) return row;
  const messageId =
    row.notificationMessageId ?? `<inquiry-${row.id}@clover.ph>`;
  const claim = await prisma.contactInquiry.updateMany({
    where: {
      id,
      environment,
      notificationStatus: row.notificationStatus,
      notificationAttempts: row.notificationAttempts,
    },
    data: {
      notificationStatus: "sending",
      notificationErrorCode: null,
      notificationMessageId: messageId,
      notificationAttemptedAt: new Date(),
      notificationAttempts: { increment: 1 },
    },
  });
  if (!claim.count)
    return prisma.contactInquiry.findUniqueOrThrow({ where: { id } });
  try {
    await sendContactInquiryEmail({
      name: row.name,
      email: row.email,
      message: row.message,
      sourcePage: row.sourcePage,
      attachment: readContactInquiryAttachment(row.attachment),
      kind: row.message.startsWith("[Bug report]") ? "bug_report" : "contact",
      messageId,
      recipient,
    });
  } catch (error) {
    const failure = mailFailure(error);
    console.error("Support inquiry notification failed", {
      inquiryId: id,
      code: failure.code,
      outcome: failure.outcome,
      messageId,
    });
    return prisma.contactInquiry.update({
      where: { id },
      data: {
        notificationStatus:
          failure.outcome === "not_sent" ? "failed" : "unknown",
        notificationErrorCode: failure.code,
      },
    });
  }
  // A DB failure here leaves 'sending', never a retryable failure: SMTP accepted it.
  return prisma.contactInquiry.update({
    where: { id },
    data: { notificationStatus: "sent", notificationErrorCode: null },
  });
}

export async function dispatchContactNotifications() {
  const environment = getAdminDataEnvironment();
  // Expired claims are ambiguous, not proof of a failed send.
  await prisma.contactInquiry.updateMany({
    where: {
      environment,
      notificationStatus: "sending",
      notificationAttemptedAt: { lt: new Date(Date.now() - 5 * 60_000) },
    },
    data: {
      notificationStatus: "unknown",
      notificationErrorCode: "delivery_unknown",
    },
  });
  const rows = await prisma.contactInquiry.findMany({
    where: {
      environment,
      OR: [
        { notificationStatus: "pending" },
        {
          notificationStatus: "failed",
          notificationAttempts: { lt: 5 },
          notificationAttemptedAt: { lt: new Date(Date.now() - 60 * 60_000) },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true },
  });
  let processed = 0;
  for (const row of rows) {
    const result = await deliverContactNotification(row.id, true);
    processed++;
    if (
      ["authentication_failed", "configuration_missing"].includes(
        result.notificationErrorCode ?? "",
      )
    )
      break;
  }
  return { processed };
}

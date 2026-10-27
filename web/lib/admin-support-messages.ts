import { z } from "zod";
import { prisma } from "./prisma";
import { getAdminDataEnvironment } from "./admin";
import { sendNotificationMail } from "./notification-mail.server";
import { getEnv } from "./env";
import { mailFailure } from "./mail-delivery";
export const supportMessageSchema = z
  .object({
    kind: z.enum(["reply", "note"]),
    subject: z.string().trim().max(200).optional(),
    body: z.string().trim().min(1).max(5000),
    idempotencyKey: z.string().uuid(),
    retry: z.boolean().optional(),
    confirmedNotSent: z.boolean().optional(),
    acknowledgeDuplicateRisk: z.boolean().optional(),
    retryVersion: z.string().datetime().optional(),
    resolutionNote: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .refine((input) => !input.acknowledgeDuplicateRisk ||
    (input.kind === "reply" && input.retry && !!input.retryVersion && !input.confirmedNotSent),
  "An uncertain retry requires the saved attempt version and explicit retry intent.")
  .refine((input) => !input.confirmedNotSent || (input.resolutionNote?.length ?? 0) >= 10,
    "Verified non-delivery requires verification notes of at least 10 characters.");
export async function addSupportMessage(
  inquiryId: string,
  actorId: string,
  raw: unknown,
) {
  const input = supportMessageSchema.parse(raw);
  if (input.kind === "reply" && !input.subject)
    throw new Error("A reply subject is required.");
  const inquiry = await prisma.contactInquiry.findFirstOrThrow({
    where: { id: inquiryId, environment: getAdminDataEnvironment() },
  });
  let message = await prisma.adminSupportMessage.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  const assertSame = (existing: NonNullable<typeof message>) => {
    if (
      existing.inquiryId !== inquiryId ||
      existing.actorId !== actorId ||
      existing.body !== input.body ||
      existing.subject !== (input.subject ?? null) ||
      existing.kind !== input.kind
    )
      throw new Error("This request key belongs to a different message.");
  };
  if (message) assertSame(message);
  else {
    if (input.retry)
      throw new Error("The saved message to retry was not found.");
    if (input.kind === "reply" && !getEnv().ZOHO_SMTP_PASSWORD)
      throw new Error(
        "Email delivery is not configured. Your draft has not been sent.",
      );
    // A new UUID must not bypass an unresolved copy of the same reply after reload.
    if (input.kind === "reply") {
      const unresolved = await prisma.adminSupportMessage.findFirst({
        where: {
          inquiryId,
          kind: "reply",
          body: input.body,
          subject: input.subject,
          status: { in: ["unknown", "sending"] },
        },
      });
      if (unresolved) return unresolved;
    }
    try {
      message = await prisma.adminSupportMessage.create({
        data: {
          kind: input.kind,
          subject: input.subject,
          body: input.body,
          idempotencyKey: input.idempotencyKey,
          inquiryId,
          actorId,
          status: input.kind === "note" ? "internal" : "pending",
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      message = await prisma.adminSupportMessage.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
      });
      assertSame(message);
    }
  }
  if (input.kind === "note" || message.status === "sent") return message;
  const ambiguousRetry = !!(input.retry && input.acknowledgeDuplicateRisk &&
    input.retryVersion === message.updatedAt.toISOString() &&
    (message.status === "unknown" || (message.status === "sending" &&
      message.updatedAt.getTime() < Date.now() - 5 * 60_000)));
  if (input.acknowledgeDuplicateRisk && !ambiguousRetry) return message;
  if (
    input.retry &&
    input.confirmedNotSent &&
    input.resolutionNote &&
    (message.status === "unknown" ||
      (message.status === "sending" &&
        message.updatedAt.getTime() < Date.now() - 5 * 60_000))
  ) {
    const original = message;
    message = await prisma.$transaction(async (tx) => {
      const resolved = await tx.adminSupportMessage.updateMany({
        where: {
          id: original.id,
          status: original.status,
          updatedAt: original.updatedAt,
        },
        data: {
          status: "failed",
          deliveryErrorCode: "operator_confirmed_not_sent",
        },
      });
      if (resolved.count)
        await tx.adminSupportMessage.create({
          data: {
            inquiryId,
            actorId,
            kind: "note",
            status: "internal",
            body: `Verified not sent: ${original.id}. ${input.resolutionNote}`,
            idempotencyKey: `delivery-resolution:${original.id}:${original.updatedAt.toISOString()}`,
          },
        });
      return tx.adminSupportMessage.findUniqueOrThrow({
        where: { id: original.id },
      });
    });
  }
  if (
    message.status !== "pending" &&
    !(input.retry && message.status === "failed") && !ambiguousRetry
  )
    return message;
  const messageId =
    message.mailMessageId ?? `<support-${message.id}@clover.ph>`;
  const claimMessage = message;
  const claim = await prisma.$transaction(async (tx) => {
    const claimed = await tx.adminSupportMessage.updateMany({
      where: {
        id: claimMessage.id,
        status: claimMessage.status,
        updatedAt: claimMessage.updatedAt,
      },
      data: {
        status: "sending",
        deliveryErrorCode: null,
        mailMessageId: messageId,
      },
    });
    if (claimed.count && ambiguousRetry)
      await tx.adminSupportMessage.create({data: {
        inquiryId, actorId, kind: "note", status: "internal",
        body: `Retry authorized despite possible duplicate delivery: ${claimMessage.id}. Prior outcome ${claimMessage.status} at ${claimMessage.updatedAt.toISOString()} was not verified. ${input.resolutionNote ?? "Operator explicitly accepted the duplicate-delivery risk."}`,
        idempotencyKey: `delivery-risk-retry:${claimMessage.id}:${claimMessage.updatedAt.toISOString()}`,
      }});
    return claimed;
  });
  if (!claim.count)
    return prisma.adminSupportMessage.findUniqueOrThrow({
      where: { id: message.id },
    });
  try {
    await sendNotificationMail(
      inquiry.email,
      input.subject!,
      input.body,
      undefined,
      { messageId },
    );
  } catch (error) {
    const failure = mailFailure(error);
    console.error("Support reply email failed", {
      messageId,
      code: failure.code,
      outcome: failure.outcome,
    });
    return prisma.adminSupportMessage.update({
      where: { id: message.id },
      data: {
        status: failure.outcome === "not_sent" ? "failed" : "unknown",
        deliveryErrorCode: failure.code,
      },
    });
  }
  // A failed acknowledgement write must retain 'sending', never become retryable.
  return prisma.$transaction(async (tx) => {
    await tx.contactInquiry.update({
      where: { id: inquiryId },
      data: {
        status: "responded",
        adminReplyAt: new Date(),
        adminReplyBy: actorId,
      },
    });
    return tx.adminSupportMessage.update({
      where: { id: message.id },
      data: { status: "sent", deliveryErrorCode: null },
    });
  });
}

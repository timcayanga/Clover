import { z } from "zod";
import { prisma } from "./prisma";
import { getAdminDataEnvironment } from "./admin";
import { sendNotificationMail } from "./notification-mail.server";
import { getEnv } from "./env";
export const supportMessageSchema = z
  .object({
    kind: z.enum(["reply", "note"]),
    subject: z.string().trim().max(200).optional(),
    body: z.string().trim().min(1).max(5000),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
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
  const existing = await prisma.adminSupportMessage.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (
      existing.inquiryId !== inquiryId ||
      existing.actorId !== actorId ||
      existing.body !== input.body ||
      existing.subject !== (input.subject ?? null) ||
      existing.kind !== input.kind
    )
      throw new Error("This request key belongs to a different message.");
    return existing;
  }
  if (input.kind === "reply" && !getEnv().ZOHO_SMTP_PASSWORD)
    throw new Error(
      "Email delivery is not configured. Your draft has not been sent.",
    );
  const message = await prisma.adminSupportMessage.create({
    data: {
      ...input,
      inquiryId,
      actorId,
      status: input.kind === "note" ? "internal" : "sending",
    },
  });
  if (input.kind === "note") return message;
  // SMTP has no idempotency support. A timeout is ambiguous; never retry it
  // automatically or mark the inquiry responded until the server accepts mail.
  try {
    await sendNotificationMail(inquiry.email, input.subject!, input.body);
  } catch {
    return prisma.adminSupportMessage.update({
      where: { id: message.id },
      data: { status: "unknown" },
    });
  }
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
      data: { status: "sent" },
    });
  });
}

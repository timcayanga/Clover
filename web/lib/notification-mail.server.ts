import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";
import { MailDeliveryError, mailFailure } from "./mail-delivery";

export async function sendNotificationMail(
  to: string,
  subject: string,
  text: string,
  html?: string,
  options?: { messageId?: string },
) {
  const env = getEnv();
  if (!env.ZOHO_SMTP_PASSWORD)
    throw new MailDeliveryError("not_sent", "configuration_missing");
  const username = env.ZOHO_SMTP_USER ?? "hello@clover.ph";
  const port = env.ZOHO_SMTP_PORT ?? 465;
  const transporter = nodemailer.createTransport({
    host: env.ZOHO_SMTP_HOST ?? "smtp.zoho.com",
    port,
    secure: port === 465,
    auth: { user: username, pass: env.ZOHO_SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    const result = await transporter.sendMail({
      from: `Clover <${env.CIRCLE_INVITATION_FROM ?? username}>`,
      to: to.trim().toLowerCase(),
      subject: subject.replace(/[\r\n]/g, " "),
      text,
      ...(options?.messageId ? { messageId: options.messageId } : {}),
      ...(html ? { html } : {}),
    });
    if (result.accepted.length === 0)
      throw new MailDeliveryError("not_sent", "recipient_rejected");
    return { messageId: result.messageId };
  } catch (error) {
    const failure = mailFailure(error);
    throw new MailDeliveryError(failure.outcome, failure.code);
  } finally {
    transporter.close();
  }
}

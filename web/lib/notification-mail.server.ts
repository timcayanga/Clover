import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";

export async function sendNotificationMail(
  to: string,
  subject: string,
  text: string,
) {
  const env = getEnv();
  if (!env.ZOHO_SMTP_PASSWORD)
    throw new Error("Email delivery is not configured.");
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
    });
    if (result.accepted.length === 0)
      throw new Error("Email was not accepted.");
  } finally {
    transporter.close();
  }
}

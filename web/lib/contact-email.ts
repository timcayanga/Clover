import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";
import type { ContactInquiryAttachment } from "@/lib/contact-inquiries";
import { MailDeliveryError, mailFailure } from "./mail-delivery";

const CONTACT_ADDRESS = "hello@clover.ph";

const stripNewlines = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

const attachmentToMailAttachment = (
  attachment: ContactInquiryAttachment | null,
) => {
  if (!attachment) {
    return undefined;
  }

  const encodedData = attachment.dataUrl.split(",", 2)[1];
  if (!encodedData) {
    return undefined;
  }

  return {
    filename: attachment.name,
    content: Buffer.from(encodedData, "base64"),
    contentType: attachment.type,
  };
};

export async function sendContactInquiryEmail(input: {
  name: string;
  email: string;
  message: string;
  attachment?: ContactInquiryAttachment | null;
  sourcePage?: string | null;
  kind?: "contact" | "bug_report";
  diagnostics?: string | null;
  messageId?: string;
  recipient?: string;
}) {
  const env = getEnv();
  const username = env.ZOHO_SMTP_USER ?? CONTACT_ADDRESS;

  if (!env.ZOHO_SMTP_PASSWORD) {
    throw new MailDeliveryError("not_sent", "configuration_missing");
  }

  const port = env.ZOHO_SMTP_PORT ?? 465;
  const transporter = nodemailer.createTransport({
    host: env.ZOHO_SMTP_HOST ?? "smtp.zoho.com",
    port,
    secure: port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user: username,
      pass: env.ZOHO_SMTP_PASSWORD,
    },
  });

  const safeName = stripNewlines(input.name);
  const mailAttachment = attachmentToMailAttachment(input.attachment ?? null);
  const isBugReport = input.kind === "bug_report";

  try {
    const result = await transporter.sendMail({
      from: `${isBugReport ? "Clover Bug Reports" : "Clover Contact"} <${username}>`,
      to: input.recipient ?? CONTACT_ADDRESS,
      ...(input.messageId ? { messageId: input.messageId } : {}),
      replyTo: input.email.trim().toLowerCase(),
      subject: `${isBugReport ? "Bug report" : "New Clover support request"} from ${safeName}`,
      text: [
        "Hi Clover team,",
        "",
        isBugReport
          ? "A user submitted a bug report from inside Clover."
          : "You received a new message through the Clover Contact page.",
        "",
        "From:",
        safeName,
        input.email.trim().toLowerCase(),
        "",
        "Message:",
        input.message.trim(),
        ...(input.sourcePage ? ["", "Page:", input.sourcePage] : []),
        ...(input.diagnostics ? ["", "Diagnostics:", input.diagnostics] : []),
        ...(mailAttachment ? ["", "Attachment:", mailAttachment.filename] : []),
      ].join("\n"),
      ...(mailAttachment ? { attachments: [mailAttachment] } : {}),
    });
    if (!result.accepted.length)
      throw new MailDeliveryError("not_sent", "recipient_rejected");
    return { messageId: result.messageId };
  } catch (error) {
    const failure = mailFailure(error);
    throw new MailDeliveryError(failure.outcome, failure.code);
  } finally {
    transporter.close();
  }
}

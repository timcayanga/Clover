import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";
import type { ContactInquiryAttachment } from "@/lib/contact-inquiries";

const CONTACT_ADDRESS = "hello@clover.ph";

const stripNewlines = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

const attachmentToMailAttachment = (attachment: ContactInquiryAttachment | null) => {
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
}) {
  const env = getEnv();
  const username = env.ZOHO_SMTP_USER ?? CONTACT_ADDRESS;

  if (!env.ZOHO_SMTP_PASSWORD) {
    throw new Error("Contact email delivery is not configured.");
  }

  const port = env.ZOHO_SMTP_PORT ?? 465;
  const transporter = nodemailer.createTransport({
    host: env.ZOHO_SMTP_HOST ?? "smtp.zoho.com",
    port,
    secure: port === 465,
    auth: {
      user: username,
      pass: env.ZOHO_SMTP_PASSWORD,
    },
  });

  const safeName = stripNewlines(input.name);
  const mailAttachment = attachmentToMailAttachment(input.attachment ?? null);

  await transporter.sendMail({
    from: `Clover Contact <${username}>`,
    to: CONTACT_ADDRESS,
    replyTo: input.email.trim().toLowerCase(),
    subject: `New Clover support request from ${safeName}`,
    text: [
      "Hi Clover team,",
      "",
      "You received a new message through the Clover Contact page.",
      "",
      "From:",
      safeName,
      input.email.trim().toLowerCase(),
      "",
      "Message:",
      input.message.trim(),
      ...(mailAttachment ? ["", "Attachment:", mailAttachment.filename] : []),
    ].join("\n"),
    ...(mailAttachment ? { attachments: [mailAttachment] } : {}),
  });
}

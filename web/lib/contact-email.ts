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
  kind?: "contact" | "bug_report";
  diagnostics?: string | null;
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
  const isBugReport = input.kind === "bug_report";

  await transporter.sendMail({
    from: `${isBugReport ? "Clover Bug Reports" : "Clover Contact"} <${username}>`,
    to: CONTACT_ADDRESS,
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
}

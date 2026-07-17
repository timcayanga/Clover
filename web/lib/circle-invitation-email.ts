import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";

const DEFAULT_SENDER = "hello@clover.ph";

const stripNewlines = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export const buildCircleInvitationEmail = (input: {
  circleName: string;
  inviterName: string;
  inviteUrl: string;
  expiresAt: Date;
}) => {
  const circleName = stripNewlines(input.circleName);
  const inviterName = stripNewlines(input.inviterName);
  const expiry = input.expiresAt.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
  const subject = `${inviterName} invited you to ${circleName} on Clover`;
  const text = [
    `You’ve been invited to ${circleName}.`,
    "",
    `${inviterName} created a private Circle for managing selected finances together.`,
    "",
    "Join the Circle:",
    input.inviteUrl,
    "",
    `This secure invitation expires on ${expiry}.`,
    "",
    "Creating or joining a Circle does not share your accounts, balances, salary, or transaction history. You choose what to share.",
    "",
    "If you do not have a Clover account yet, the link will guide you through free account setup first.",
  ].join("\n");

  return {
    subject,
    text,
    html: `<p>You’ve been invited to <strong>${escapeHtml(circleName)}</strong>.</p><p>${escapeHtml(inviterName)} created a private Circle for managing selected finances together.</p><p><a href="${escapeHtml(input.inviteUrl)}">Join the Circle</a></p><p>This secure invitation expires on ${escapeHtml(expiry)}.</p><p><small>Creating or joining a Circle does not share your accounts, balances, salary, or transaction history. You choose what to share.</small></p><p><small>If you do not have a Clover account yet, the link will guide you through free account setup first.</small></p>`,
  };
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });

export async function sendCircleInvitationEmail(input: {
  to: string;
  circleName: string;
  inviterName: string;
  inviteUrl: string;
  expiresAt: Date;
}) {
  const env = getEnv();
  const username = env.ZOHO_SMTP_USER ?? DEFAULT_SENDER;
  const senderAddress = env.CIRCLE_INVITATION_FROM ?? username;
  if (!env.ZOHO_SMTP_PASSWORD) {
    throw new Error("Circle invitation email delivery is not configured.");
  }

  const port = env.ZOHO_SMTP_PORT ?? 465;
  const transporter = nodemailer.createTransport({
    host: env.ZOHO_SMTP_HOST ?? "smtp.zoho.com",
    port,
    secure: port === 465,
    auth: { user: username, pass: env.ZOHO_SMTP_PASSWORD },
  });
  const message = buildCircleInvitationEmail(input);

  await transporter.sendMail({
    from: `Clover Circles <${senderAddress}>`,
    to: input.to.trim().toLowerCase(),
    replyTo: senderAddress,
    ...message,
  });
}

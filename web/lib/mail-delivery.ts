export type MailFailureCode =
  | "configuration_missing"
  | "authentication_failed"
  | "recipient_rejected"
  | "connection_failed"
  | "server_rejected"
  | "delivery_unknown"
  | "operator_confirmed_not_sent";
export type MailFailure = {
  outcome: "not_sent" | "unknown";
  code: MailFailureCode;
};
export function mailFailure(error: unknown): MailFailure {
  if (error instanceof MailDeliveryError)
    return { outcome: error.outcome, code: error.code };
  const e = error as {
    code?: string;
    command?: string;
    responseCode?: number;
  } | null;
  if (e?.code === "EAUTH")
    return { outcome: "not_sent", code: "authentication_failed" };
  if (e?.code === "EENVELOPE")
    return { outcome: "not_sent", code: "recipient_rejected" };
  if (
    e?.responseCode &&
    e.responseCode >= 400 &&
    e.responseCode <= 599 &&
    /^(?:EHLO|HELO|STARTTLS|AUTH|MAIL FROM|RCPT TO|DATA)\b/i.test(
      e.command ?? "",
    )
  )
    return {
      outcome: "not_sent",
      code: /^RCPT/i.test(e.command ?? "")
        ? "recipient_rejected"
        : "server_rejected",
    };
  // Nodemailer may label a socket close after DATA as command CONN. A timeout
  // or reset is therefore ambiguous even when that command is present.
  if (
    ["EDNS", "ECONNREFUSED"].includes(
      e?.code ?? "",
    )
  )
    return { outcome: "not_sent", code: "connection_failed" };
  return { outcome: "unknown", code: "delivery_unknown" };
}
export function mailFailureText(code?: string | null) {
  if (code === "authentication_failed")
    return "Not sent. Zoho rejected Clover’s mail login. Update the SMTP credentials before retrying.";
  if (code === "configuration_missing")
    return "Not sent. Clover’s email service is not configured.";
  if (code === "recipient_rejected")
    return "Not sent. The mail server rejected the recipient.";
  if (code === "connection_failed")
    return "Not sent. Clover could not establish the mail connection. Retry after the connection is restored.";
  if (code === "server_rejected")
    return "Not sent. The mail server explicitly rejected this message.";
  if (code === "operator_confirmed_not_sent")
    return "An administrator verified that this message was not sent.";
  return "Delivery is uncertain. Check Zoho’s delivery records before retrying; Clover will not resend automatically.";
}
export class MailDeliveryError extends Error {
  constructor(
    public outcome: MailFailure["outcome"],
    public code: MailFailureCode,
  ) {
    super(mailFailureText(code));
    this.name = "MailDeliveryError";
  }
}

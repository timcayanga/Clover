import { z } from "zod";
import type { InAppNotification } from "@/lib/in-app-notifications";

// Original runtime copy remains the source of dynamic amounts, names and links.
export const notificationTriggers = [
  [
    "import-processing",
    "Import in progress",
    "A file is processing.",
    "Import in progress",
    "September statement.pdf is still being processed by Clover.",
  ],
  [
    "import-failed",
    "Import needs attention",
    "A file could not be processed.",
    "Import needs attention",
    "September statement.pdf could not be processed. Review the file and try again.",
  ],
  [
    "import-done",
    "Import complete",
    "A file finishes importing.",
    "Import complete",
    "12 transactions were added from September statement.pdf.",
  ],
  [
    "upload-reminder",
    "Upload reminder",
    "A weekly reminder when records have not been uploaded recently.",
    "Upload your latest data",
    "A quick statement or receipt upload keeps balances and reports current.",
  ],
  [
    "review",
    "Transactions to review",
    "Uncertain transactions are waiting for confirmation.",
    "3 transactions need attention",
    "Review uncertain categories, possible duplicates, or account matches Clover wants you to confirm.",
  ],
  [
    "account-mismatch",
    "Account reconciliation",
    "A statement balance does not match account activity.",
    "Savings needs reconciliation",
    "The statement balance does not match the recorded account activity.",
  ],
  [
    "recurring",
    "Upcoming or overdue payment",
    "An active commitment is due soon or overdue.",
    "Internet is due soon",
    "This payment of PHP 1,500 is due Sep 10.",
  ],
  [
    "budget",
    "Budget alert",
    "A budget is nearing or exceeding its limit.",
    "Groceries is nearing its limit",
    "You have used 90% of this month's budget.",
  ],
  [
    "circle-invitation",
    "Circle invitation",
    "An invitation is created or resent. Email is immediate; in-app requires a Clover account.",
    "Join Our household",
    "Alex invited you to a Circle. The invitation expires Sep 21.",
  ],
  [
    "circle-activity",
    "Circle activity",
    "Another member changes shared Circle data.",
    "Our household",
    "Alex added a shared expense.",
  ],
  [
    "split-request",
    "Split bill payment",
    "A payment is requested, reported, or settled.",
    "Payment reported",
    "Alex reported a payment for Friday dinner.",
  ],
  [
    "investment-dividend",
    "Dividend recorded",
    "A dividend was recorded in the last seven days.",
    "Dividend recorded",
    "PHP 500 was recorded for Sample fund.",
  ],
  [
    "investment-maturity",
    "Investment maturity",
    "An investment matures within 14 days.",
    "Time deposit matures soon",
    "This investment matures Sep 20. Review your next options.",
  ],
  [
    "billing",
    "Subscription needs attention",
    "A subscription is suspended or expired. Provider emails remain separate.",
    "Subscription needs attention",
    "Clover could not confirm an active subscription. Review your plan and payment details.",
  ],
] as const;
export type TriggerKey = (typeof notificationTriggers)[number][0];
export const templateTokens = [
  "title",
  "message",
  "ctaLabel",
  "actionUrl",
] as const;
const content = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .superRefine((value, ctx) => {
      for (const match of value.matchAll(/\{\{([^{}]*)\}\}/g)) {
        if (
          !templateTokens.includes(
            match[1].trim() as (typeof templateTokens)[number],
          )
        )
          ctx.addIssue({
            code: "custom",
            message: `Unknown placeholder: ${match[1]}`,
          });
      }
      if (value.replace(/\{\{[^{}]*\}\}/g, "").match(/[{}]/))
        ctx.addIssue({
          code: "custom",
          message:
            "Use placeholders such as {{title}}; unmatched braces are not supported.",
        });
    });
export const notificationTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    triggerKey: z.enum(
      notificationTriggers.map((t) => t[0]) as [TriggerKey, ...TriggerKey[]],
    ),
    enabled: z.boolean(),
    inApp: z.boolean(),
    email: z.boolean(),
    title: content(200),
    body: content(4000),
    ctaLabel: content(80),
    emailSubject: content(200).refine(
      (v) => !/[\r\n]/.test(v),
      "Email subject must be one line.",
    ),
    emailBody: content(6000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.inApp && !v.email)
      ctx.addIssue({
        code: "custom",
        message: "Choose at least one delivery channel.",
      });
    if (v.inApp && (!v.title || !v.body))
      ctx.addIssue({
        code: "custom",
        message: "In-app title and message are required.",
      });
    if (v.email && (!v.emailSubject || !v.emailBody))
      ctx.addIssue({
        code: "custom",
        message: "Email subject and body are required.",
      });
    if (
      v.email &&
      v.triggerKey === "circle-invitation" &&
      !v.emailBody.includes("{{actionUrl}}")
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Circle invitation emails must include {{actionUrl}} so recipients can join.",
      });
  });
export type TemplateDraft = z.infer<typeof notificationTemplateSchema>;
export type NotificationTemplateView = TemplateDraft & {
  key: string;
  version: number;
  archived: boolean;
  emailEnabledAt: string | null;
};
export const defaultNotificationTemplates: NotificationTemplateView[] =
  notificationTriggers.map(([key, name]) => ({
    key,
    name,
    triggerKey: key,
    enabled: true,
    inApp: true,
    email: key === "circle-invitation",
    title: "{{title}}",
    body: "{{message}}",
    ctaLabel: "{{ctaLabel}}",
    emailSubject: "{{title}}",
    emailBody: "{{message}}\n\n{{actionUrl}}",
    version: 0,
    archived: false,
    emailEnabledAt: null,
  }));
export function triggerForNotification(
  item: Pick<InAppNotification, "id">,
): TriggerKey | null {
  const prefix = item.id.split(":")[0];
  const key =
    prefix === "import" ? `import-${item.id.split(":").at(-1)}` : prefix;
  return notificationTriggers.some((t) => t[0] === key)
    ? (key as TriggerKey)
    : null;
}
export function renderNotificationText(
  text: string,
  values: Record<(typeof templateTokens)[number], string>,
) {
  // Single pass: user-generated values cannot introduce executable placeholders or markup.
  return text.replace(
    /\{\{\s*(title|message|ctaLabel|actionUrl)\s*\}\}/g,
    (_, key: keyof typeof values) => values[key],
  );
}
export const safeNotificationPath = (path: string | null) =>
  path && /^\/(?!\/)/.test(path) && !/[\\\r\n]/.test(path) ? path : null;
export function notificationValues(
  item: InAppNotification,
  origin = "https://clover.ph",
) {
  const path = safeNotificationPath(item.href);
  return {
    title: item.title,
    message: item.message,
    ctaLabel: item.ctaLabel ?? "",
    actionUrl: path ? new URL(path, origin).toString() : "",
  };
}
export function applyInAppTemplates(
  items: InAppNotification[],
  templates: NotificationTemplateView[],
) {
  return items.flatMap((item) => {
    const trigger = triggerForNotification(item);
    if (!trigger) return [item];
    return templates
      .filter(
        (t) => t.triggerKey === trigger && t.enabled && t.inApp && !t.archived,
      )
      .map((t) => {
        const values = notificationValues(item);
        return {
          ...item,
          id: t.key === trigger ? item.id : `${item.id}:template:${t.key}`,
          title: renderNotificationText(t.title, values),
          message: renderNotificationText(t.body, values),
          ctaLabel: item.href
            ? renderNotificationText(t.ctaLabel, values)
            : null,
        };
      });
  });
}
export function eligibleNotificationEmail(
  template: NotificationTemplateView,
  item: InAppNotification,
) {
  return (
    template.enabled &&
    !template.archived &&
    template.email &&
    template.triggerKey !== "circle-invitation" &&
    template.triggerKey === triggerForNotification(item) &&
    !!template.emailEnabledAt &&
    Date.parse(item.createdAt) >= Date.parse(template.emailEnabledAt)
  );
}

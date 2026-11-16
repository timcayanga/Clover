type SupportMessage = { kind: string; body: string; idempotencyKey: string };
export function supportAssignmentId(message: SupportMessage) {
  if (message.kind !== "assignment") return null;
  return /^Assignment: (user_[A-Za-z0-9]+);/.exec(message.body)?.[1] ?? null;
}
export function supportMessageSummary(message: SupportMessage, names: Record<string, { displayName: string }>) {
  if (message.kind === "assignment") {
    const target = /^Assignment: ([^;]+);/.exec(message.body)?.[1];
    if (!target) return message.body;
    const priority = /; priority: ([a-z]+);/.exec(message.body)?.[1];
    const snoozed = /; snoozed until: (.+)$/.exec(message.body)?.[1];
    const date = snoozed ? new Date(snoozed) : null;
    const snooze = date && Number.isFinite(date.getTime())
      ? ` · Snoozed until ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(date)} PHT` : "";
    return `${target !== "Unassigned" ? `Assigned to ${names[target]?.displayName ?? "a team member"}` : "Unassigned"}${priority && priority !== "normal" ? ` · ${priority} priority` : ""}${snooze}.`;
  }
  if (message.kind === "note" && message.idempotencyKey.startsWith("delivery-risk-retry:"))
    return "Retry authorized; possible duplicate delivery acknowledged.";
  if (message.kind === "note" && message.idempotencyKey.startsWith("delivery-resolution:"))
    return "Non-delivery verified; retry authorized.";
  return message.body;
}

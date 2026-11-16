/** Presentation and eligibility rules for unconfirmed suggestions, never saved bills. */
export const recurringSuggestionAliases = [
  { pattern: /\b(openai|chat\s*gpt|chatgpt)\b/i, label: "OpenAI ChatGPT" },
  { pattern: /\bapple\s+music\b/i, label: "Apple Music" },
  { pattern: /\bicloud\b/i, label: "iCloud" },
  { pattern: /\bapple\b.*\b(bill|itunes|services?)\b/i, label: "Apple" },
  { pattern: /\bscribd\b/i, label: "Scribd" },
  { pattern: /\bamazon\s+prime\b|\bprime\s+video\b/i, label: "Amazon Prime" },
  ...["Netflix", "Spotify", "Adobe", "Canva", "Figma", "Zoom", "Dropbox", "Notion", "Slack", "LinkedIn", "Meralco", "PLDT"].map((label) => ({
    pattern: new RegExp(`\\b${label}\\b`, "i"), label,
  })),
];

export function suggestRecurringTitle(value: string): string {
  const title = value.replace(/\s+/g, " ").trim();
  const searchable = title.replace(/[^\p{L}\p{N}]+/gu, " ");
  // Only shorten identifiable merchant aliases; retain unknown bill names verbatim.
  return recurringSuggestionAliases.find(({ pattern }) => pattern.test(searchable))?.label ?? title;
}

export function isRecurringSuggestionCurrent(
  lastSeen: Date | string | null | undefined,
  frequency: string | null | undefined,
  now = new Date(),
): boolean {
  if (!lastSeen) return false;
  const last = new Date(lastSeen).getTime();
  const maxAgeDays: Record<string, number> = { weekly: 21, biweekly: 42, monthly: 75, quarterly: 200, annual: 410 };
  const maxAge = frequency ? maxAgeDays[frequency] : undefined;
  if (!Number.isFinite(last) || !maxAge) return false;
  // Tolerate delayed imports/two missed monthly cycles. Hiding is not cancellation.
  return last <= now.getTime() + 86400000 && now.getTime() - last <= maxAge * 86400000;
}

export function getRecurringSuggestionCategory(categoryNames: (string | null | undefined)[], reasonTags: string[] = []): string {
  const counts = new Map<string, number>();
  for (const category of categoryNames) {
    if (category && !/^(other|uncategorized|uncategorised)$/i.test(category)) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const evidenceCategory = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (evidenceCategory) return evidenceCategory;
  if (reasonTags.includes("subscription")) return "Subscriptions";
  if (reasonTags.includes("utility")) return "Bills & Utilities";
  if (reasonTags.includes("rent")) return "Housing";
  if (reasonTags.some((tag) => ["loan", "statement payment", "installment"].includes(tag))) return "Financial";
  if (reasonTags.includes("insurance")) return "Insurance";
  return "Other";
}

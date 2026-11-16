/** Presentation helpers only. Never mutate saved bills or recorded payments. */
export type SplitPerson = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};
export type SplitItem = {
  id?: string;
  description: string;
  amount: string;
  participantIds: string[];
  splitMethod?: "equal" | "exact" | "percentage" | "shares";
  allocations?: { participantId: string; value: string }[];
};
export const splitMethods = [
  { value: "equal", label: "Equally", icon: "＝" },
  { value: "exact", label: "By amount", icon: "₱" },
  { value: "percentage", label: "By percent", icon: "%" },
] as const;

/** Integer cents keep displayed equal splits reconciled, including odd cents. */
export function splitItemTotals(
  people: SplitPerson[],
  items: SplitItem[],
  adjustment = 0,
) {
  const totals = Object.fromEntries(people.map((p) => [p.id, 0]));
  for (const item of items) {
    const selected = people.filter((p) => item.participantIds.includes(p.id));
    if (!selected.length) continue;
    const cents = Math.round((Number(item.amount) || 0) * 100);
    const allocations = new Map(
      (item.allocations ?? []).map((a) => [
        a.participantId,
        Math.max(0, Number(a.value) || 0),
      ]),
    );
    const method = item.splitMethod ?? "equal";
    if (method === "exact") {
      for (const p of selected)
        totals[p.id] += Math.round((allocations.get(p.id) ?? 0) * 100);
      continue;
    }
    const weights = selected.map((p) =>
      method === "equal" ? 1 : (allocations.get(p.id) ?? 0),
    );
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum) continue;
    const raw = weights.map(
      (v) => (cents * v) / (method === "percentage" ? 100 : sum),
    );
    const rounded = raw.map(Math.floor);
    // Allocate the residual only for a complete, valid split.
    if (method !== "percentage" || Math.abs(sum - 100) < 0.001) {
      let rest = cents - rounded.reduce((a, b) => a + b, 0);
      const order = raw
        .map((v, i) => ({ i, fraction: v - rounded[i] }))
        .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
      for (const entry of order) {
        if (rest-- <= 0) break;
        rounded[entry.i]++;
      }
    }
    selected.forEach((p, i) => {
      totals[p.id] += rounded[i];
    });
  }
  const base = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const extra = Math.round(adjustment * 100);
  if (base > 0 && extra) {
    const apportioned = people.map((p) => (extra * totals[p.id]) / base);
    const cents = apportioned.map(Math.trunc);
    let residual = extra - cents.reduce((sum, n) => sum + n, 0);
    const order = apportioned
      .map((value, i) => ({ i, fraction: Math.abs(value - cents[i]) }))
      .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (const { i } of order) {
      if (!residual) break;
      const unit = residual > 0 ? 1 : -1;
      cents[i] += unit;
      residual -= unit;
    }
    people.forEach((p, i) => {
      totals[p.id] += cents[i];
    });
  }
  return Object.fromEntries(
    Object.entries(totals).map(([id, cents]) => [id, cents / 100]),
  );
}

export function suggestBillCategory(
  title: string,
  descriptions: string[] = [],
) {
  const text = [title, ...descriptions].join(" ").toLowerCase();
  const rules = [
    [
      /\b(food|dining|lunch|dinner|breakfast|restaurant|coffee|cafe|pasta|pizza|chicken|drinks)\b/,
      "Food & Dining",
    ],
    [/\b(groceries|grocery|supermarket)\b/, "Groceries"],
    [/\b(taxi|ride|uber|grab|transport|fare|parking|fuel)\b/, "Transport"],
    [/\b(rent|housing|apartment)\b/, "Housing"],
    [/\b(electric|electricity|water|internet|utilities|wifi)\b/, "Utilities"],
    [/\b(hotel|flight|travel|airfare|vacation)\b/, "Travel"],
    [/\b(movie|cinema|concert|entertainment)\b/, "Entertainment"],
  ] as const;
  const found = rules.find(([pattern]) => pattern.test(text));
  return found
    ? {
        name: found[1],
        confidence: 80,
        reason: "Suggested from the bill title and line items.",
      }
    : null;
}

export function paymentRequestMessage(
  recipient: string,
  entries: {
    title: string;
    amount: string;
    currency: string;
    date?: string;
    url: string;
    note?: string | null;
  }[],
) {
  const greeting = `Hi ${recipient || "there"}!`;
  const details = entries
    .map(
      (e) =>
        `${e.title}${e.date ? ` (${e.date.slice(0, 10)})` : ""} · ${e.currency} ${Number(e.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n${e.url}${e.note ? `\n${e.note}` : ""}`,
    )
    .join("\n\n");
  return `${greeting} Here’s ${entries.length === 1 ? "your share" : "a quick round-up of your shares"} whenever you’re ready:\n\n${details}\n\nThe link${entries.length === 1 ? " has" : "s have"} the breakdown and payment details—no Clover account needed. Thanks! 🌿`;
}

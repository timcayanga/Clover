import type { FinancialCommitmentSummary } from "./commitments";

export const inferCommitmentCategory = (commitment: Pick<FinancialCommitmentSummary, "title" | "counterparty" | "kind">) => {
  const text = `${commitment.title} ${commitment.counterparty ?? ""}`.toLowerCase();
  if (/subscription|membership|netflix|spotify|openai|chatgpt|icloud|youtube|adobe/.test(text)) return "Subscriptions";
  if (/electric|water|utility|utilities|internet|broadband|phone|mobile|globe|smart|pldt|meralco|maynilad/.test(text)) return "Bills & Utilities";
  if (/rent|lease|mortgage/.test(text)) return "Housing";
  if (/tuition|school|education/.test(text)) return "Education";
  if (/insurance|loan|credit|debt|installment|amortization/.test(text)) return "Financial";
  if (commitment.kind === "receivable") return "Income";
  if (commitment.kind === "debt" || commitment.kind === "reminder") return "Financial";
  return "Other";
};

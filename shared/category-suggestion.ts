export type CategorySuggestion = {
  categoryId: string;
  categoryName: string;
  confidence: number;
  source: "merchant_rule" | "training_signal" | "heuristic";
  sourceLabel: string;
  reason: string;
};

/** Only changes an unsaved draft. A user's category choice always wins. */
export function applicableCategorySuggestion(
  suggestion: CategorySuggestion | null | undefined,
  categories: Array<{ id: string; type: string }>,
  type: string,
  manuallyChosen = false,
): suggestion is CategorySuggestion {
  return !manuallyChosen && type !== "transfer" && Boolean(
    suggestion?.categoryId &&
    Number.isFinite(suggestion.confidence) && suggestion.confidence >= 60 &&
    suggestion.confidence <= 100 &&
    suggestion.categoryName.trim().toLowerCase() !== "other" &&
    categories.some(category => category.id === suggestion.categoryId && category.type === type),
  );
}

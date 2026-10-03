"use client";
import { useEffect, useRef, useState } from "react";
import { applicableCategorySuggestion, type CategorySuggestion } from "../../shared/category-suggestion";

export function useDraftCategorySuggestion(input: {
  workspaceId: string; merchantText: string; type: string; categoryId: string;
  categories: Array<{ id: string; type: string }>;
  enabled: boolean; manuallyChosen: boolean;
  onApply: (categoryId: string) => void;
}) {
  const latest = useRef(input);
  latest.current = input;
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const autoCategory = useRef<{ id: string; workspaceId: string; merchantText: string; type: string } | null>(null);
  const { workspaceId, merchantText, type, enabled, manuallyChosen } = input;
  useEffect(() => {
    setSuggestion(null);
    const previous = autoCategory.current;
    if (manuallyChosen) autoCategory.current = null;
    else if (enabled && previous && (previous.workspaceId !== workspaceId || previous.merchantText !== merchantText || previous.type !== type)) {
      if (latest.current.categoryId === previous.id) latest.current.onApply("");
      autoCategory.current = null;
    }
    if (!enabled || manuallyChosen || !workspaceId || merchantText.trim().length < 2 || type === "transfer") return;
    const controller = new AbortController();
    let live = true;
    const timer = setTimeout(() => {
      void fetch("/api/transaction-category-suggestions", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ workspaceId, merchantText: merchantText.trim(), type }),
      }).then(async response => response.ok ? response.json() as Promise<{ suggestion?: CategorySuggestion | null }> : null)
        .then(result => {
          const current = latest.current;
          if (!live || !current.enabled || current.workspaceId !== workspaceId || current.merchantText !== merchantText || current.type !== type ||
            !applicableCategorySuggestion(result?.suggestion, current.categories, type, current.manuallyChosen)) return;
          setSuggestion(result.suggestion);
          autoCategory.current = { id: result.suggestion.categoryId, workspaceId, merchantText, type };
          current.onApply(result.suggestion.categoryId);
        }).catch(() => {});
    }, 250);
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [workspaceId, merchantText, type, enabled, manuallyChosen]);
  return suggestion;
}

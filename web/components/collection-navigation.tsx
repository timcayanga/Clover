"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

// Native history preserves Back, forward and copied links without a workspace refetch.
export function useCollectionSelection(parameter: string) {
  const params = useSearchParams();
  const selectedId = params?.get(parameter) ?? null;
  const select = useCallback((id: string | null) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(parameter) === id) return;
    if (id) url.searchParams.set(parameter, id);
    else url.searchParams.delete(parameter);
    if (parameter !== "tab") url.searchParams.delete("tab");
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
  }, [parameter]);
  return [selectedId, select] as const;
}

export function CollectionBack({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="collection-back" type="button" onClick={onClick} aria-label={`Back to ${label}`}>
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true"><path d="m12 4-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
    <span>{label}</span>
  </button>;
}

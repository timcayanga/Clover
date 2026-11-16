"use client";

import { useEffect, useRef, useState } from "react";

export type TransactionNameSuggestion = {
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string;
  accountName: string;
  type: "income" | "expense" | "transfer";
  count: number;
};

type TransactionNameAutocompleteProps = {
  workspaceId: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: TransactionNameSuggestion) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  placeholder?: string;
  required?: boolean;
};

export function TransactionNameAutocomplete({
  workspaceId,
  value,
  onChange,
  onSelect,
  inputRef,
  placeholder = "Lunch in Makati",
  required = true,
}: TransactionNameAutocompleteProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const suppressQueryRef = useRef<string | null>(null);
  const [suggestions, setSuggestions] = useState<TransactionNameSuggestion[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (suppressQueryRef.current === query) {
      suppressQueryRef.current = null;
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (query.length < 1) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/transaction-name-suggestions?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const payload = (await response.json().catch(() => ({}))) as { suggestions?: TransactionNameSuggestion[] };
        const nextSuggestions = response.ok && Array.isArray(payload.suggestions) ? payload.suggestions : [];
        setSuggestions(nextSuggestions);
        setOpen(nextSuggestions.length > 0);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setOpen(false);
        }
      }
    }, 140);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [value, workspaceId]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="transaction-name-autocomplete" ref={rootRef}>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(suggestions.length > 0)}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        required={required}
      />
      {open ? (
        <div className="transaction-name-autocomplete__menu" role="listbox" aria-label="Previous transaction names">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.name}:${suggestion.accountId}`}
              type="button"
              className="transaction-name-autocomplete__option"
              onClick={() => {
                suppressQueryRef.current = suggestion.name.trim();
                onChange(suggestion.name);
                onSelect(suggestion);
                setOpen(false);
              }}
            >
              <span>
                <strong>{suggestion.name}</strong>
                <small>{[suggestion.categoryName, suggestion.accountName].filter(Boolean).join(" · ")}</small>
              </span>
              {suggestion.count > 1 ? <em>{suggestion.count}×</em> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

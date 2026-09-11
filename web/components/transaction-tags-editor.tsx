"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { sanitizeTransactionTagNames } from "@/lib/transaction-tags";

type TransactionTagsEditorProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  inputAriaLabel?: string;
};

export function TransactionTagsEditor({
  tags,
  onChange,
  suggestions = [],
  placeholder = "Add a tag and press Enter",
  inputAriaLabel = "Add transaction tag",
}: TransactionTagsEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");

  const availableSuggestions = useMemo(() => {
    const selected = new Set(sanitizeTransactionTagNames(tags).map((tag) => tag.toLowerCase()));
    return sanitizeTransactionTagNames(suggestions).filter((suggestion) => !selected.has(suggestion.toLowerCase()) && suggestion.toLowerCase().includes(inputValue.trim().toLowerCase())).slice(0, 8);
  }, [inputValue, suggestions, tags]);

  const addTags = (values: string[]) => {
    const nextTags = sanitizeTransactionTagNames([...tags, ...values]);
    onChange(nextTags);
    setInputValue("");
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  const commitInput = () => {
    const parsedValues = inputValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (parsedValues.length === 0) {
      return;
    }

    addTags(parsedValues);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitInput();
    }

    if (event.key === "Backspace" && !inputValue && tags.length > 0) {
      event.preventDefault();
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div ref={editorRef} className="transaction-tags-editor">
      <div className="transaction-tags-editor__chips">
        {tags.map((tag) => (
          <span key={tag} className="transaction-tags-editor__chip">
            <span>{tag}</span>
            <button type="button" className="transaction-tags-editor__remove" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}>
              x
            </button>
          </span>
        ))}
      </div>

      <div className="transaction-tags-editor__input-row">
        <input
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            // Controls inside the editor commit their own action. A blur before
            // Add must not clear the input and disable the button before click.
            if (event.relatedTarget instanceof Node && editorRef.current?.contains(event.relatedTarget)) return;
            if (inputValue.trim()) {
              commitInput();
            }
          }}
          placeholder={placeholder}
          aria-label={inputAriaLabel}
        />
        <button type="button" className="button button-secondary button-small" onPointerDown={(event) => event.preventDefault()} onClick={commitInput} disabled={!inputValue.trim()}>
          Add
        </button>
      </div>

      {availableSuggestions.length > 0 ? (
        <div className="transaction-tags-editor__suggestions">
          {availableSuggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="transaction-tags-editor__suggestion" onPointerDown={(event) => event.preventDefault()} onClick={() => addTags([suggestion])}>
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

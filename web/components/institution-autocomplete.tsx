"use client";

import { useId, useMemo, useState } from "react";
import {
  getInstitutionSuggestionGroups,
  type InstitutionAutocompleteVariant,
  type InstitutionSuggestion,
} from "@/lib/institution-suggestions";

type InstitutionAutocompleteProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: InstitutionAutocompleteVariant;
  helperText?: string;
};

const getSuggestionBadge = (suggestion: InstitutionSuggestion) => {
  if (suggestion.category === "bank") {
    return "Bank";
  }

  if (suggestion.category === "wallet") {
    return "Platform";
  }

  return "Investment";
};

export function InstitutionAutocomplete({
  label,
  value,
  onChange,
  placeholder,
  variant = "account",
  helperText,
}: InstitutionAutocompleteProps) {
  const id = useId();
  const [isFocused, setIsFocused] = useState(false);

  const suggestionGroups = useMemo(() => getInstitutionSuggestionGroups(value, variant), [value, variant]);
  const showSuggestions = isFocused && suggestionGroups.length > 0;

  return (
    <div className="institution-autocomplete">
      <label htmlFor={id}>{label}</label>
      <div className="institution-autocomplete__field">
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            window.setTimeout(() => setIsFocused(false), 120);
          }}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-haspopup="listbox"
        />

        {showSuggestions ? (
          <div className="institution-autocomplete__suggestions" role="listbox" aria-label={`${label} suggestions`}>
            {suggestionGroups.map((group) => (
              <div key={group.title} className="institution-autocomplete__group">
                <div className="institution-autocomplete__group-title">{group.title}</div>
                {group.items.map((suggestion) => (
                  <button
                    key={`${group.title}:${suggestion.label}`}
                    className="institution-autocomplete__suggestion"
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(suggestion.label);
                      setIsFocused(false);
                    }}
                  >
                    <strong>{suggestion.label}</strong>
                    <span>{suggestion.description}</span>
                    <small>{getSuggestionBadge(suggestion)}</small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {helperText ? <small>{helperText}</small> : null}
    </div>
  );
}

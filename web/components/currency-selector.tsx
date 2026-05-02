"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  getCurrencyCatalogOptions,
  getCurrencyCatalogOption,
  getCurrencyLogoCandidates,
  type CurrencyCatalogOption,
} from "@/lib/currencies";

type CurrencySelectorProps = {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  includeAllOption?: boolean;
  allLabel?: string;
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
  compact?: boolean;
  disabled?: boolean;
};

type CurrencyAvatarProps = {
  currency: string;
  label: string;
  size?: "small" | "medium";
};

function CurrencyAvatar({ currency, label, size = "medium" }: CurrencyAvatarProps) {
  const [failed, setFailed] = useState(false);
  const [logoIndex, setLogoIndex] = useState(0);
  const option = useMemo(() => getCurrencyCatalogOption(currency), [currency]);
  const logoCandidates = useMemo(
    () => getCurrencyLogoCandidates(currency),
    [currency]
  );
  const currentLogoSrc = logoCandidates[logoIndex] ?? null;

  useEffect(() => {
    setFailed(false);
    setLogoIndex(0);
  }, [currency, logoCandidates.join("|")]);

  return (
    <span className={`currency-avatar currency-avatar--${size}`} aria-hidden="true" title={option.name}>
      {currentLogoSrc && !failed ? (
        <img
          className="currency-avatar__logo"
          src={currentLogoSrc}
          alt={label}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            if (logoIndex < logoCandidates.length - 1) {
              setLogoIndex((current) => Math.min(current + 1, logoCandidates.length - 1));
            } else {
              setFailed(true);
            }
          }}
        />
      ) : (
        <span className="currency-avatar__fallback">{currency.trim().slice(0, 3).toUpperCase() || "?"}</span>
      )}
    </span>
  );
}

function CurrencyOptionRow({
  option,
  selected,
}: {
  option: CurrencyCatalogOption;
  selected: boolean;
}) {
  return (
    <>
      <CurrencyAvatar currency={option.code} label={option.name} size="small" />
      <span className="currency-selector__option-text">
        <strong>{option.code}</strong>
        <span>{option.name}</span>
      </span>
      {selected ? <span className="currency-selector__option-check" aria-hidden="true">✓</span> : null}
    </>
  );
}

export function CurrencySelector({
  value,
  onChange,
  options = [],
  includeAllOption = false,
  allLabel = "All",
  ariaLabel = "Select currency",
  className,
  buttonClassName,
  menuClassName,
  optionClassName,
  compact = false,
  disabled = false,
}: CurrencySelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const catalogOptions = useMemo(() => {
    const values = options.length > 0 ? options : [];
    const sortedOptions = getCurrencyCatalogOptions(values);
    const current = value.trim().toUpperCase();
    const isKnown = sortedOptions.some((option) => option.code === current);
    return isKnown || !current ? sortedOptions : [getCurrencyCatalogOption(current), ...sortedOptions];
  }, [options, value]);

  const selectedCode = value.trim().toUpperCase();
  const isAllSelected = includeAllOption && (selectedCode === "" || selectedCode === "ALL" || selectedCode === "__ALL__");
  const selectedOption = useMemo(
    () => catalogOptions.find((option) => option.code === selectedCode) ?? getCurrencyCatalogOption(selectedCode || "PHP"),
    [catalogOptions, selectedCode]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const availableOptions = useMemo(() => {
    const baseOptions = includeAllOption ? [{ code: "__all__", name: allLabel, kind: "fiat" as const, logoSrcs: [] as string[] }, ...catalogOptions] : catalogOptions;
    return baseOptions;
  }, [allLabel, catalogOptions, includeAllOption]);

  return (
    <div ref={rootRef} className={`currency-selector ${className ?? ""}`.trim()}>
      <button
        type="button"
        className={`currency-selector__button ${compact ? "currency-selector__button--compact" : ""} ${buttonClassName ?? ""}`.trim()}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        disabled={disabled}
      >
        {!isAllSelected ? (
          <>
            <CurrencyAvatar currency={selectedOption.code} label={selectedOption.name} size="small" />
            <span className="currency-selector__trigger-code">{selectedOption.code}</span>
          </>
        ) : (
          <>
            <span className="currency-selector__trigger-all">All</span>
          </>
        )}
        <span className="currency-selector__chevron" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none">
            <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
          </svg>
        </span>
      </button>

      {open ? (
        <div id={menuId} className={`currency-selector__menu ${menuClassName ?? ""}`.trim()} role="listbox" aria-label={ariaLabel}>
          {availableOptions.map((option) => {
            const isAll = option.code === "__all__";
            const isSelected = isAll ? selectedCode === "" || selectedCode === "__all__" : option.code === selectedCode;
            return (
              <button
                key={option.code}
                type="button"
                className={`currency-selector__option ${optionClassName ?? ""} ${isSelected ? "is-selected" : ""}`.trim()}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(isAll ? "all" : option.code);
                  setOpen(false);
                }}
              >
                {isAll ? (
                  <>
                    <span className="currency-avatar currency-avatar--small currency-avatar--all" aria-hidden="true">
                      <span className="currency-avatar__fallback">ALL</span>
                    </span>
                    <span className="currency-selector__option-text">
                      <strong>{allLabel}</strong>
                      <span>Show every currency</span>
                    </span>
                  </>
                ) : (
                  <CurrencyOptionRow option={option} selected={isSelected} />
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

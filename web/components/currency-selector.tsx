"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCurrencyCatalogOptions,
  getCurrencyCatalogOption,
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
  menuAlignment?: "start" | "end";
  showGroupedSections?: boolean;
  showChevron?: boolean;
  portalMenu?: boolean;
};

type CurrencySectionProps = {
  label: string;
  options: CurrencyCatalogOption[];
  selectedCode: string;
  optionClassName?: string;
  onSelect: (value: string) => void;
};

function CurrencySection({ label, options, selectedCode, optionClassName, onSelect }: CurrencySectionProps) {
  if (options.length === 0) {
    return null;
  }

  return (
    <div className="currency-selector__section">
      <div className="currency-selector__section-label">{label}</div>
      <div className="currency-selector__section-list">
        {options.map((option) => {
          const isSelected = option.code === selectedCode;
          return (
            <button
              key={option.code}
              type="button"
              className={`currency-selector__option ${optionClassName ?? ""} ${isSelected ? "is-selected" : ""}`.trim()}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(option.code)}
            >
              <span className="currency-selector__option-text">
                <strong>{option.symbol}</strong>
                <span>{option.name}</span>
              </span>
              {isSelected ? <span className="currency-selector__option-check" aria-hidden="true">✓</span> : null}
            </button>
          );
        })}
      </div>
    </div>
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
  menuAlignment = "start",
  showGroupedSections = false,
  showChevron = true,
  portalMenu = false,
}: CurrencySelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const [portalMenuStyle, setPortalMenuStyle] = useState<React.CSSProperties | null>(null);

  const catalogOptions = useMemo(() => {
    const values = options.length > 0 ? options : [];
    const sortedOptions = getCurrencyCatalogOptions(values);
    const current = value.trim().toUpperCase();
    const isKnown = sortedOptions.some((option) => option.code === current);
    return isKnown || !current ? sortedOptions : [getCurrencyCatalogOption(current), ...sortedOptions];
  }, [options, value]);

  const sections = useMemo(() => {
    if (!showGroupedSections) {
      return [];
    }

    const suggested = catalogOptions.filter((option) => option.code === "PHP" || option.code === "USD" || option.code === "EUR" || option.code === "GBP");
    const remaining = catalogOptions.filter((option) => !suggested.some((item) => item.code === option.code));
    return [
      { label: "Suggested", options: suggested },
      { label: "All Currencies", options: remaining },
    ];
  }, [catalogOptions, showGroupedSections]);

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
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node) &&
        (!menuRef.current || !menuRef.current.contains(event.target as Node))
      ) {
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

  useEffect(() => {
    if (!open || !portalMenu) {
      return;
    }

    const updatePortalPosition = () => {
      const trigger = rootRef.current;
      if (!trigger || typeof window === "undefined") {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(224, viewportWidth - 24);
      const top = Math.min(rect.bottom + 8, viewportHeight - 16);
      const left =
        menuAlignment === "end"
          ? Math.max(12, rect.right - width)
          : Math.min(Math.max(12, rect.left), viewportWidth - width - 12);
      const maxHeight = Math.max(160, viewportHeight - top - 16);

      setPortalMenuStyle({
        position: "fixed",
        top,
        left,
        width,
        maxHeight,
        zIndex: 140,
      });
    };

    updatePortalPosition();
    window.addEventListener("resize", updatePortalPosition);
    window.addEventListener("scroll", updatePortalPosition, true);
    return () => {
      window.removeEventListener("resize", updatePortalPosition);
      window.removeEventListener("scroll", updatePortalPosition, true);
    };
  }, [menuAlignment, open, portalMenu]);

  const menuContent = open ? (
    <div
      id={menuId}
      ref={menuRef}
      className={`currency-selector__menu ${portalMenu ? "currency-selector__menu--portal" : ""} currency-selector__menu--${menuAlignment} ${menuClassName ?? ""}`.trim()}
      role="listbox"
      aria-label={ariaLabel}
      style={portalMenu ? portalMenuStyle ?? undefined : undefined}
    >
      {showGroupedSections ? (
        <>
          {includeAllOption ? (
            <button
              type="button"
              className={`currency-selector__option ${optionClassName ?? ""} ${isAllSelected ? "is-selected" : ""}`.trim()}
              role="option"
              aria-selected={isAllSelected}
              onClick={() => {
                onChange("all");
                setOpen(false);
              }}
            >
              <span className="currency-selector__option-text">
                <strong>{allLabel}</strong>
                <span>Show every currency</span>
              </span>
              {isAllSelected ? <span className="currency-selector__option-check" aria-hidden="true">✓</span> : null}
            </button>
          ) : null}
          {sections.map((section) => (
            <CurrencySection
              key={section.label}
              label={section.label}
              options={section.options}
              selectedCode={selectedCode}
              optionClassName={optionClassName}
              onSelect={(nextCode) => {
                onChange(nextCode);
                setOpen(false);
              }}
            />
          ))}
        </>
      ) : (
        catalogOptions.map((option) => {
          const isSelected = option.code === selectedCode;
          return (
            <button
              key={option.code}
              type="button"
              className={`currency-selector__option ${optionClassName ?? ""} ${isSelected ? "is-selected" : ""}`.trim()}
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onChange(option.code);
                setOpen(false);
              }}
            >
              <span className="currency-selector__option-text">
                <strong>{option.symbol}</strong>
                <span>{option.name}</span>
              </span>
              {isSelected ? <span className="currency-selector__option-check" aria-hidden="true">✓</span> : null}
            </button>
          );
        })
      )}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={`currency-selector ${className ?? ""}`.trim()}>
      <button
        type="button"
        className={`currency-selector__button ${compact ? "currency-selector__button--compact" : ""} ${!showChevron ? "currency-selector__button--no-chevron" : ""} ${buttonClassName ?? ""}`.trim()}
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
          <span className="currency-selector__trigger-token" aria-hidden="true">
            {selectedOption.symbol}
          </span>
        ) : (
          <span className="currency-selector__trigger-all">{allLabel}</span>
        )}
        {showChevron ? (
          <span className="currency-selector__chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
            </svg>
          </span>
        ) : null}
      </button>

      {portalMenu ? (typeof document !== "undefined" && menuContent ? createPortal(menuContent, document.body) : null) : menuContent}
    </div>
  );
}

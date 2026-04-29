"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type InfoTooltipProps = {
  label: string;
  title?: string;
  align?: "left" | "right";
};

export function InfoTooltip({ label, title, align = "right" }: InfoTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const width = Math.min(220, Math.max(window.innerWidth - 24, 180));
      const unclampedLeft = align === "right" ? rect.right - width : rect.left;
      const left = Math.min(Math.max(12, unclampedLeft), window.innerWidth - width - 12);
      const top = rect.bottom + 8;
      setPanelStyle({ top, left, width });
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [align, isOpen]);

  return (
    <span
      ref={triggerRef}
      className={`info-tooltip info-tooltip--${align}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        className="info-tooltip__button"
        type="button"
        aria-label={title ?? label}
        aria-expanded={isOpen}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onClick={() => setIsOpen((current) => !current)}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="info-tooltip__icon">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 8.2v4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="10" cy="5.8" r="0.9" fill="currentColor" />
        </svg>
      </button>
      {isOpen && panelStyle
        ? createPortal(
            <span
              className="info-tooltip__panel is-open"
              role="tooltip"
              style={{ top: `${panelStyle.top}px`, left: `${panelStyle.left}px`, width: `${panelStyle.width}px` }}
            >
              {title ? <span className="info-tooltip__title">{title}</span> : null}
              <p>{label}</p>
            </span>,
            document.body
          )
        : null}
    </span>
  );
}

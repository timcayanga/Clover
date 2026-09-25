"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";

/** A keyboard-accessible dismiss action and a pointer drag target, without stealing form scrolling. */
export function MobileSheetHandle({ onClose, href, disabled = false }: { onClose?: () => void; href?: string; disabled?: boolean }) {
  const router = useRouter();
  const gesture = useRef<{ y: number; distance: number; card: HTMLElement | null } | null>(null);
  const dragged = useRef(false);
  const close = () => { if (!disabled) { if (onClose) onClose(); else if (href) router.push(href); } };
  const reset = () => {
    const current = gesture.current;
    current?.card?.style.removeProperty("transform");
    gesture.current = null;
  };
  return <button type="button" className="mobile-sheet-handle" aria-label="Dismiss sheet" disabled={disabled}
    onPointerDown={event => {
      if (disabled || event.button !== 0) return;
      dragged.current = false;
      gesture.current = { y: event.clientY, distance: 0, card: event.currentTarget.closest<HTMLElement>(".modal-card, .recurring-create, .budget-editor, .goals-blank-state, .split-bill-manual-modal") };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = gesture.current;
      if (!current) return;
      current.distance = Math.max(0, event.clientY - current.y);
      if (current.distance > 5) dragged.current = true;
      current.card?.style.setProperty("transform", `translateY(${current.distance}px)`, "important");
    }}
    onPointerUp={() => { const dismiss = (gesture.current?.distance ?? 0) > 80; reset(); if (dismiss) close(); }}
    onPointerCancel={reset}
    onClick={event => { if (event.detail === 0 || !dragged.current) close(); }}><span aria-hidden="true" /></button>;
}

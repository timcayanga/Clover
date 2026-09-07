"use client";
import { useEffect, useRef, type PointerEvent } from "react";

export function useTransactionLongPress(onSelect: (id: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => cancel, []);
  return {
    start(event: PointerEvent, id: string) {
      cancel(); held.current = false;
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button, input, label, a"))) return;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { held.current = true; onSelect(id); }, 450);
    },
    move(event: PointerEvent) { if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) >= 7) cancel(); },
    cancel,
    consume() { const value = held.current; held.current = false; return value; },
  };
}

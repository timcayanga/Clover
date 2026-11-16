"use client";
import { useEffect } from "react";

/** Browser visual viewport can shrink independently of the layout viewport
 * with tablet keyboards and zoom. Only scroll a focused field if obstructed. */
export function ViewportAccessibility() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ensureVisible = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const input = document.activeElement;
        if (!(input instanceof HTMLElement) || !input.matches('input:not([type="file"]),textarea,[contenteditable="true"]')) return;
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop ?? 0;
        const bottom = top + (viewport?.height ?? window.innerHeight);
        const rect = input.getBoundingClientRect();
        if (rect.top < top + 12 || rect.bottom > bottom - 12) input.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      }, 120);
    };
    document.addEventListener("focusin", ensureVisible);
    window.visualViewport?.addEventListener("resize", ensureVisible);
    return () => { clearTimeout(timer); document.removeEventListener("focusin", ensureVisible); window.visualViewport?.removeEventListener("resize", ensureVisible); };
  }, []);
  return null;
}

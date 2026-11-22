"use client";

import { useEffect } from "react";
import { normalizeAmountEntry } from "@/lib/amount-entry";

/** Also covers entry forms rendered in portals outside the shell DOM. */
export function AmountPasteHandler() {
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented) return;
      const input = event.target;
      if (
        !(input instanceof HTMLInputElement) ||
        input.disabled ||
        input.readOnly ||
        !(input.type === "number" || input.inputMode === "decimal")
      )
        return;
      const text = event.clipboardData?.getData("text") ?? "";
      const normalized = normalizeAmountEntry(text);
      if (normalized === text) return;
      event.preventDefault();
      // Use the native setter so React's controlled input receives the change.
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!setter) return;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const value =
        start === null || end === null
          ? normalized
          : input.value.slice(0, start) + normalized + input.value.slice(end);
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    document.addEventListener("paste", paste, true);
    return () => document.removeEventListener("paste", paste, true);
  }, []);
  return null;
}

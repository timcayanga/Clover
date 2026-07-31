"use client";

import { useEffect } from "react";

const closeControlSelector = [
  "[data-modal-close]",
  'button[aria-label*="close" i]',
  'button[aria-label*="dismiss" i]',
  'button[aria-label*="cancel" i]',
  'button[aria-label*="back" i]',
  'button[title*="close" i]',
].join(",");

const findDismissControl = (modal: HTMLElement) => {
  const labeledControls = Array.from(modal.querySelectorAll<HTMLElement>(closeControlSelector));
  const textControls = Array.from(modal.querySelectorAll<HTMLButtonElement>('button[type="button"]')).filter((button) =>
    /^(?:back|cancel|close|done|cancel upload)$/i.test(button.textContent?.trim() ?? "")
  );

  return [...labeledControls, ...textControls].find((control) => {
    const button = control instanceof HTMLButtonElement ? control : null;
    return !button?.disabled && control.getAttribute("aria-disabled") !== "true";
  }) ?? null;
};

const getTopmostModal = () => {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
    .filter((dialog) => {
      const style = window.getComputedStyle(dialog);
      return style.display !== "none" && style.visibility !== "hidden" && dialog.getClientRects().length > 0;
    });

  return dialogs.reduce<HTMLElement | null>((topmost, dialog) => {
    if (!topmost) {
      return dialog;
    }

    const currentZIndex = Number.parseInt(window.getComputedStyle(dialog).zIndex, 10) || 0;
    const topmostZIndex = Number.parseInt(window.getComputedStyle(topmost).zIndex, 10) || 0;
    return currentZIndex >= topmostZIndex ? dialog : topmost;
  }, null);
};

export function ModalKeyboardController() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const modal = getTopmostModal();
      if (!modal) {
        return;
      }

      if (event.key === "Escape") {
        const closeControl = findDismissControl(modal);
        if (!closeControl) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        closeControl.click();
        return;
      }

      // Native buttons and form controls already implement Enter and Space.
      // Mirror that behavior for any custom button used inside a modal.
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const customButton = target?.closest<HTMLElement>('[role="button"]:not(button):not(a)');
      if (!customButton || !modal.contains(customButton) || customButton.getAttribute("aria-disabled") === "true") {
        return;
      }

      event.preventDefault();
      customButton.click();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return null;
}

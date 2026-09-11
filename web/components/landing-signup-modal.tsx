"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ClerkAuthScreen } from "@/components/clerk-auth-screen";

type LandingSignupModalProps = {
  enabled: boolean;
  children: ReactNode;
};

export function LandingSignupModal({ enabled, children }: LandingSignupModalProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;
    if (!panel) return;
    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== "hidden" && !element.closest('[inert]'));
    const focusFirst = () => (focusable()[0] ?? panel).focus();
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) focusFirst();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const targets = focusable();
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (!first || !last) {
          event.preventDefault(); panel.focus();
        } else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("focusin", containFocus);
    focusFirst();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("focusin", containFocus);
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!enabled) {
    return (
      <Link className="button button-primary button-pill" href="/sign-up" prefetch={false}>
        {children}
      </Link>
    );
  }

  return (
    <>
      <button ref={triggerRef} className="button button-primary button-pill" type="button" onClick={() => setOpen(true)}>
        {children}
      </button>

      {open ? createPortal(
        <div className="landing-signup-modal" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            ref={panelRef}
            tabIndex={-1}
            className="landing-signup-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-signup-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="landing-signup-modal__close"
              type="button"
              aria-label="Close signup"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
            <div className="landing-signup-modal__intro">
              <p className="eyebrow">Start with Clover</p>
              <h2 id="landing-signup-modal-title">Create your free account</h2>
              <p>Start organizing your finances, then continue into onboarding.</p>
            </div>
            <ClerkAuthScreen enabled mode="sign-up" completeRedirectUrl="/onboarding" />
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ClerkAuthScreen } from "@/components/clerk-auth-screen";

type LandingSignupModalProps = {
  enabled: boolean;
  children: ReactNode;
};

export function LandingSignupModal({ enabled, children }: LandingSignupModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
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
      <button className="button button-primary button-pill" type="button" onClick={() => setOpen(true)}>
        {children}
      </button>

      {open ? (
        <div className="landing-signup-modal" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
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
        </div>
      ) : null}
    </>
  );
}

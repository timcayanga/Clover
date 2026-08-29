"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "clover.home.balance-hidden.v1";

const applyHomeAmountVisibility = (hidden: boolean) => {
  document.body.toggleAttribute("data-clover-home-balances-hidden", hidden);
  document.querySelectorAll<HTMLElement>("[data-home-sensitive-amount]").forEach((amount) => {
    const actual = amount.querySelector<HTMLElement>(".home-sensitive-amount__actual");
    const mask = amount.querySelector<HTMLElement>(".home-sensitive-amount__mask");
    actual?.setAttribute("aria-hidden", hidden ? "true" : "false");
    mask?.setAttribute("aria-hidden", hidden ? "false" : "true");
  });
};

export function BalanceVisibilityToggle() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) === "true";
    setHidden(stored);
    applyHomeAmountVisibility(stored);

    return () => {
      document.body.removeAttribute("data-clover-home-balances-hidden");
    };
  }, []);

  const toggle = () => {
    setHidden((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      applyHomeAmountVisibility(next);
      return next;
    });
  };

  return (
    <button
      className={`dashboard-home__balance-visibility${hidden ? " is-hidden" : ""}`}
      type="button"
      aria-label={hidden ? "Show balances" : "Hide balances"}
      aria-pressed={hidden}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {hidden ? (
          <>
            <path d="M4 14c2.2-2.5 4.9-3.8 8-3.8s5.8 1.3 8 3.8" />
            <path d="m6.2 15.2-1.3 1.6M10 16.7l-.4 2M14 16.7l.4 2M17.8 15.2l1.3 1.6" />
          </>
        ) : (
          <>
            <path d="M2.8 12s3.2-5 9.2-5 9.2 5 9.2 5-3.2 5-9.2 5-9.2-5-9.2-5Z" />
            <circle cx="12" cy="12" r="2.4" />
          </>
        )}
      </svg>
    </button>
  );
}

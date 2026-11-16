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
    let stored = true;
    try { stored = window.localStorage.getItem(STORAGE_KEY) === "true"; } catch { /* Keep amounts private if storage is unavailable. */ }
    setHidden(stored);
    applyHomeAmountVisibility(stored);

    const observer = new MutationObserver(() => applyHomeAmountVisibility(document.body.hasAttribute("data-clover-home-balances-hidden")));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.body.removeAttribute("data-clover-home-balances-hidden");
    };
  }, []);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try { window.localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* Toggling remains available for this page. */ }
    applyHomeAmountVisibility(next);
  };

  return (
    <button
      className={`dashboard-home__balance-visibility${hidden ? " is-hidden" : ""}`}
      type="button"
      aria-label={hidden ? "Show balances" : "Hide balances"}
      aria-pressed={hidden}
      onClick={toggle}
    >
      {hidden ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 14c2.2-2.5 4.9-3.8 8-3.8s5.8 1.3 8 3.8" />
          <path d="m6.2 15.2-1.3 1.6M10 16.7l-.4 2M14 16.7l.4 2M17.8 15.2l1.3 1.6" />
        </svg>
      ) : <img src="/figma-icons/home/eye-open.svg" alt="" aria-hidden="true" width={20} height={20} />}
    </button>
  );
}

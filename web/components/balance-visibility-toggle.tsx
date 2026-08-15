"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "clover.home.balance-hidden.v1";

export function BalanceVisibilityToggle() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) === "true";
    setHidden(stored);
    document.body.toggleAttribute("data-clover-home-balances-hidden", stored);

    return () => {
      document.body.removeAttribute("data-clover-home-balances-hidden");
    };
  }, []);

  const toggle = () => {
    setHidden((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      document.body.toggleAttribute("data-clover-home-balances-hidden", next);
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
        <path d="M2.8 12s3.2-5 9.2-5 9.2 5 9.2 5-3.2 5-9.2 5-9.2-5-9.2-5Z" />
        <circle cx="12" cy="12" r="2.4" />
        <path className="dashboard-home__balance-visibility-slash" d="m4 4 16 16" />
      </svg>
    </button>
  );
}

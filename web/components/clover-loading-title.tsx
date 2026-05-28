"use client";

import { useEffect, useState } from "react";

const loadingTitles = [
  "Bringing your money into focus",
  "Finding clarity in your cash flow",
  "Getting your finances ready",
  "Building your next money move",
] as const;

const TITLE_INTERVAL_MS = 2400;

function getCurrentTitleIndex() {
  return Math.floor(Date.now() / TITLE_INTERVAL_MS) % loadingTitles.length;
}

export function CloverLoadingTitle() {
  const [titleIndex, setTitleIndex] = useState(getCurrentTitleIndex);

  useEffect(() => {
    const updateTitle = () => setTitleIndex(getCurrentTitleIndex());
    updateTitle();

    const interval = window.setInterval(updateTitle, TITLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <h2 suppressHydrationWarning>
      {loadingTitles[titleIndex]}
    </h2>
  );
}

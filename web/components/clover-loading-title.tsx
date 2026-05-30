"use client";

import { useEffect, useState } from "react";

const loadingTitles = [
  "Bringing your money into focus",
  "Finding clarity in your cash flow",
  "Getting your finances ready",
  "Building your next money move",
] as const;

const TITLE_INTERVAL_MS = 2400;

function getRandomTitleIndex(currentIndex?: number) {
  if (loadingTitles.length <= 1) {
    return 0;
  }

  let nextIndex = Math.floor(Math.random() * loadingTitles.length);
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * loadingTitles.length);
  }

  return nextIndex;
}

export function CloverLoadingTitle() {
  const [titleIndex, setTitleIndex] = useState(() => getRandomTitleIndex());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTitleIndex((currentIndex) => getRandomTitleIndex(currentIndex));
    }, TITLE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <h2 suppressHydrationWarning>
      {loadingTitles[titleIndex]}
    </h2>
  );
}

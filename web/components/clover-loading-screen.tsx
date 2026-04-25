"use client";

import { useEffect, useState } from "react";

type CloverLoadingScreenProps = {
  label?: string;
};

const loadingStages = [
  {
    headline: "Growing your Clover view",
    detail: "One leaf at a time, your workspace is taking shape.",
  },
  {
    headline: "Shaping the next layer",
    detail: "Clover is pulling in the newest data and settling it in.",
  },
  {
    headline: "Keeping the flow steady",
    detail: "We are tuning the details so the page feels ready fast.",
  },
  {
    headline: "Almost there",
    detail: "Clover is wrapping up the last leaf before you land.",
  },
] as const;

const cloverPaths = {
  topLeft:
    "M-8.74228e-07 40C-1.35705e-06 28.9543 8.9543 20 20 20C20 8.9543 28.9543 -1.26563e-06 40 -1.74845e-06C51.0457 -2.23128e-06 60 8.9543 60 20L60 60L20 60C8.95431 60 -3.91405e-07 51.0457 -8.74228e-07 40Z",
  bottomLeft:
    "M40 124C28.9543 124 20 115.046 20 104C8.9543 104 -2.53127e-06 95.0457 -3.49691e-06 84C-4.46256e-06 72.9543 8.9543 64 20 64L60 64L60 104C60 115.046 51.0457 124 40 124Z",
  bottomRight:
    "M124 84C124 95.0457 115.046 104 104 104C104 115.046 95.0457 124 84 124C72.9543 124 64 115.046 64 104L64 64L104 64C115.046 64 124 72.9543 124 84Z",
  topRight:
    "M124 40C124 51.0457 112.807 60 99 60C94.5563 60 90.3837 59.0716 86.7676 57.4453L84.0713 60.1426L75.4639 51.5352L88 39L85.1719 36.1719L72.6357 48.707L64 40.0713L66.6416 37.4287C64.9604 33.7678 64 29.524 64 25C64 11.1929 72.9543 8.05776e-07 84 0H124V40Z",
  stem: "M32 146C55.2012 145.897 62.0608 139.623 61.9996 116",
};

export function CloverLoadingScreen({ label = "page" }: CloverLoadingScreenProps) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStage((current) => (current + 1) % loadingStages.length);
    }, 820);

    return () => window.clearInterval(timer);
  }, []);

  const current = loadingStages[stage];

  return (
    <div className="clover-loading-screen" role="status" aria-live="polite" aria-label={`Loading ${label}`}>
      <div className="clover-loading-screen__card glass">
        <div className="clover-loading-screen__logo" aria-hidden="true">
          <svg className="clover-loading-screen__mark" viewBox="0 0 124 148" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              className={`clover-loading-screen__leaf clover-loading-screen__leaf--accent ${stage >= 0 ? "is-visible" : ""}`}
              d={cloverPaths.topRight}
            />
            <path className={`clover-loading-screen__leaf ${stage >= 1 ? "is-visible" : ""}`} d={cloverPaths.topLeft} />
            <path className={`clover-loading-screen__leaf ${stage >= 2 ? "is-visible" : ""}`} d={cloverPaths.bottomLeft} />
            <path className={`clover-loading-screen__leaf ${stage >= 3 ? "is-visible" : ""}`} d={cloverPaths.bottomRight} />
            <path className="clover-loading-screen__stem" d={cloverPaths.stem} />
          </svg>
        </div>

        <div className="clover-loading-screen__copy">
          <p className="eyebrow">Loading {label}</p>
          <h2>{current.headline}</h2>
          <p>{current.detail}</p>
        </div>
      </div>
    </div>
  );
}

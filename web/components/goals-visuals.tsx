"use client";

import type { GoalKey } from "@/lib/goals";

type GoalVisualProps = {
  goalKey: GoalKey;
  title?: string;
  subtitle?: string;
  progress?: number;
  compact?: boolean;
};

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function GoalGlyph({ goalKey }: { goalKey: GoalKey }) {
  switch (goalKey) {
    case "save_more":
      return (
        <svg {...iconProps}>
          <path d="M7 7h10v11H7z" />
          <path d="M12 4v3" />
          <path d="M9 13.5h6" />
          <path d="M10 16.5h4" />
        </svg>
      );
    case "pay_down_debt":
      return (
        <svg {...iconProps}>
          <path d="M6 16.5c2.5-1.5 4-4.5 4-8V5" />
          <path d="M10 5h5" />
          <path d="m13 8 2-3 2 3" />
          <path d="M14 11v8" />
        </svg>
      );
    case "track_spending":
      return (
        <svg {...iconProps}>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="m15 15 4 4" />
          <path d="M8.5 10.5h4" />
        </svg>
      );
    case "build_emergency_fund":
      return (
        <svg {...iconProps}>
          <path d="M12 4 6 7v5c0 4 2.4 6.8 6 8 3.6-1.2 6-4 6-8V7z" />
          <path d="M12 8v6" />
          <path d="M9.5 11h5" />
        </svg>
      );
    case "invest_better":
      return (
        <svg {...iconProps}>
          <path d="M12 4.5 15.8 8.3 12 19.5 8.2 8.3Z" />
          <path d="M12 4.5v15" />
          <path d="M8.5 11.5h7" />
        </svg>
      );
  }
}

export function GoalIllustration({ goalKey, title, subtitle, progress = 0, compact = false }: GoalVisualProps) {
  const progressWidth = Math.max(10, Math.min(100, progress));

  const scene = (() => {
    switch (goalKey) {
      case "save_more":
        return (
          <>
            <rect x="34" y="126" width="30" height="44" rx="12" fill="rgba(34,197,94,0.22)" />
            <rect x="76" y="104" width="30" height="66" rx="12" fill="rgba(34,197,94,0.4)" />
            <rect x="118" y="84" width="30" height="86" rx="12" fill="rgba(3,168,192,0.38)" />
            <rect x="160" y="58" width="30" height="112" rx="12" fill="rgba(3,168,192,0.62)" />
            <path d="M45 110c10-18 20-28 30-30s22 0 34 8 24 10 40 8 28-8 40-22" stroke="rgba(3,168,192,0.9)" strokeWidth="4" fill="none" strokeLinecap="round" />
            <circle cx="152" cy="54" r="12" fill="rgba(34,197,94,0.2)" />
            <path d="M152 48v12M146 54h12" stroke="rgba(34,197,94,0.95)" strokeWidth="2.5" strokeLinecap="round" />
          </>
        );
      case "pay_down_debt":
        return (
          <>
            <path d="M34 148h160" stroke="rgba(15,23,42,0.12)" strokeWidth="3" strokeLinecap="round" />
            <path d="M54 148v-18h26v-20h26v-24h26v-28h26v-22h26" stroke="rgba(3,168,192,0.85)" strokeWidth="5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <path d="M160 58 180 40m0 0v18m0-18h-18" stroke="rgba(34,197,94,0.95)" strokeWidth="4" strokeLinecap="round" />
            <circle cx="58" cy="146" r="10" fill="rgba(239,68,68,0.18)" />
            <circle cx="112" cy="146" r="10" fill="rgba(239,68,68,0.12)" />
          </>
        );
      case "track_spending":
        return (
          <>
            <circle cx="110" cy="92" r="48" fill="rgba(3,168,192,0.08)" stroke="rgba(3,168,192,0.16)" strokeWidth="2" />
            <circle cx="110" cy="92" r="28" fill="rgba(255,255,255,0.88)" stroke="rgba(3,168,192,0.55)" strokeWidth="4" />
            <path d="m140 122 30 30" stroke="rgba(3,168,192,0.88)" strokeWidth="8" strokeLinecap="round" />
            <rect x="40" y="132" width="24" height="24" rx="8" fill="rgba(34,197,94,0.28)" />
            <rect x="72" y="110" width="24" height="46" rx="8" fill="rgba(3,168,192,0.42)" />
            <rect x="104" y="98" width="24" height="58" rx="8" fill="rgba(3,168,192,0.58)" />
            <rect x="136" y="118" width="24" height="38" rx="8" fill="rgba(3,168,192,0.28)" />
          </>
        );
      case "build_emergency_fund":
        return (
          <>
            <path d="M66 64 110 42l44 22v36c0 28-17 50-44 62-27-12-44-34-44-62z" fill="rgba(3,168,192,0.12)" stroke="rgba(3,168,192,0.7)" strokeWidth="3" />
            <path d="M110 66v64" stroke="rgba(34,197,94,0.95)" strokeWidth="5" strokeLinecap="round" />
            <path d="M88 96h44" stroke="rgba(34,197,94,0.95)" strokeWidth="5" strokeLinecap="round" />
            <circle cx="110" cy="112" r="16" fill="rgba(34,197,94,0.2)" />
          </>
        );
      case "invest_better":
        return (
          <>
            <circle cx="110" cy="92" r="56" fill="rgba(3,168,192,0.08)" stroke="rgba(3,168,192,0.18)" strokeWidth="2" />
            <path d="M110 48v88" stroke="rgba(3,168,192,0.75)" strokeWidth="5" strokeLinecap="round" />
            <path d="M110 48 146 92 110 136 74 92Z" fill="rgba(255,255,255,0.88)" stroke="rgba(34,197,94,0.85)" strokeWidth="4" />
            <path d="M128 74 156 60" stroke="rgba(34,197,94,0.95)" strokeWidth="4" strokeLinecap="round" />
            <path d="M96 118 64 138" stroke="rgba(3,168,192,0.55)" strokeWidth="4" strokeLinecap="round" />
          </>
        );
    }
  })();

  return (
    <section className={`goal-illustration ${compact ? "is-compact" : ""}`} aria-label={title ?? "Goal illustration"}>
      <div className="goal-illustration__head">
        <div>
          <p className="eyebrow">Goal visual</p>
          <h4>{title ?? "Coach view"}</h4>
        </div>
        <div className="goal-illustration__badge">
          <GoalGlyph goalKey={goalKey} />
        </div>
      </div>
      <p className="goal-illustration__copy">{subtitle ?? "A visual cue for the lane you chose in onboarding."}</p>
      <div className="goal-illustration__art">
        <svg viewBox="0 0 220 180" role="img" aria-hidden="true">
          <defs>
            <linearGradient id={`goal-illustration-${goalKey}`} x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(34,197,94,0.92)" />
              <stop offset="100%" stopColor="rgba(3,168,192,0.88)" />
            </linearGradient>
          </defs>
          <rect x="18" y="20" width="184" height="140" rx="28" fill="rgba(255,255,255,0.78)" stroke="rgba(15,23,42,0.06)" />
          <circle cx="36" cy="34" r="7" fill="rgba(34,197,94,0.25)" />
          <circle cx="54" cy="34" r="7" fill="rgba(3,168,192,0.25)" />
          <circle cx="72" cy="34" r="7" fill="rgba(245,158,11,0.2)" />
          <path d="M42 132c18-14 36-18 54-12s36 18 54 14 30-16 42-32" stroke="rgba(3,168,192,0.28)" strokeWidth="8" fill="none" strokeLinecap="round" />
          <g>{scene}</g>
          <rect x="38" y="150" width={progressWidth * 1.42} height="10" rx="999" fill={`url(#goal-illustration-${goalKey})`} />
        </svg>
      </div>
      <div className="goal-illustration__metrics">
        <div>
          <strong>{Math.round(progress)}%</strong>
          <span>Momentum</span>
        </div>
        <div>
          <strong>{goalKey.replace("_", " ")}</strong>
          <span>Active lane</span>
        </div>
      </div>
    </section>
  );
}

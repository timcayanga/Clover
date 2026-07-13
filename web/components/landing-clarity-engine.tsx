import Image from "next/image";
import type { CSSProperties } from "react";

const engineStages = [
  "Gathering your records",
  "Organizing transactions",
  "Finding useful patterns",
  "Your financial picture is ready",
] as const;

export function LandingClarityEngine() {
  return (
    <div
      className="clarity-engine"
      role="img"
      aria-label="Bank statements, receipts, screenshots, and spreadsheets becoming organized Clover transactions and accounts"
    >
      <div className="clarity-engine__glow" aria-hidden="true" />
      <div className="clarity-engine__canvas" aria-hidden="true">
        <div className="clarity-engine__layer clarity-engine__layer--sources">
          <Image
            className="clarity-engine__image"
            src="/assets/landing page/hero card.png"
            alt=""
            fill
            priority
            sizes="(max-width: 720px) 100vw, 56vw"
          />
        </div>
        <div className="clarity-engine__layer clarity-engine__layer--workspace">
          <Image
            className="clarity-engine__image"
            src="/assets/landing page/hero card.png"
            alt=""
            fill
            priority
            sizes="(max-width: 720px) 100vw, 56vw"
          />
        </div>

        <div className="clarity-engine__pulse clarity-engine__pulse--a" />
        <div className="clarity-engine__pulse clarity-engine__pulse--b" />
        <div className="clarity-engine__scan">
          <Image src="/clover-mark.svg" alt="" width={32} height={32} />
        </div>

        <div className="clarity-engine__result-card">
          <span className="clarity-engine__result-kicker">This month</span>
          <strong>12 categories organized</strong>
          <span>288 transactions ready to explore</span>
        </div>
      </div>

      <div className="clarity-engine__status" aria-hidden="true">
        <span className="clarity-engine__status-dot" />
        <div className="clarity-engine__status-copy">
          {engineStages.map((stage, index) => (
            <span key={stage} style={{ "--engine-stage": index } as CSSProperties}>
              {stage}
            </span>
          ))}
        </div>
        <span className="clarity-engine__status-time">in minutes</span>
      </div>
    </div>
  );
}

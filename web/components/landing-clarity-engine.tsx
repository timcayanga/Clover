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
        <Image
          className="clarity-engine__image"
          src="/assets/landing page/hero card.png"
          alt=""
          fill
          priority
          sizes="(max-width: 720px) 100vw, 56vw"
        />
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

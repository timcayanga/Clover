import type { CSSProperties } from "react";

type TokenUsageDonutProps = {
  percent: number;
  label: string;
  compact?: boolean;
};

export function TokenUsageDonut({ percent, label, compact = false }: TokenUsageDonutProps) {
  const normalized = Math.min(100, Math.max(0, percent));
  const rounded = Math.round(normalized);
  return (
    <span
      className={`token-usage-donut${compact ? " token-usage-donut--compact" : ""}`}
      style={{ "--token-usage-angle": `${normalized * 3.6}deg` } as CSSProperties}
      role="img"
      aria-label={`${label}: ${rounded}% used`}
    >
      <span>{rounded}%</span>
    </span>
  );
}

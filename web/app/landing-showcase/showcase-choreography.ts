const ease = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return Math.max(0, Math.min(1, p * p * p * (p * (p * 6 - 15) + 10)));
};

/** Reversible stages share one scroll coordinate. Collapse before travelling so
 * the wide transaction never sweeps across the report's financial labels. */
export function purchaseChoreography(travel: number) {
  return {
    "--paper-fold": ease((travel - 0.18) / 0.55),
    "--paper-expand": ease((travel - 0.5) / 0.24),
    "--purchase-merge": ease((travel - 1.1) / 0.35),
    "--category-join": ease((travel - 1.4) / 0.4),
    "--purchase-away": ease((travel - 1.8) / 0.15),
    "--category-fill": ease((travel - 1.5) / 0.35),
    "--report-reveal": ease((travel - 0.85) / 0.45),
    "--category-glow": ease((travel - 1.5) / 0.3) * (1 - ease((travel - 1.85) / 0.15)),
  };
}

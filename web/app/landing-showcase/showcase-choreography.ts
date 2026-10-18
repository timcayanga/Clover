const ease = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return Math.max(0, Math.min(1, p * p * p * (p * (p * 6 - 15) + 10)));
};

/** Reversible stages share one scroll coordinate. Collapse before travelling so
 * the wide transaction never sweeps across the report's financial labels. */
export function purchaseChoreography(position: number, { trustInterlude = false } = {}) {
  // Pause the shared purchase while the short privacy chapter is visible.
  const travel = trustInterlude ? (position < 2 ? Math.min(position, 1) : position - 1) : position;
  return {
    "--purchase-presence": trustInterlude ? 1 - ease((position - .85) / .2) + ease((position - 1.85) / .2) : 1,
    "--purchase-arrival": ease((travel - 0.08) / 0.18),
    "--paper-fold": ease((travel - 0.12) / 0.48),
    "--paper-expand": ease((travel - 0.38) / 0.32),
    "--purchase-merge": ease((travel - 1.12) / 0.30),
    "--category-join": ease((travel - 1.45) / 0.28),
    "--purchase-away": ease((travel - 1.86) / 0.13),
    "--category-fill": ease((travel - 1.58) / 0.27),
    "--report-reveal": ease((travel - 0.82) / 0.36),
    "--category-glow": ease((travel - 1.58) / 0.24) * (1 - ease((travel - 1.87) / 0.12)),
  };
}

/** Give concise chapters less scroll time, while preserving a reversible timeline. */
export function storyTravel(progress: number, weights: readonly number[]) {
  if (!weights.length) return 0;
  const safe = weights.map(value => Number.isFinite(value) && value > 0 ? value : 1);
  let remaining = Math.max(0, Math.min(1, progress)) * safe.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < safe.length; index++) {
    if (remaining < safe[index]) return index + remaining / safe[index];
    remaining -= safe[index];
  }
  return safe.length;
}

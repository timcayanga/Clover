/** Matches mobile web: omit undefined baselines and avoid misleading giant percentages. */
export function homePeriodLabel(current: number, previous: number): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "—";
  if (previous < 0.005) return "No prior month";
  const percent = ((current - previous) / previous) * 100;
  if (!Number.isFinite(percent) || Math.abs(percent) >= 1000) return "—";
  if (Math.abs(percent) < 0.5) return "0%";
  return `${percent > 0 ? "↑" : "↓"} ${Math.abs(percent).toFixed(0)}%`;
}

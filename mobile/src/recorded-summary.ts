/** Unknown records never become zero, nor hide the records we can total. */
export function recordedSummary(values: readonly unknown[]) {
  const known = values.filter(value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)));
  return {
    value: known.length ? known.reduce<number>((sum, value) => sum + Number(value), 0) : null,
    known: known.length,
    missing: values.length - known.length,
  };
}

export function tokenUsagePercent(meter: { used: number; limit: number | null } | undefined) {
  if (!meter) return "—";
  if (meter.limit === null) return "Unlimited";
  if (meter.limit <= 0) return "Not available";
  const percent = Math.max(0, meter.used / meter.limit * 100);
  if (percent > 0 && percent < 1) return "<1% used";
  return `${Math.round(percent)}% used`;
}

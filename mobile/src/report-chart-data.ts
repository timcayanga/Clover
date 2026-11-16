export type ChartPoint = { date: string; value: number };

/** Preserve real date spacing and signed values; never manufacture missing data. */
export function reportChartData(
  series: { name: string; points: ChartPoint[] }[],
) {
  const clean = series.map((item) => ({
    ...item,
    points: item.points
      .filter(
        (point) =>
          Number.isFinite(point.value) &&
          Number.isFinite(Date.parse(point.date)),
      )
      .map((point) => ({ ...point, time: Date.parse(point.date) }))
      .sort((a, b) => a.time - b.time),
  }));
  const all = clean.flatMap((item) => item.points);
  if (!all.length) return null;
  const first = Math.min(...all.map((point) => point.time));
  const last = Math.max(...all.map((point) => point.time));
  const low = Math.min(...all.map((point) => point.value));
  const high = Math.max(...all.map((point) => point.value));
  const padding =
    high === low ? Math.max(Math.abs(high) * 0.1, 1) : (high - low) * 0.1;
  const min = low >= 0 ? Math.max(0, low - padding) : low - padding,
    max = high + padding;
  return {
    min,
    max,
    first,
    last,
    series: clean.map((item) => ({
      ...item,
      points: item.points.map((point) => ({
        ...point,
        x: first === last ? 0.5 : (point.time - first) / (last - first),
        y: 1 - (point.value - min) / (max - min),
      })),
    })),
  };
}

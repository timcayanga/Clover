"use client";
import { useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";
/** One shared scale makes comparisons meaningful; the values table is keyboard accessible. */
export function ReportsComparisonChart({
  series,
  currency,
}: {
  series: {
    name: string;
    color: string;
    points: { date: string; value: number }[];
  }[];
  currency: string;
}) {
  const [values, setValues] = useState(false);
  const dates = [
    ...new Set(series.flatMap((s) => s.points.map((p) => p.date))),
  ].sort();
  if (!dates.length) return <p>No dated history is available yet.</p>;
  const first = Date.parse(dates[0]),
    last = Date.parse(dates.at(-1)!);
  const all = series.flatMap((s) => s.points.map((p) => p.value));
  const min = Math.min(0, ...all),
    max = Math.max(1, ...all),
    span = Math.max(1, max - min);
  const x = (date: string) =>
    60 + ((Date.parse(date) - first) / Math.max(1, last - first)) * 670;
  const y = (value: number) => 20 + ((max - value) / span) * 185;
  const compact = (n: number) =>
    new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  return (
    <div className="report-comparison-chart">
      <svg
        viewBox="0 0 760 245"
        role="img"
        aria-label={`${series.map((s) => s.name).join(" and ")} in ${currency}, ${dates[0]} to ${dates.at(-1)}. Exact values below.`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={60}
              x2={730}
              y1={20 + f * 185}
              y2={20 + f * 185}
              stroke="currentColor"
              opacity=".15"
            />
            <text
              x={52}
              y={24 + f * 185}
              textAnchor="end"
              fill="currentColor"
              fontSize={12}
            >
              {compact(max - f * span)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={3}
              points={s.points
                .map((p) => `${x(p.date)},${y(p.value)}`)
                .join(" ")}
            />
            {s.points.length <= 24
              ? s.points.map((p) => (
                  <circle
                    key={p.date}
                    cx={x(p.date)}
                    cy={y(p.value)}
                    r={4}
                    fill={s.color}
                  >
                    <title>{`${s.name} · ${p.date} · ${formatCurrencyAmount(p.value, currency)}`}</title>
                  </circle>
                ))
              : null}
          </g>
        ))}
        <text x={60} y={234} fill="currentColor" fontSize={12}>
          {dates[0]}
        </text>
        <text
          x={730}
          y={234}
          textAnchor="end"
          fill="currentColor"
          fontSize={12}
        >
          {dates.at(-1)}
        </text>
      </svg>
      <div className="report-v2-actions">
        {series.map((s) => (
          <span key={s.name}>
            <span aria-hidden="true" style={{ color: s.color }}>
              ●{" "}
            </span>
            {s.name}
          </span>
        ))}
        <button
          className="report-text-action"
          aria-expanded={values}
          onClick={() => setValues(!values)}
        >
          {values ? "Hide values" : "Show values"}
        </button>
      </div>
      {values ? (
        <div
          className="report-v2-table"
          tabIndex={0}
          role="region"
          aria-label="Chart values, scroll horizontally"
        >
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {series.map((s) => (
                  <th key={s.name}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d}>
                  <th>{d}</th>
                  {series.map((s) => (
                    <td key={s.name}>
                      {s.points.find((p) => p.date === d)
                        ? formatCurrencyAmount(
                            s.points.find((p) => p.date === d)!.value,
                            currency,
                          )
                        : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

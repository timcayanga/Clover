"use client";

import { useMemo, useRef, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";

export type ReportsMoneyPoint = {
  date: string;
  balance: number;
};

const chartWidth = 760;
const chartHeight = 250;
const chartPadding = { top: 18, right: 118, bottom: 18, left: 12 };

const dateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const axisDateFormatter = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
});

const parseReportDate = (value: string) => new Date(`${value}T12:00:00`);

export function ReportsMoneyOverTimeChart({
  points,
  currency,
}: {
  points: ReportsMoneyPoint[];
  currency: string;
}) {
  const chartRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    const values = points.map((point) => point.balance);
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(0, ...values);
    const valueRange = Math.max(maximum - minimum, 1);
    const xSpan = chartWidth - chartPadding.left - chartPadding.right;
    const ySpan = chartHeight - chartPadding.top - chartPadding.bottom;
    const plotted = points.map((point, index) => ({
      ...point,
      x:
        chartPadding.left +
        (index / Math.max(points.length - 1, 1)) * xSpan,
      y:
        chartPadding.top +
        (1 - (point.balance - minimum) / valueRange) * ySpan,
    }));
    const path = plotted.reduce((result, point, index, allPoints) => {
      if (index === 0) return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      const previous = allPoints[index - 1];
      const midpoint = (previous.x + point.x) / 2;
      return `${result} C ${midpoint.toFixed(1)} ${previous.y.toFixed(1)}, ${midpoint.toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }, "");
    const ticks = Array.from({ length: 5 }, (_, index) => {
      const fraction = index / 4;
      return {
        value: maximum - valueRange * fraction,
        y: chartPadding.top + ySpan * fraction,
      };
    });
    const axisIndexes = Array.from(
      new Set(
        Array.from({ length: Math.min(6, points.length) }, (_, index) =>
          Math.round((index / Math.max(Math.min(6, points.length) - 1, 1)) * (points.length - 1)),
        ),
      ),
    );

    return { plotted, path, ticks, axisIndexes };
  }, [points]);

  const hovered = hoverIndex === null ? null : chart.plotted[hoverIndex] ?? null;

  const handlePointerMove = (clientX: number) => {
    const element = chartRef.current;
    if (!element || chart.plotted.length === 0) return;
    const bounds = element.getBoundingClientRect();
    const chartX = ((clientX - bounds.left) / Math.max(bounds.width, 1)) * chartWidth;
    const index = Math.round(
      ((chartX - chartPadding.left) /
        Math.max(chartWidth - chartPadding.left - chartPadding.right, 1)) *
        (chart.plotted.length - 1),
    );
    setHoverIndex(Math.max(0, Math.min(chart.plotted.length - 1, index)));
  };

  if (chart.plotted.length === 0) {
    return <div className="reports-money-chart__empty">No balance history is available for this period.</div>;
  }

  const latest = chart.plotted[chart.plotted.length - 1];
  const activePoint = hovered ?? latest;

  return (
    <div className="reports-money-chart">
      <div className="reports-money-chart__summary" aria-live="polite">
        <span>{dateFormatter.format(parseReportDate(activePoint.date))}</span>
        <strong>{formatCurrencyAmount(activePoint.balance, currency)}</strong>
      </div>
      <div className="reports-money-chart__plot">
        <svg
          ref={chartRef}
          className="reports-money-chart__svg"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Account balance over time"
          onPointerMove={(event) => handlePointerMove(event.clientX)}
          onPointerLeave={() => setHoverIndex(null)}
          onTouchMove={(event) => handlePointerMove(event.touches[0]?.clientX ?? 0)}
        >
          <defs>
            <linearGradient id="reportsMoneyBalanceFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(3, 168, 192, 0.22)" />
              <stop offset="100%" stopColor="rgba(3, 168, 192, 0.02)" />
            </linearGradient>
          </defs>
          {chart.ticks.map((tick) => (
            <line
              key={tick.y}
              className="reports-money-chart__gridline"
              x1={chartPadding.left}
              x2={chartWidth - chartPadding.right}
              y1={tick.y}
              y2={tick.y}
            />
          ))}
          <path
            className="reports-money-chart__area"
            d={`${chart.path} L ${latest.x} ${chartHeight - chartPadding.bottom} L ${chart.plotted[0].x} ${chartHeight - chartPadding.bottom} Z`}
          />
          <path className="reports-money-chart__line" d={chart.path} />
          {hovered ? (
            <>
              <line
                className="reports-money-chart__hover-line"
                x1={hovered.x}
                x2={hovered.x}
                y1={chartPadding.top}
                y2={chartHeight - chartPadding.bottom}
              />
              <circle
                className="reports-money-chart__hover-dot"
                cx={hovered.x}
                cy={hovered.y}
                r="6"
              />
            </>
          ) : null}
        </svg>
        <div className="reports-money-chart__y-axis" aria-hidden="true">
          {chart.ticks.map((tick) => (
            <span key={tick.y} style={{ top: `${(tick.y / chartHeight) * 100}%` }}>
              {formatCurrencyAmount(tick.value, currency)}
            </span>
          ))}
        </div>
      </div>
      <div className="reports-money-chart__x-axis" aria-hidden="true">
        {chart.axisIndexes.map((index) => (
          <span key={chart.plotted[index].date}>
            {axisDateFormatter.format(parseReportDate(chart.plotted[index].date))}
          </span>
        ))}
      </div>
    </div>
  );
}

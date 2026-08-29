"use client";

import { useMemo, useRef, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";

export type ReportsMoneyPoint = {
  date: string;
  balance: number;
};

const chartWidth = 760;
const chartHeight = 250;
const chartPadding = { top: 18, right: 0, bottom: 18, left: 0 };

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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const chart = useMemo(() => {
    const values = points.map((point) => point.balance);
    const observedMinimum = Math.min(...values);
    const observedMaximum = Math.max(...values);
    const observedRange = observedMaximum - observedMinimum;
    const domainPadding =
      observedRange > 0
        ? observedRange * 0.14
        : Math.max(Math.abs(observedMaximum) * 0.005, 1);
    const minimum = observedMinimum - domainPadding;
    const maximum = observedMaximum + domainPadding;
    const valueRange = maximum - minimum;
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

  const getIndexAtClientX = (clientX: number) => {
    const element = chartRef.current;
    if (!element || chart.plotted.length === 0) return null;
    const bounds = element.getBoundingClientRect();
    const chartX = ((clientX - bounds.left) / Math.max(bounds.width, 1)) * chartWidth;
    const index = Math.round(
      ((chartX - chartPadding.left) /
        Math.max(chartWidth - chartPadding.left - chartPadding.right, 1)) *
        (chart.plotted.length - 1),
    );
    return Math.max(0, Math.min(chart.plotted.length - 1, index));
  };

  const handlePointerMove = (clientX: number) => {
    setHoverIndex(getIndexAtClientX(clientX));
  };

  const handlePointerSelection = (clientX: number) => {
    setSelectedIndex(getIndexAtClientX(clientX));
  };

  if (chart.plotted.length === 0) {
    return <div className="reports-money-chart__empty">No balance history is available for this period.</div>;
  }

  const latest = chart.plotted[chart.plotted.length - 1];
  const interactionIndex = hoverIndex ?? selectedIndex;
  const interactionPoint = interactionIndex === null ? null : chart.plotted[interactionIndex] ?? null;
  const activePoint = interactionPoint ?? latest;
  const hoveredChange =
    interactionIndex === null || interactionIndex === 0
      ? null
      : activePoint.balance - chart.plotted[interactionIndex - 1].balance;
  const hoverLeft = interactionPoint ? (interactionPoint.x / chartWidth) * 100 : 0;
  const hoverTop = interactionPoint ? (interactionPoint.y / chartHeight) * 100 : 0;
  const tooltipClassName = [
    "reports-money-chart__tooltip",
    hoverLeft > 72 ? "reports-money-chart__tooltip--left" : "",
    hoverTop < 30 ? "reports-money-chart__tooltip--below" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <div className="report-card__head reports-money-over-time__head">
        <div className="report-card__head-title">
          <h4 className="reports-money-over-time__title">Money over time</h4>
        </div>
        <div className="report-card__stat reports-money-over-time__stat" aria-live="polite">
          <strong>{formatCurrencyAmount(activePoint.balance, currency)}</strong>
          <span>
            {interactionPoint
              ? `Balance on ${dateFormatter.format(parseReportDate(activePoint.date))}`
              : `Current balance · ${dateFormatter.format(parseReportDate(activePoint.date))}`}
          </span>
        </div>
      </div>
      <div className="reports-money-chart">
      <div className="reports-money-chart__plot">
        <svg
          ref={chartRef}
          className="reports-money-chart__svg"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Account balance over time"
          onPointerMove={(event) => handlePointerMove(event.clientX)}
          onPointerDown={(event) => handlePointerSelection(event.clientX)}
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
          {interactionPoint ? (
            <line
              className="reports-money-chart__hover-line"
              x1={interactionPoint.x}
              x2={interactionPoint.x}
              y1={chartPadding.top}
              y2={chartHeight - chartPadding.bottom}
            />
          ) : null}
        </svg>
        {interactionPoint ? (
          <>
            <span
              className="reports-money-chart__hover-dot"
              style={{ left: `${hoverLeft}%`, top: `${hoverTop}%` }}
              aria-hidden="true"
            />
            <div
              className={tooltipClassName}
              style={{ left: `${hoverLeft}%`, top: `${hoverTop}%` }}
              role="status"
            >
              <span>{dateFormatter.format(parseReportDate(interactionPoint.date))}</span>
              <strong>{formatCurrencyAmount(interactionPoint.balance, currency)}</strong>
              {hoveredChange === null ? null : (
                <small className={hoveredChange >= 0 ? "positive" : "negative"}>
                  {hoveredChange >= 0 ? "+" : ""}
                  {formatCurrencyAmount(hoveredChange, currency)} that day
                </small>
              )}
            </div>
          </>
        ) : null}
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
    </>
  );
}

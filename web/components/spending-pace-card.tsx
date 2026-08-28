"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";
import type { SpendingPaceDriver, SpendingPacePoint } from "@/lib/spending-pace";

type SpendingPaceCardProps = {
  currency: string;
  currentLabel: string;
  previousLabel: string;
  comparableDay: number;
  latestDateLabel: string;
  currentTotal: number;
  previousTotal: number;
  currentDailyAverage: number;
  previousDailyAverage: number;
  deltaPercent: number | null;
  points: SpendingPacePoint[];
  drivers: Array<SpendingPaceDriver & { href: string }>;
  transactionsHref: string;
  adviserHref: string;
};

const chart = { width: 760, height: 286, left: 58, right: 18, top: 24, bottom: 42 };
const plotWidth = chart.width - chart.left - chart.right;
const plotHeight = chart.height - chart.top - chart.bottom;

const compactCurrency = (value: number, currency: string) => {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${value < 0 ? "-" : ""}${formatCurrencyAmount(absolute / 1_000_000, currency).replace(/\.00$/, "")}M`;
  if (absolute >= 1_000) return `${value < 0 ? "-" : ""}${formatCurrencyAmount(absolute / 1_000, currency).replace(/\.00$/, "")}k`;
  return formatCurrencyAmount(value, currency).replace(/\.00$/, "");
};

export function SpendingPaceCard(props: SpendingPaceCardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeDay, setActiveDay] = useState(props.comparableDay);
  const maximum = Math.max(1, ...props.points.map((point) => Math.max(point.current ?? 0, point.previous ?? 0)));
  const maxDay = Math.max(props.points.length, 1);
  const xForDay = (day: number) => chart.left + ((day - 1) / Math.max(maxDay - 1, 1)) * plotWidth;
  const yForValue = (value: number) => chart.top + plotHeight - (value / maximum) * plotHeight;
  const currentPoints = props.points.filter((point) => point.current !== null);
  const comparablePreviousPoints = props.points.filter((point) => point.previousComparable && point.previous !== null);
  const remainingPreviousPoints = props.points.filter((point) => point.day >= props.comparableDay && point.previous !== null);
  const toPolyline = (points: SpendingPacePoint[], key: "current" | "previous") =>
    points.map((point) => `${xForDay(point.day)},${yForValue(Number(point[key] ?? 0))}`).join(" ");
  const activePoint = props.points.find((point) => point.day === activeDay) ?? props.points[props.points.length - 1];
  const deltaCopy = props.deltaPercent === null
    ? "No comparable spending last month"
    : `${Math.abs(props.deltaPercent).toFixed(0)}% ${props.deltaPercent >= 0 ? "higher" : "lower"} than the same period last month`;
  const yTicks = useMemo(() => [0, 0.5, 1].map((ratio) => ({ ratio, value: maximum * ratio })), [maximum]);

  const updateActiveDay = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * chart.width;
    const day = Math.round(((relativeX - chart.left) / plotWidth) * Math.max(maxDay - 1, 1) + 1);
    const nextDay = Math.min(Math.max(day, 1), maxDay);
    setActiveDay((current) => current === nextDay ? current : nextDay);
  };

  return (
    <article className="report-card reports-subtab-card spending-pace glass">
      <div className="spending-pace__header">
        <div>
          <p className="eyebrow">Matched-period comparison</p>
          <h4 className="reports-subtab-title">Spending Pace</h4>
          <strong className="spending-pace__headline">{formatCurrencyAmount(props.currentTotal, props.currency)} spent through day {props.comparableDay}</strong>
          <p className={`spending-pace__delta${props.deltaPercent !== null && props.deltaPercent > 0 ? " is-higher" : ""}`}>{deltaCopy}</p>
        </div>
        <span className="spending-pace__freshness">Latest recorded transaction · {props.latestDateLabel}</span>
      </div>

      <div className="spending-pace__layout">
        <div className="spending-pace__visual">
          <div className="spending-pace__legend" aria-hidden="true">
            <span><i className="spending-pace__swatch spending-pace__swatch--current" />{props.currentLabel}</span>
            <span><i className="spending-pace__swatch spending-pace__swatch--previous" />{props.previousLabel}</span>
            <span><i className="spending-pace__swatch spending-pace__swatch--remainder" />Later {props.previousLabel}</span>
          </div>
          <svg
            ref={svgRef}
            className="spending-pace__chart"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            role="img"
            aria-label={`Cumulative spending in ${props.currentLabel} through day ${props.comparableDay}, compared with the same days in ${props.previousLabel}`}
            onPointerMove={updateActiveDay}
            onPointerDown={updateActiveDay}
          >
            <defs>
              <linearGradient id="spending-pace-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#35b878" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#35b878" stopOpacity="0" />
              </linearGradient>
            </defs>
            {yTicks.map(({ ratio, value }) => {
              const y = chart.top + plotHeight - ratio * plotHeight;
              return <g key={ratio}><line x1={chart.left} x2={chart.width - chart.right} y1={y} y2={y} className="spending-pace__grid-line" /><text x={chart.left - 10} y={y + 4} textAnchor="end" className="spending-pace__axis-label">{compactCurrency(value, props.currency)}</text></g>;
            })}
            {[1, 5, 10, props.comparableDay, 20, 25, maxDay].filter((day, index, all) => day <= maxDay && all.indexOf(day) === index).map((day) => (
              <text key={day} x={xForDay(day)} y={chart.height - 13} textAnchor="middle" className="spending-pace__axis-label">{day}</text>
            ))}
            {currentPoints.length > 1 ? (
              <polygon
                points={`${xForDay(1)},${chart.top + plotHeight} ${toPolyline(currentPoints, "current")} ${xForDay(currentPoints[currentPoints.length - 1].day)},${chart.top + plotHeight}`}
                fill="url(#spending-pace-fill)"
              />
            ) : null}
            <polyline points={toPolyline(comparablePreviousPoints, "previous")} className="spending-pace__line spending-pace__line--previous" />
            <polyline points={toPolyline(remainingPreviousPoints, "previous")} className="spending-pace__line spending-pace__line--remainder" />
            <polyline points={toPolyline(currentPoints, "current")} className="spending-pace__line spending-pace__line--current" />
            <line x1={xForDay(props.comparableDay)} x2={xForDay(props.comparableDay)} y1={chart.top} y2={chart.top + plotHeight} className="spending-pace__today-line" />
            {activePoint ? (
              <g className="spending-pace__focus">
                <line x1={xForDay(activePoint.day)} x2={xForDay(activePoint.day)} y1={chart.top} y2={chart.top + plotHeight} />
                {activePoint.current !== null ? <circle cx={xForDay(activePoint.day)} cy={yForValue(activePoint.current)} r="5" className="spending-pace__point spending-pace__point--current" /> : null}
                {activePoint.previous !== null ? <circle cx={xForDay(activePoint.day)} cy={yForValue(activePoint.previous)} r="5" className="spending-pace__point spending-pace__point--previous" /> : null}
              </g>
            ) : null}
          </svg>
          {activePoint ? (
            <div className="spending-pace__tooltip" aria-live="polite">
              <strong>Day {activePoint.day}</strong>
              <span>{props.currentLabel}: {activePoint.current === null ? "Not reached" : formatCurrencyAmount(activePoint.current, props.currency)}</span>
              <span>{props.previousLabel}: {activePoint.previous === null ? "No equivalent date" : formatCurrencyAmount(activePoint.previous, props.currency)}</span>
            </div>
          ) : null}
        </div>

        <aside className="spending-pace__aside">
          <div className="spending-pace__periods">
            <div><span>{props.currentLabel} 1–{props.comparableDay}</span><strong>{formatCurrencyAmount(props.currentTotal, props.currency)}</strong><small>{formatCurrencyAmount(props.currentDailyAverage, props.currency)}/day</small></div>
            <div><span>{props.previousLabel} 1–{props.comparableDay}</span><strong>{formatCurrencyAmount(props.previousTotal, props.currency)}</strong><small>{formatCurrencyAmount(props.previousDailyAverage, props.currency)}/day</small></div>
          </div>
          <div className="spending-pace__drivers">
            <h5>What changed</h5>
            {props.drivers.length > 0 ? props.drivers.map((driver) => (
              <Link key={driver.category} href={driver.href}>
                <span>{driver.category}</span>
                <strong className={driver.delta > 0 ? "is-higher" : "is-lower"}>{driver.delta > 0 ? "+" : "−"}{formatCurrencyAmount(Math.abs(driver.delta), props.currency)}</strong>
              </Link>
            )) : <p>There is not enough category activity to explain the change yet.</p>}
          </div>
          <div className="spending-pace__actions">
            <Link className="button button-primary button-small" href={props.transactionsHref}>View transactions</Link>
            <Link className="button button-secondary button-small" href={props.adviserHref}>Ask Adviser</Link>
          </div>
        </aside>
      </div>
    </article>
  );
}

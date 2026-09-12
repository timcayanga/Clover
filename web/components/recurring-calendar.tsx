"use client";
import { InterfaceIcon } from "@/components/interface-icon";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { FinancialCommitmentSummary } from "@/lib/commitments";
import {
  buildRecurringCalendarOccurrences,
  getRecurringCalendarYearOptions,
  toRecurringCalendarDateKey,
} from "@/lib/recurring-calendar";
import { recurringPaymentAmount } from "@/lib/recurring-tracking";
import { formatCurrencyAmount } from "@/lib/currency-format";

const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat("en-PH", { month: "long" }).format(new Date(2026, month, 1)),
);
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const kindLabels: Record<FinancialCommitmentSummary["kind"], string> = {
  planned_payment: "Planned Payments",
  debt: "Debt & Loans",
  receivable: "Money Owed",
  reminder: "Installments",
};

const changeMonth = (year: number, month: number, offset: number) => {
  const next = new Date(year, month + offset, 1, 12);
  return { year: next.getFullYear(), month: next.getMonth() };
};

const formatCommitmentAmount = (commitment: FinancialCommitmentSummary, compact = false, occurrenceDate?: string) => {
  if (recurringPaymentAmount(commitment, occurrenceDate) === null || !Number.isFinite(recurringPaymentAmount(commitment, occurrenceDate))) return "No amount set";
  return compact ? new Intl.NumberFormat("en-PH", { style: "currency", currency: commitment.currency, notation: "compact", maximumFractionDigits: 1 }).format(recurringPaymentAmount(commitment, occurrenceDate)!) : formatCurrencyAmount(recurringPaymentAmount(commitment, occurrenceDate)!, commitment.currency);
};

export function RecurringCalendar({
  commitments,
  comprehensive,
  onSelectCommitment,
}: {
  commitments: FinancialCommitmentSummary[];
  comprehensive: boolean;
  onSelectCommitment: (commitment: FinancialCommitmentSummary, occurrenceDate: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const now = new Date();
  const currentYear = now.getFullYear();
  const [selectedYear, setSelectedYear] = useState(() => now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => now.getMonth());
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const todayKey = toRecurringCalendarDateKey(now);
  const occurrences = useMemo(
    () => buildRecurringCalendarOccurrences(commitments, selectedYear, selectedMonth),
    [commitments, selectedMonth, selectedYear],
  );
  const yearOptions = useMemo(
    () => getRecurringCalendarYearOptions(commitments, currentYear),
    [commitments, currentYear],
  );
  const eventsByDay = useMemo(() => {
    const grouped = new Map<number, typeof occurrences>();
    for (const occurrence of occurrences) {
      const current = grouped.get(occurrence.day) ?? [];
      current.push(occurrence);
      grouped.set(occurrence.day, current);
    }
    return grouped;
  }, [occurrences]);

  const firstWeekday = new Date(selectedYear, selectedMonth, 1, 12).getDay();
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0, 12).getDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const navigateMonth = (offset: number) => {
    const next = changeMonth(selectedYear, selectedMonth, offset);
    setSelectedYear(next.year);
    setSelectedMonth(next.month);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
    navigateMonth(deltaX < 0 ? 1 : -1);
  };

  return (
    <section className="recurring-calendar panel glass" aria-label={`${monthNames[selectedMonth]} ${selectedYear} payment calendar`}>
      <header className="recurring-calendar__header">
        <div className="recurring-calendar__heading">
          <h2 className="recurring-calendar__eyebrow">Payment calendar</h2>
        </div>
        <div className="recurring-calendar__controls">
          <button
            type="button"
            className="recurring-calendar__today"
            onClick={() => {
              const today = new Date();
              setSelectedYear(today.getFullYear());
              setSelectedMonth(today.getMonth());
            }}
          >
            Today
          </button>
          <button type="button" className="recurring-calendar__nav" onClick={() => navigateMonth(-1)} aria-label="Previous month">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div className="recurring-calendar__date-picker" aria-live="polite"><InterfaceIcon name="date" size={16} />
            <label>
              <span className="sr-only">Month</span>
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))} aria-label="Calendar month">
                {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Year</span>
              <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} aria-label="Calendar year">
                {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
          </div>
          <button type="button" className="recurring-calendar__nav" onClick={() => navigateMonth(1)} aria-label="Next month">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </div>
      </header>

      <div className="recurring-calendar__legend" aria-label="Payment type colors">
        {(comprehensive ? Object.keys(kindLabels) : Array.from(new Set(commitments.map((item) => item.kind)))).map((kind) => (
          <span key={kind} data-kind={kind}><i aria-hidden="true" />{kindLabels[kind as keyof typeof kindLabels]}</span>
        ))}
      </div>

      <div
        className="recurring-calendar__grid"
        onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; }}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStart.current = null; }}
      >
        {weekdayNames.map((weekday) => <div key={weekday} className="recurring-calendar__weekday">{weekday}</div>)}
        {cells.map((day, index) => {
          if (day === null) return <div key={`empty-${index}`} className="recurring-calendar__day recurring-calendar__day--outside" aria-hidden="true" />;
          const dayEvents = eventsByDay.get(day) ?? [];
          const dateKey = toRecurringCalendarDateKey(new Date(selectedYear, selectedMonth, day, 12));
          return (
            <div key={dateKey} className={`recurring-calendar__day${dateKey === todayKey ? " is-today" : ""}`}>
              <span className="recurring-calendar__date">{day}</span>
              <div className="recurring-calendar__events">
                {dayEvents.slice(0, 3).map(({ commitment, dateKey: occurrenceKey }, eventIndex) => (
                  <button
                    key={`${commitment.id}-${occurrenceKey}`}
                    type="button"
                    className={`recurring-calendar__event${eventIndex === 2 ? " recurring-calendar__event--desktop-third" : ""}`}
                    data-kind={commitment.kind}
                    onClick={() => { setSelectedDay(occurrenceKey); onSelectCommitment(commitment, occurrenceKey); }}
                    title={`${commitment.title} · ${formatCommitmentAmount(commitment, false, occurrenceKey)}`}
                    aria-label={`Open ${commitment.title}, due ${monthNames[selectedMonth]} ${day}`}
                  >
                    <span>{commitment.title}</span>
                    <small>{formatCommitmentAmount(commitment, true, occurrenceKey)}</small>
                  </button>
                ))}
                {dayEvents.length > 3 ? <button type="button" className="recurring-calendar__more recurring-calendar__more--desktop" onClick={() => setSelectedDay(dateKey)} aria-label={`Show all ${dayEvents.length} bills due ${dateKey}`}>+{dayEvents.length - 3}</button> : null}
                {dayEvents.length > 2 ? <button type="button" className="recurring-calendar__more recurring-calendar__more--mobile" onClick={() => setSelectedDay(dateKey)} aria-label={`Show all ${dayEvents.length} bills due ${dateKey}`}>+{dayEvents.length - 2}</button> : null}
              </div>
            </div>
          );
        })}
      </div>
      {selectedDay && occurrences.some(o => o.dateKey === selectedDay) ? <div className="recurring-calendar__agenda"><strong>{selectedDay} · All bills due</strong>{occurrences.filter(o => o.dateKey === selectedDay).map(o => <button type="button" key={o.commitment.id} onClick={() => onSelectCommitment(o.commitment, o.dateKey)}>{o.commitment.title} · {formatCommitmentAmount(o.commitment, false, o.dateKey)}</button>)}</div> : null}
      <p className="recurring-calendar__gesture-hint">Swipe the calendar to move between months.</p>
    </section>
  );
}

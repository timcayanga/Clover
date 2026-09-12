"use client";
import { useState, type ReactNode } from "react";
import { ReportsTabIcon } from "@/components/reports-tabs";
import { InterfaceIcon } from "@/components/interface-icon";
export function ReportChartSwitch({
  title,
  bars,
  donut,
  table,
}: {
  title: string;
  bars: ReactNode;
  donut: ReactNode;
  table: ReactNode;
}) {
  const [view, setView] = useState("donut");
  return (
    <>
      <div className="report-card__head">
        <h4 className="reports-subtab-title">{title}</h4>
        <div
          className="report-chart-switch"
          role="group"
          aria-label="Chart type"
        >
          {["bars", "donut", "table"].map((type) => (
            <button
              key={type}
              type="button"
              aria-label={`${type[0].toUpperCase() + type.slice(1)} chart`}
              aria-pressed={type === view}
              title={type}
              onClick={() => setView(type)}
            >
              {type === "table" ? (
                <InterfaceIcon name="details" size={16} />
              ) : (
                <ReportsTabIcon
                  section={type === "bars" ? "spending" : "overview"}
                />
              )}
            </button>
          ))}
        </div>
      </div>
      {view === "bars" ? bars : view === "table" ? table : donut}
    </>
  );
}

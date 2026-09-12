"use client";
import type { ReactNode } from "react";
import { useCollectionSelection } from "@/components/collection-navigation";
import { ReportsTabIcon } from "@/components/reports-tabs";
import { InterfaceIcon } from "@/components/interface-icon";

export function PlanTabs({
  title,
  tabs,
}: {
  title?: ReactNode;
  tabs: { key: string; label: string; content: ReactNode }[];
}) {
  const [selection, select] = useCollectionSelection("tab");
  const active = tabs.some((tab) => tab.key === selection)
    ? selection
    : tabs[0]?.key;
  return (
    <>
      <div className="plan-detail-heading">
        {title}
        <div className="plan-tabs" role="tablist" aria-label="Detail sections">
          {tabs.map((tab, index) => (
            <button
              key={tab.key}
              id={`plan-tab-${tab.key}`}
              role="tab"
              type="button"
              aria-selected={active === tab.key}
              aria-controls={`plan-panel-${tab.key}`}
              tabIndex={active === tab.key ? 0 : -1}
              onClick={() => select(tab.key)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index - 1 + tabs.length) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : -1;
                if (next >= 0) {
                  event.preventDefault();
                  select(tabs[next].key);
                  document
                    .getElementById(`plan-tab-${tabs[next].key}`)
                    ?.focus();
                }
              }}
            >
              <span aria-hidden="true">
                {tab.key === "history" || tab.key === "transactions" ? (
                  <InterfaceIcon
                    name={tab.key === "history" ? "date" : "details"}
                    size={16}
                  />
                ) : (
                  <ReportsTabIcon
                    section={
                      tab.key === "overview"
                        ? "overview"
                        : tab.key === "roadmap"
                          ? "trends"
                          : "spending"
                    }
                  />
                )}
              </span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.key}
          id={`plan-panel-${tab.key}`}
          role="tabpanel"
          aria-labelledby={`plan-tab-${tab.key}`}
          hidden={active !== tab.key}
        >
          {tab.content}
        </div>
      ))}
    </>
  );
}

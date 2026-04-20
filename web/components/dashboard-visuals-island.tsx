"use client";

import dynamic from "next/dynamic";

type DashboardVisualsIslandProps = {
  currentNetDelta: number;
  currentExpense: number;
  monthPoints: Array<{
    key: string;
    label: string;
    net: number;
    x: number;
    y: number;
  }>;
  linePath: string;
  chartWidth: number;
  chartHeight: number;
  chartPadding: number;
  topCategoryRows: Array<{
    name: string;
    amount: number;
    share: number;
  }>;
};

const DashboardVisuals = dynamic(() => import("@/components/dashboard-visuals").then((module) => module.DashboardVisuals), {
  ssr: false,
  loading: () => (
    <section className="dashboard-visual-grid" aria-label="Loading dashboard visuals">
      <article className="glass dashboard-visual-card dashboard-visual-card--trend dashboard-visual-skeleton">
        <div className="dashboard-visual-card__head">
          <div className="dashboard-visual-skeleton__stack">
            <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
            <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
          </div>
          <span className="skeleton-block skeleton-block--line skeleton-block--line-short dashboard-visual-skeleton__pill" />
        </div>
        <div className="dashboard-visual-skeleton__chart">
          <div className="dashboard-visual-skeleton__spark">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="skeleton-block dashboard-visual-skeleton__dot" />
            ))}
          </div>
          <div className="dashboard-visual-skeleton__labels">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={index} className="skeleton-block skeleton-block--line dashboard-visual-skeleton__label" />
            ))}
          </div>
        </div>
      </article>

      <article className="glass dashboard-visual-card dashboard-visual-card--mix dashboard-visual-skeleton">
        <div className="dashboard-visual-card__head">
          <div className="dashboard-visual-skeleton__stack">
            <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
            <span className="skeleton-block skeleton-block--line skeleton-block--line-long" />
          </div>
          <span className="skeleton-block skeleton-block--line skeleton-block--line-short dashboard-visual-skeleton__pill" />
        </div>
        <div className="dashboard-visual-skeleton__bars">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="dashboard-visual-skeleton__bar">
              <span className="skeleton-block skeleton-block--line skeleton-block--line-short" />
              <span className="skeleton-block dashboard-visual-skeleton__bar-fill" />
            </div>
          ))}
        </div>
      </article>
    </section>
  ),
});

export function DashboardVisualsIsland(props: DashboardVisualsIslandProps) {
  return <DashboardVisuals {...props} />;
}

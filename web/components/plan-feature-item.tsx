"use client";

import { getPlanFeatureDetailByLabel } from "@/lib/plan-feature-details";

type PlanFeatureItemProps = {
  label: string;
  className?: string;
};

function InfoIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="plan-feature-item__info-icon">
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 8.5v4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <circle cx="10" cy="6.4" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function PlanFeatureItem({ label, className }: PlanFeatureItemProps) {
  const detail = getPlanFeatureDetailByLabel(label);

  return (
    <li className={`plan-feature-item${className ? ` ${className}` : ""}`}>
      <span className="plan-feature-item__check" aria-hidden="true">
        ✓
      </span>
      <span className="plan-feature-item__content">
        <span className="plan-feature-item__label">{label}</span>
        {detail ? (
          <span className="plan-feature-item__info-wrap">
            <button
              className="plan-feature-item__info-button"
              type="button"
              aria-label={`Show details for ${label}`}
              title={`Show details for ${label}`}
            >
              <InfoIcon />
            </button>
            <span className="plan-feature-item__tooltip" role="tooltip">
              <strong>{detail.title}</strong>
              <p>{detail.summary}</p>
              <div className="plan-feature-item__tooltip-grid">
                <div className="plan-feature-item__tooltip-column">
                  <span className="pill pill-subtle">{detail.freeLabel}</span>
                  <ul>
                    {detail.freeItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="plan-feature-item__tooltip-column plan-feature-item__tooltip-column--pro">
                  <span className="pill pill-good">{detail.proLabel}</span>
                  <ul>
                    {detail.proItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </span>
          </span>
        ) : null}
      </span>
    </li>
  );
}


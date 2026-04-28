"use client";

type InfoTooltipProps = {
  label: string;
  title?: string;
  align?: "left" | "right";
};

export function InfoTooltip({ label, title, align = "right" }: InfoTooltipProps) {
  return (
    <span className={`info-tooltip info-tooltip--${align}`}>
      <button className="info-tooltip__button" type="button" aria-label={title ?? label}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="info-tooltip__icon">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10 8.2v4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="10" cy="5.8" r="0.9" fill="currentColor" />
        </svg>
      </button>
      <span className="info-tooltip__panel" role="tooltip">
        {title ? <strong>{title}</strong> : null}
        <p>{label}</p>
      </span>
    </span>
  );
}

type InfoTipProps = {
  label: string;
  className?: string;
};

export function InfoTip({ label, className }: InfoTipProps) {
  return (
    <button
      className={`report-tip${className ? ` ${className}` : ""}`}
      type="button"
      aria-label={label}
      data-tip={label}
    >
      <svg aria-hidden="true" viewBox="0 0 20 20" className="report-tip__icon">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 8.2v4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="5.8" r="0.9" fill="currentColor" />
      </svg>
    </button>
  );
}

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
      i
    </button>
  );
}

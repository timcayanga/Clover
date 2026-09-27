"use client";

function SplitBillActionIcon() {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  return (
    <svg {...common}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function SplitBillActionButtons({
  className = "",
  onAddBill,
}: {
  className?: string;
  onAddBill: () => void;
}) {
  return (
    <div className={`split-bill-page-actions ${className}`.trim()}>
      <button className="button button-primary button-small transactions-action-button split-bill-action-button split-bill-action-button--add" type="button" aria-label="Add split bill" onClick={onAddBill}>
        <span className="button-icon" aria-hidden="true">
          <SplitBillActionIcon />
        </span>
        <span>Add Split Bill</span>
      </button>
    </div>
  );
}

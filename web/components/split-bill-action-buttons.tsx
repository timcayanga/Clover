"use client";

function SplitBillActionIcon({ name }: { name: "plus" | "upload" }) {
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

  if (name === "upload") {
    return (
      <svg {...common}>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M20 16v4H4v-4" />
      </svg>
    );
  }

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
  onUploadReceipt,
}: {
  className?: string;
  onAddBill: () => void;
  onUploadReceipt: () => void;
}) {
  return (
    <div className={`split-bill-page-actions ${className}`.trim()}>
      <button className="button button-secondary button-small transactions-action-button split-bill-action-button" type="button" onClick={onAddBill}>
        <span className="button-icon" aria-hidden="true">
          <SplitBillActionIcon name="plus" />
        </span>
        <span>Add Bill</span>
      </button>
      <button
        className="button button-primary button-small transactions-action-button transactions-toolbar-upload split-bill-action-button"
        type="button"
        onClick={onUploadReceipt}
      >
        <span className="button-icon" aria-hidden="true">
          <SplitBillActionIcon name="upload" />
        </span>
        <span>Upload Receipt</span>
      </button>
    </div>
  );
}

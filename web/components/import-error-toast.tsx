"use client";

import Link from "next/link";

type ImportErrorToastProps = {
  code: string;
  title: string;
  message: string;
  nextSteps: string[];
  fileName?: string | null;
  onClose: () => void;
};

const truncateMiddle = (value: string, maxLength = 52) => {
  if (value.length <= maxLength) {
    return value;
  }

  const extensionMatch = value.match(/(\.[a-z0-9]{2,8})$/i);
  const extension = extensionMatch?.[1] ?? "";
  const roomForName = Math.max(10, maxLength - extension.length - 1);
  const leading = Math.max(8, Math.ceil(roomForName * 0.6));
  const trailing = Math.max(5, roomForName - leading);
  return `${value.slice(0, leading)}…${value.slice(-trailing)}${extension}`;
};

export function ImportErrorToast({ code, title, message, nextSteps, fileName = null, onClose }: ImportErrorToastProps) {
  return (
    <aside className="import-error-toast glass" role="alert" aria-live="assertive">
      <div className="import-error-toast__eyebrow">Import issue</div>
      <div className="import-error-toast__title-row">
        <div className="import-error-toast__copy">
          <h4>{title}</h4>
          {fileName ? <p className="import-error-toast__file-name" title={fileName}>{truncateMiddle(fileName)}</p> : null}
          <p>{message}</p>
        </div>
        <button type="button" className="icon-button import-error-toast__close" onClick={onClose} aria-label="Close import error popup">
          ×
        </button>
      </div>

      <div className="import-error-toast__code">Import code {code}</div>

      <div className="import-error-toast__callout">If the file still matters, you can keep moving with manual entry below.</div>

      <ul className="import-error-toast__list">
        {nextSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ul>

      <div className="import-error-toast__actions">
        <Link href="/transactions?manual=1" className="button button-primary button-small" onClick={onClose} prefetch={false}>
          Add manually
        </Link>
        <Link href="/review" className="button button-secondary button-small" onClick={onClose} prefetch={false}>
          Check review
        </Link>
        <button type="button" className="button button-secondary button-small" onClick={onClose}>
          Dismiss
        </button>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";

type ImportErrorToastProps = {
  code: string;
  httpClass: string;
  title: string;
  message: string;
  nextSteps: string[];
  onClose: () => void;
};

export function ImportErrorToast({ code, httpClass, title, message, nextSteps, onClose }: ImportErrorToastProps) {
  return (
    <aside className="import-error-toast glass" role="alert" aria-live="assertive">
      <div className="import-error-toast__eyebrow">{httpClass}</div>
      <div className="import-error-toast__title-row">
        <div>
          <h4>{title}</h4>
          <p>{message}</p>
        </div>
        <button type="button" className="icon-button import-error-toast__close" onClick={onClose} aria-label="Close import error popup">
          ×
        </button>
      </div>

      <div className="import-error-toast__code">Technical code {code}</div>

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
      </div>
    </aside>
  );
}

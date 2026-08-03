"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { getClientDiagnostics } from "@/lib/client-diagnostics";

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

type BugReportWidgetProps = {
  workspaceId: string;
  reporterName: string;
  reporterEmail: string;
  onOpenChange?: (open: boolean) => void;
};

type AttachmentPayload = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

const fileToAttachment = (file: File) =>
  new Promise<AttachmentPayload>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read that image."));
        return;
      }
      resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
    };
    reader.onerror = () => reject(new Error("Unable to read that image."));
    reader.readAsDataURL(file);
  });

const BugIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8.2 8.2a5.4 5.4 0 0 1 7.6 0v7.1a3.8 3.8 0 0 1-7.6 0Z" />
    <path d="M12 3.8v3M4.8 10h3.4M15.8 10h3.4M4.8 15h3.4M15.8 15h3.4M7 5.8l2.1 2.1M17 5.8l-2.1 2.1M12 11v6" />
  </svg>
);

export function BugReportWidget({ workspaceId, reporterName, reporterEmail, onOpenChange }: BugReportWidgetProps) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState("");
  const [attachment, setAttachment] = useState<AttachmentPayload | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const setModalOpen = (nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (!nextOpen) {
      setMessage("");
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    document.body.setAttribute("data-clover-page-modal", "true");
    window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => {
      document.body.removeAttribute("data-clover-page-modal");
    };
  }, [open]);

  const handleAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMessage("Please choose an image.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setMessage("The image must be 2 MB or smaller.");
      return;
    }
    try {
      setAttachment(await fileToAttachment(file));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to attach that image.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedReport = report.trim();
    if (trimmedReport.length < 10) {
      setMessage("Please describe what happened in at least 10 characters.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          report: trimmedReport,
          attachment,
          workspaceId,
          sourcePage: window.location.href,
          clientDiagnostics: getClientDiagnostics(),
          device: {
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            screen: `${window.screen.width}x${window.screen.height}`,
            pixelRatio: window.devicePixelRatio,
            locale: navigator.language,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            online: navigator.onLine,
            buildId: document.body.dataset.buildId ?? "unknown",
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to send the report.");
      }
      setReport("");
      setAttachment(null);
      setMessage("Report sent. Thank you for helping improve Clover.");
      window.setTimeout(() => setModalOpen(false), 1400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send the report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        className="shell-bug-report-button"
        type="button"
        aria-label="Report a bug"
        title="Report a bug"
        onClick={() => setModalOpen(true)}
      >
        <BugIcon />
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="modal-backdrop bug-report-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
              <section
                className="modal-card glass bug-report-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="bug-report-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="modal-head">
                  <div>
                    <p className="eyebrow">Help improve Clover</p>
                    <h4 id="bug-report-title">Report a bug</h4>
                  </div>
                  <button className="bug-report-modal__close" type="button" aria-label="Close bug report" onClick={() => setModalOpen(false)}>
                    ×
                  </button>
                </div>
                <p className="bug-report-modal__copy">
                  Tell us what happened. Clover will include this page’s technical details and recent error logs, but not your financial records.
                </p>
                <form className="bug-report-form" onSubmit={handleSubmit}>
                  <label>
                    <span>What happened?</span>
                    <textarea
                      ref={textareaRef}
                      value={report}
                      maxLength={4000}
                      rows={6}
                      placeholder="What were you trying to do, and what went wrong?"
                      onChange={(event) => setReport(event.target.value)}
                    />
                  </label>
                  <div className="bug-report-form__attachment-row">
                    <label className="button button-secondary button-small bug-report-form__upload">
                      <input type="file" accept="image/*" onChange={handleAttachment} />
                      <span>{attachment ? "Change photo" : "Add photo"}</span>
                    </label>
                    {attachment ? (
                      <div className="bug-report-form__attachment">
                        <span title={attachment.name}>{attachment.name}</span>
                        <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attached photo">Remove</button>
                      </div>
                    ) : (
                      <span className="bug-report-form__optional">Optional, up to 2 MB</span>
                    )}
                  </div>
                  <div className="bug-report-form__reporter">
                    Sending as <strong>{reporterName}</strong>{reporterEmail ? ` · ${reporterEmail}` : ""}
                  </div>
                  {message ? <p className="bug-report-form__message" role="status">{message}</p> : null}
                  <div className="bug-report-form__actions">
                    <button className="button button-secondary button-small" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
                    <button className="button button-primary button-small" type="submit" disabled={submitting}>{submitting ? "Sending..." : "Send report"}</button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

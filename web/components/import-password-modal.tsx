"use client";

import { useEffect, useRef, useState } from "react";
import { PasswordIcon } from "@/components/password-icon";

type PasswordImportFile = {
  id: string;
  name: string;
  error: string | null;
  password: string;
  passwordVisible: boolean;
};

type ImportPasswordModalProps = {
  open: boolean;
  files: PasswordImportFile[];
  activeFileId: string | null;
  validating: boolean;
  onCancel: (id: string) => void;
  onUnlock: (id: string, password: string) => void;
};

export function ImportPasswordModal({
  open,
  files,
  activeFileId,
  validating,
  onCancel,
  onUnlock,
}: ImportPasswordModalProps) {
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const activeFile = files.find((file) => file.id === activeFileId) ?? files[0] ?? null;
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);

  useEffect(() => {
    setPasswordDraft(activeFile?.password ?? "");
    setPasswordVisible(activeFile?.passwordVisible ?? false);
  }, [activeFile?.error, activeFile?.id, activeFile?.password, activeFile?.passwordVisible]);

  useEffect(() => {
    if (!open || !activeFile) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      passwordInputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeFile?.id, open]);

  useEffect(() => {
    if (!open || !activeFile) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel(activeFile.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFile?.id, onCancel, open]);

  if (!open || files.length === 0) {
    return null;
  }

  return (
    <div
      className="modal-backdrop import-password-layer"
      role="presentation"
      onClick={() => onCancel(activeFile.id)}
    >
      <section
        className="modal-card import-password-modal glass"
        role="dialog"
        aria-modal="true"
        aria-busy={validating}
        aria-labelledby="import-password-notice"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="import-password-close"
          type="button"
          onClick={() => onCancel(activeFile.id)}
          aria-label={`Cancel importing ${activeFile.name}`}
        >
          &times;
        </button>
        <div className="import-password-body">
          <p className="eyebrow" id="import-password-notice">Password required</p>
          <div className="import-password-file">
            <strong>{activeFile.name}</strong>
          </div>

          {activeFile.error ? <p className="import-password-error">{activeFile.error}</p> : null}

          <form
            className="import-password-form"
            onSubmit={(event) => {
              event.preventDefault();
              onUnlock(activeFile.id, passwordDraft);
            }}
          >
            <label className="import-password-field">
              <span>Password</span>
              <div className="import-password-input">
                <input
                  ref={passwordInputRef}
                  type={passwordVisible ? "text" : "password"}
                  value={passwordDraft}
                  onChange={(event) => setPasswordDraft(event.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  autoFocus
                  disabled={validating}
                />
                <button
                  className="import-password-toggle"
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  disabled={validating}
                >
                  <PasswordIcon visible={passwordVisible} />
                </button>
              </div>
            </label>

            <div className="import-password-actions">
              <button
                className="button button-primary button-small transactions-action-button"
                type="submit"
                disabled={validating || !passwordDraft.trim()}
              >
                {validating ? "Checking password..." : "Unlock file"}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

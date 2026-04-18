"use client";

import { PasswordIcon } from "@/components/password-icon";

type PasswordImportFile = {
  id: string;
  name: string;
  sizeLabel: string;
  error: string | null;
  password: string;
  passwordVisible: boolean;
};

type ImportPasswordModalProps = {
  open: boolean;
  files: PasswordImportFile[];
  activeFileId: string | null;
  busy: boolean;
  onClose: () => void;
  onSelectFile: (id: string) => void;
  onPasswordChange: (id: string, password: string) => void;
  onToggleVisibility: (id: string) => void;
  onUnlock: (id: string) => void;
};

export function ImportPasswordModal({
  open,
  files,
  activeFileId,
  busy,
  onClose,
  onSelectFile,
  onPasswordChange,
  onToggleVisibility,
  onUnlock,
}: ImportPasswordModalProps) {
  if (!open || files.length === 0) {
    return null;
  }

  const activeFile = files.find((file) => file.id === activeFileId) ?? files[0];

  return (
    <div className="modal-backdrop import-password-layer" role="presentation" onClick={onClose}>
      <section
        className="modal-card import-password-modal glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-password-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="import-password-header">
          <div>
            <p className="eyebrow">Password required</p>
            <h4 id="import-password-title">Unlock locked files</h4>
            <p className="modal-copy">These files are password-protected. Select one and enter its password to continue importing.</p>
          </div>
          <div className="import-password-count">
            <strong>{files.length}</strong>
            <span>
              file{files.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="import-password-layout">
          <aside className="import-password-list" aria-label="Files that need a password">
            {files.map((file) => {
              const isActive = file.id === activeFile.id;

              return (
                <button
                  key={file.id}
                  type="button"
                  className={`import-password-list__item ${isActive ? "is-active" : ""}`}
                  onClick={() => onSelectFile(file.id)}
                >
                  <div>
                    <strong>{file.name}</strong>
                    <span>{file.sizeLabel}</span>
                  </div>
                  <span className="import-password-list__item-status">Needs password</span>
                </button>
              );
            })}
          </aside>

          <div className="import-password-panel">
            <div className="import-password-panel__head">
              <strong>{activeFile.name}</strong>
              <span>{activeFile.sizeLabel}</span>
            </div>

            {activeFile.error ? <p className="import-password-error">{activeFile.error}</p> : null}

            <form
              className="import-password-form"
              onSubmit={(event) => {
                event.preventDefault();
                onUnlock(activeFile.id);
              }}
            >
              <label className="import-password-field">
                Password for {activeFile.name}
                <div className="import-password-input">
                  <input
                    type={activeFile.passwordVisible ? "text" : "password"}
                    value={activeFile.password}
                    onChange={(event) => onPasswordChange(activeFile.id, event.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                  />
                  <button
                    className="import-password-toggle"
                    type="button"
                    onClick={() => onToggleVisibility(activeFile.id)}
                    aria-label={activeFile.passwordVisible ? "Hide password" : "Show password"}
                  >
                    <PasswordIcon visible={activeFile.passwordVisible} />
                  </button>
                </div>
              </label>

              <div className="import-password-actions">
                <button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>
                  Close
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busy || !activeFile.password.trim()}
                >
                  {busy ? "Unlocking..." : "Unlock file"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

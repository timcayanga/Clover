"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import type { SplitBillPersonSummary } from "@/lib/split-bill-entities";

type SplitBillPersonModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: (person: SplitBillPersonSummary) => void;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload;
}

export function SplitBillPersonModal({ open, onClose, onSaved }: SplitBillPersonModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName("");
    setError(null);
    setIsSaving(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    document.body.dataset.splitBillModalOpen = "true";

    return () => {
      if (document.body.dataset.splitBillModalOpen === "true") {
        document.body.dataset.splitBillModalOpen = "false";
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const closeModal = () => {
    onClose();
  };

  const savePerson = async () => {
    const nextName = name.trim();

    if (!nextName) {
      setError("Add a name.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/split-bill-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
      const result = await readJsonResponse<{ person: SplitBillPersonSummary }>(response);
      onSaved?.(result.person);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save person");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="split-bill-modal" role="presentation" onClick={closeModal}>
      <section className="split-bill-modal__card glass split-bill-person-modal" role="dialog" aria-modal="true" aria-label="Add person" onClick={(event) => event.stopPropagation()}>
        <div className="split-bill-manual-modal__head">
          <div>
            <p className="eyebrow">Add People</p>
            <h3>Saved name</h3>
          </div>
          <button className="split-bill-icon-button" type="button" onClick={closeModal} aria-label="Close people window">
            ×
          </button>
        </div>

        <label className="settings-field">
          <span>Name</span>
          <input
            className="settings-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Jelly, Amanda, Chris"
            autoFocus
          />
        </label>

        <p className="split-bill-manual-modal__hint">People use initials only now.</p>

        {error ? <p className="split-bill-editor__error">{error}</p> : null}

        <div className="split-bill-manual-modal__actions">
          <button className="button button-primary" type="button" onClick={() => void savePerson()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Add person"}
          </button>
        </div>
      </section>
    </div>
  );
}

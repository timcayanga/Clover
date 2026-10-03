"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ReceiptDraftEditor } from "@/components/receipt-draft-editor";
import { containDialogFocus } from "@/lib/dialog-focus";

export function ReceiptDraftDialog({ importId, onClose, onSaved }: { importId: string; onClose: () => void; onSaved: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!dialogRef.current) return;
    const restoreFocus = containDialogFocus(dialogRef.current);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
    };
    document.addEventListener("keydown", escape);
    return () => { restoreFocus(); document.removeEventListener("keydown", escape); document.body.style.overflow = previousOverflow; };
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(<div className="modal-backdrop receipt-draft-layer">
    <section className="modal-card receipt-draft-dialog glass" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Review receipt" tabIndex={-1}>
      <button type="button" className="import-upload-dock__icon receipt-draft-dialog__close" aria-label="Close receipt review" onClick={onClose}>×</button>
      <ReceiptDraftEditor importId={importId} expected onSaved={onSaved}/>
    </section>
  </div>, document.body);
}

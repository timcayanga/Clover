"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function PlanDialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="settings-plan-dialog" onCancel={onClose} onClose={onClose} aria-label={title}>
    <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Close">×</button></header>
    {open ? children : null}
  </dialog>;
}

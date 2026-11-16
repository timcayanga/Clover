"use client";

import { useRef, useState, type ReactNode } from "react";

// Keep pending feedback local: saving should not rerender the account gallery
// before the browser can paint the disabled buttons.
export function AccountCreationForm({ onSave, children }: {
  onSave: (options: { keepOpen: boolean }) => Promise<void>;
  children: (saving: boolean, addAnother: () => void) => ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const save = async (keepOpen: boolean) => {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    try {
      await onSave({ keepOpen });
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return <form className="accounts-manual-form" onSubmit={(event) => {
    event.preventDefault();
    void save(false);
  }}>{children(saving, () => { void save(true); })}</form>;
}

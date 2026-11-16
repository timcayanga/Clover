// Isolated real-component regression harness; no app session or financial API.
import React, { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TransactionTagsEditor } from "../../components/transaction-tags-editor";
import { CurrencySelector } from "../../components/currency-selector";
import { containDialogFocus } from "../../lib/dialog-focus";
function Harness() {
  const [tags, setTags] = useState<string[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (open && dialog.current) return containDialogFocus(dialog.current);
  }, [open]);
  return <main>
    <h1>Transactions interaction regression</h1>
    <TransactionTagsEditor tags={tags} onChange={setTags} suggestions={["Groceries", "Travel"]} />
    <output aria-label="Saved tags">{JSON.stringify(tags)}</output>
    <button onClick={() => setOpen(true)}>Edit selected</button>
    {open ? <div className="modal-backdrop"><section className="modal-card" ref={dialog} role="dialog" aria-modal="true" aria-label="Edit selected" tabIndex={-1}
      onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
      <input aria-label="Name" />
      <CurrencySelector value={currency} onChange={setCurrency} options={["USD", "PHP"]} ariaLabel="Select transaction currency" portalMenu />
      <output aria-label="Selected currency">{currency}</output>
      <button onClick={() => setOpen(false)}>Cancel</button>
      <button onClick={() => setOpen(false)}>Save changes</button>
    </section></div> : null}
  </main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);

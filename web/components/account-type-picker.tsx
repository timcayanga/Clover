"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ACCOUNT_TYPE_SECTIONS, formatAccountTypeLabel, type SupportedAccountType } from "@/lib/account-types";
import { getAccountBrand } from "@/lib/account-brand";

export function AccountTypePicker({ value, onChange }: { value: SupportedAccountType; onChange: (value: SupportedAccountType) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const picker = root.current;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    picker?.addEventListener("keydown", dismiss);
    root.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      picker?.removeEventListener("keydown", dismiss);
    };
  }, [open]);
  return <div className="account-type-picker" data-escape-dismiss={open ? "local" : undefined} ref={root} onKeyDown={event => {
    if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      const index = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[index]?.focus();
    }
  }}>
    <button ref={trigger} type="button" aria-label="Account type" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><img src={getAccountBrand({type:value}).fallbackIconSrc} alt="" />{formatAccountTypeLabel(value)}<span aria-hidden="true">⌄</span></button>
    {open ? <div id={id} role="listbox" aria-label="Account type" className="account-type-picker__menu">{ACCOUNT_TYPE_SECTIONS.map(section => <div role="group" aria-label={section.label} key={section.label}><span className="account-type-picker__group">{section.label}</span>{section.options.map(type => <button key={type} type="button" role="option" aria-selected={value === type} tabIndex={-1} onClick={() => {onChange(type);setOpen(false);trigger.current?.focus();}}><img src={getAccountBrand({type}).fallbackIconSrc} alt="" />{formatAccountTypeLabel(type)}{value === type ? <span aria-hidden="true">✓</span> : null}</button>)}</div>)}</div> : null}
  </div>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { SORTED_INVESTMENT_SUBTYPES, getInvestmentSubtypeLabel } from "@/lib/investments";
import { emptyInvestmentRow, investmentTableFields as fields, investmentTableLabels as labels, investmentRowIssue, normalizeInvestmentTableCell, populatedInvestmentRow, type InvestmentTableRow } from "@/lib/investment-table-entry";
import { parseTablePaste } from "../../shared/transaction-table";
import "./transaction-table-entry.css";

export function InvestmentTableEntry({ workspaceId, currencies, currency, onSaved, onBusyChange }: {
  workspaceId: string; currencies: string[]; currency: string; onSaved: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const [rows, setRows] = useState<InvestmentTableRow[]>(() => [emptyInvestmentRow(crypto.randomUUID(), currency)]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (rows.some(row => populatedInvestmentRow(row) && row.status !== "saved")) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [rows]);
  const pending = rows.filter(row => populatedInvestmentRow(row) && !row.status);
  const patch = (key: string, field: typeof fields[number], value: string) => setRows(current => current.map(row => row.key === key ? { ...row, [field]: value, error: undefined } : row));
  const save = async () => {
    if (lock.current || !pending.length) return;
    if (rows.some(row => row.status === "uncertain")) { setError("Check the portfolio for the unconfirmed row before removing it from this draft. It will not be retried automatically."); return; }
    const invalid = pending.find(row => investmentRowIssue(row, currencies));
    if (invalid) { setRows(current => current.map(row => ({ ...row, error: !row.status && populatedInvestmentRow(row) ? investmentRowIssue(row, currencies) : row.error }))); return; }
    const keys = pending.map(row => [row.name.trim().toLowerCase(), row.institution.trim().toLowerCase(), row.currency.toUpperCase()].join("|"));
    if (new Set(keys).size !== keys.length) { setError("This draft contains duplicate investments. Give separate holdings distinct names before saving."); return; }
    lock.current = true; setBusy(true); onBusyChange(true); setError("");
    let changed = false;
    try {
      for (const row of pending) {
        try {
          const response = await fetch("/api/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, type: "investment", source: "manual", createOnly: true, name: row.name.trim(), institution: row.institution.trim() || null, investmentSubtype: row.investmentSubtype, currency: row.currency.toUpperCase(), balance: Number(row.balance) }) });
          // A server/network failure may occur after persistence; never silently retry it.
          if (response.status >= 500) throw new Error("Unconfirmed save");
          const payload = await response.json();
          if (!response.ok) { setRows(current => current.map(value => value.key === row.key ? { ...value, error: payload.error || "Unable to save this investment." } : value)); break; }
          if (!payload.account?.id) throw new Error("Unconfirmed save");
          changed = true;
          setRows(current => current.map(value => value.key === row.key ? { ...value, status: "saved", error: undefined } : value));
        } catch {
          setRows(current => current.map(value => value.key === row.key ? { ...value, status: "uncertain", error: "Save not confirmed. Check your portfolio before adding this investment again." } : value));
          changed = true; break;
        }
      }
    } finally { lock.current = false; setBusy(false); onBusyChange(false); if (changed) onSaved(); }
  };
  return <div className="table-entry investment-table-entry">
    <p className="panel-muted">Paste from Excel or Sheets. Required fields are marked *. Blank rows are ignored.</p>
    {error ? <p role="alert">{error}</p> : null}
    <div className="table-entry__desktop"><table aria-label="Investment table entry"><thead><tr>{fields.map(field => <th key={field} className={field === "institution" ? "" : "table-entry__required"}>{labels[field]}{field !== "institution" ? " *" : ""}</th>)}<th>Row actions</th></tr></thead><tbody>{rows.map((row, ri) => <tr key={row.key}>{fields.map((field, ci) => <td key={field} onPaste={event => {
      if (busy || row.status) return;
      const text = event.clipboardData.getData("text/plain"); if (!/[\t\n\r]/.test(text)) return;
      event.preventDefault();
      try {
        const cells = parseTablePaste(text);
        if (ri + cells.length > 50 || cells.some(values => ci + values.length > fields.length)) throw new Error("Paste up to 50 rows using the visible column order.");
        const next = rows.map(value => ({ ...value }));
        while (next.length < ri + cells.length) next.push(emptyInvestmentRow(crypto.randomUUID(), currency));
        cells.forEach((values, i) => { if (next[ri + i].status) throw new Error("Saved and unconfirmed rows cannot be overwritten."); values.forEach((value, j) => { next[ri + i][fields[ci + j]] = normalizeInvestmentTableCell(fields[ci + j], value); }); next[ri + i].error = undefined; });
        setRows(next); setError("");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to paste these cells."); }
    }}>
      {field === "investmentSubtype" ? <select aria-label={`Row ${ri + 1} investment type`} value={row[field]} disabled={busy || Boolean(row.status)} onChange={event => patch(row.key, field, event.target.value)}>{!SORTED_INVESTMENT_SUBTYPES.some(type => type === row[field]) ? <option value={row[field]}>{row[field] || "Choose type"}</option> : null}{SORTED_INVESTMENT_SUBTYPES.map(type => <option key={type} value={type}>{getInvestmentSubtypeLabel(type)}</option>)}</select> : field === "currency" ? <select aria-label={`Row ${ri + 1} currency`} value={row.currency} disabled={busy || Boolean(row.status)} onChange={event => patch(row.key, field, event.target.value)}>{!currencies.includes(row.currency) ? <option value={row.currency}>{row.currency || "Choose currency"}</option> : null}{currencies.map(code => <option key={code}>{code}</option>)}</select> : <input aria-label={`Row ${ri + 1} ${labels[field]}`} value={row[field]} disabled={busy || Boolean(row.status)} inputMode={field === "balance" ? "decimal" : undefined} onChange={event => patch(row.key, field, event.target.value)} />}
    </td>)}<td><span role="status">{row.status === "saved" ? "Saved" : row.error}</span>{row.status !== "saved" ? <button type="button" className="button button-secondary button-small" aria-label={`Remove row ${ri + 1}`} disabled={busy} onClick={() => setRows(current => current.filter(value => value.key !== row.key))}>Remove</button> : null}</td></tr>)}</tbody></table></div>
    <button className="button button-secondary" type="button" disabled={busy || rows.length >= 50} onClick={() => setRows(current => [...current, emptyInvestmentRow(crypto.randomUUID(), currency)])}>+ Add row</button>
    <footer><span aria-live="polite">{rows.filter(row => row.status === "saved").length} saved · {pending.length} to save</span><button className="button button-primary" type="button" disabled={busy || !pending.length || rows.some(row => row.status === "uncertain")} onClick={() => void save()}>{busy ? "Saving…" : "Save all investments"}</button></footer>
  </div>;
}

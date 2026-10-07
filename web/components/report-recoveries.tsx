"use client";
import { useState } from "react";
import {
  useRecoveryEditor,
  type RecoveryRequest,
} from "../../shared/reports/recovery-editor";
import type { RecoveryReport } from "../../shared/reports/workspace";
import { formatCurrencyAmount } from "@/lib/currency-format";
export function ReportRecoveries({
  report,
  currency,
  workspaceId,
  onChanged,
}: {
  report: RecoveryReport;
  currency: string;
  workspaceId: string;
  onChanged?: () => void | Promise<unknown>;
}) {
  const [limit, setLimit] = useState(20);
  const request: RecoveryRequest = async (query, body) => {
    const response = await fetch(
      `/api/reports/recoveries?workspaceId=${encodeURIComponent(workspaceId)}&${query}`,
      {
        method: body ? "POST" : "GET",
        cache: "no-store",
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      },
    );
    const data = await response.json();
    if (!response.ok)
      throw Error(data.error ?? "Unable to update the reporting link.");
    return data;
  };
  const e = useRecoveryEditor(useState, request, currency, onChanged),
    money = (n: number) => formatCurrencyAmount(n, currency);
  return (
    <section className="report-card glass report-v2-panel">
      <h2>Refunds and reimbursements</h2>
      <dl className="report-recovery-summary">
        {[
          ["Gross spending", report.gross],
          ["Linked refunds", report.refunds],
          ["Linked reimbursements", report.reimbursements],
          ["Personal cost", report.personalCost],
          ["Received for earlier expenses", report.receivedForEarlierExpenses],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{money(Number(value))}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>How personal cost is calculated</summary>
        {report.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
      </details>
      {e.busy ? <p role="status">Updating payment links…</p> : null}
      {e.error ? <p role="alert">{e.error}</p> : null}
      {e.notice ? <p role="status">{e.notice}</p> : null}
      {!e.open ? (
        <button
          className="report-text-action"
          disabled={e.busy}
          onClick={() => void e.start()}
        >
          Link a payment
        </button>
      ) : (
        <div className="report-recovery-editor">
          <h3>Link a refund or reimbursement</h3>
          <p>
            Choose an expense and money received in this Profile, using the same
            currency. Partial payments are supported. The original transactions
            stay unchanged.
          </p>
          <label>
            Type
            <select
              value={e.kind}
              disabled={e.busy}
              onChange={(v) =>
                e.setKind(v.target.value as "refund" | "reimbursement")
              }
            >
              <option value="refund">Refund</option>
              <option value="reimbursement">Reimbursement</option>
            </select>
          </label>
          {(["expense", "income"] as const).map((type) => {
            const selected = type === "expense" ? e.expense : e.incoming;
            return (
              <fieldset key={type} disabled={e.busy}>
                <legend>
                  {type === "expense" ? "Expense" : "Money received"}
                </legend>
                <label>
                  Search merchant or account
                  <input
                    type="search"
                    value={e.queries[type]}
                    maxLength={120}
                    onChange={(v) => e.setQuery(type, v.target.value)}
                  />
                </label>
                <button className="button button-secondary" onClick={() => void e.load(type)}>Search</button>
                {selected ? (
                  <p>
                    Selected: {selected.name} · {selected.date} ·{" "}
                    {money(selected.available)} available
                  </p>
                ) : null}
                <div className="report-recovery-choices">
                  {e.pages[type].candidates.map((c) => (
                    <label key={c.id}>
                      <input
                        type="radio"
                        name={`recovery-${workspaceId}-${currency}-${type}`}
                        checked={selected?.id === c.id}
                        onChange={() => e.choose(type, c)}
                      />
                      <span>
                        {c.name}
                        <small>
                          {c.date} · {c.account} · {money(c.available)}{" "}
                          available
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
                {!e.busy && !e.pages[type].candidates.length ? (
                  <p>
                    No results. Search again or record the transaction first.
                  </p>
                ) : null}
                {e.pages[type].nextOffset !== null ? (
                  <button className="button button-secondary" onClick={() => void e.load(type, true)}>
                    Load more
                  </button>
                ) : null}
              </fieldset>
            );
          })}
          <label>
            Amount to link ({currency})
            <input
              inputMode="decimal"
              value={e.amount}
              disabled={e.busy}
              onChange={(v) => e.setAmount(v.target.value)}
            />
          </label>
          <p>Only the unlinked part of each transaction can be allocated.</p>
          <div className="report-recovery-actions">
            <button className="button button-primary" disabled={!e.canSave} onClick={() => void e.save()}>
              {e.busy ? "Saving…" : "Confirm link"}
            </button>
            <button className="button button-secondary" disabled={e.busy} onClick={e.cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {report.links.slice(0, limit).map((l) => (
        <div className="report-recovery-link" key={l.id}>
          <p>
            {l.expenseName} · {l.expenseDate} → {l.incomingName} ·{" "}
            {l.receivedDate}
          </p>
          <p>
            {l.kind === "refund" ? "Refund" : "Reimbursement"} ·{" "}
            {money(l.amount)}
          </p>
          {l.issue ? <p>{l.issue}</p> : null}
          <button
            className="report-text-action"
            disabled={e.busy}
            onClick={() => void e.remove(l.id)}
          >
            Remove link
          </button>
        </div>
      ))}
      {report.links.length > limit ? (
        <button
          className="report-text-action"
          onClick={() => setLimit((n) => n + 20)}
        >
          Show more links
        </button>
      ) : null}
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import {
  emptyTableRow,
  populatedRow,
  tableFields,
  tableLabels,
  tableRowIssues,
  parseTablePaste,
  duplicateTableKeys,
  type TableRow,
  type TableOptions,
} from "../../shared/transaction-table";
import { clearAccountsWorkspaceCache } from "@/lib/workspace-cache";
import "./transaction-table-entry.css";
export function TransactionTableEntry({
  workspaceId,
  accounts,
  categories,
  onSaved,
  onLockChange,
}: {
  workspaceId: string;
  accounts: TableOptions["accounts"];
  categories: TableOptions["categories"];
  onSaved: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const [rows, setRows] = useState<TableRow[]>(() => [
    emptyTableRow(crypto.randomUUID()),
  ]);
  const [past, setPast] = useState<TableRow[][]>([]),
    [future, setFuture] = useState<TableRow[][]>([]);
  const [optional, setOptional] = useState<(keyof TableRow)[]>([]),
    [columnsOpen, setColumnsOpen] = useState(false);
  const [existingDuplicates, setExistingDuplicates] = useState(false);
  const [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState(""),
    [validate, setValidate] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [saved, setSaved] = useState(0),
    [confirmedDuplicates, setConfirmedDuplicates] = useState(false);
  const id = useRef(crypto.randomUUID()),
    lock = useRef(false),
    pending = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const options = { accounts, categories };
  const populated = rows.filter(populatedRow);
  const duplicates = duplicateTableKeys(rows);
  const fields: (keyof TableRow)[] = [
    ...tableFields,
    ...(rows.some((r) => r.type === "transfer")
      ? ["destinationAccountId" as const]
      : []),
    ...optional,
  ];
  const locked = busy || uncertain;
  useEffect(() => {
    onLockChange(locked);
    return () => onLockChange(false);
  }, [locked, onLockChange]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (populated.length && !saved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [populated.length, saved]);
  const change = (next: TableRow[]) => {
    if (locked) return;
    setPast((p) => [...p.slice(-49), rows]);
    setFuture([]);
    setRows(next);
    setConfirmedDuplicates(false);
    setSaved(0);
    setError("");
  };
  const patch = (key: string, field: keyof TableRow, value: string) =>
    change(
      rows.map((r) =>
        r.key !== key
          ? r
          : {
              ...r,
              [field]: value,
              ...(field === "accountId"
                ? {
                    currency:
                      accounts.find((a) => a.id === value)?.currency || "",
                  }
                : {}),
              ...(field === "type"
                ? { categoryId: "", destinationAccountId: "" }
                : {}),
            },
      ),
    );
  const append = () => {
    if (rows.length >= 50) {
      setError("Save this batch before adding more than 50 rows.");
      return;
    }
    const row = emptyTableRow(crypto.randomUUID());
    change([...rows, row]);
    setEditing(row.key);
  };
  const paste = (event: React.ClipboardEvent, ri: number, ci: number) => {
    const text = event.clipboardData.getData("text/plain");
    if (!/[\t\n\r]/.test(text)) return;
    event.preventDefault();
    try {
      const cells = parseTablePaste(text);
      if (ri + cells.length > 50)
        throw new Error("Paste up to 50 rows per batch.");
      if (cells.some((row) => ci + row.length > fields.length))
        throw new Error(
          "Your paste has more columns than are visible. Open Columns first, then paste again.",
        );
      const next = rows.map((r) => ({ ...r }));
      while (next.length < ri + cells.length)
        next.push(emptyTableRow(crypto.randomUUID()));
      cells.forEach((values, i) =>
        values.forEach((raw, j) => {
          const field = fields[ci + j];
          let value = raw.trim();
          const r = next[ri + i];
          if (
            field === "accountId" ||
            field === "destinationAccountId" ||
            field === "categoryId"
          ) {
            const list = field === "categoryId" ? categories : accounts;
            const matches = list.filter(
              (v) =>
                v.id === value || v.name.toLowerCase() === value.toLowerCase(),
            );
            if (value && matches.length !== 1)
              throw new Error(
                `Row ${ri + i + 1}: choose an unambiguous ${tableLabels[field].toLowerCase()} for “${value}”.`,
              );
            value = matches[0]?.id || "";
          }
          if (field === "type") {
            value = value.toLowerCase();
            if (!["expense", "income", "transfer"].includes(value))
              throw new Error(
                `Row ${ri + i + 1}: type must be Expense, Income or Transfer.`,
              );
          }
          if (field === "amount") value = value.replace(/,/g, "");
          Object.assign(r, { [field]: value });
          if (field === "accountId")
            r.currency = accounts.find((a) => a.id === value)?.currency || "";
        }),
      );
      change(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the pasted cells.");
    }
  };
  const save = async () => {
    if (lock.current) return;
    setValidate(true);
    if (!uncertain) {
      if (!populated.length) {
        setError("Add at least one transaction.");
        return;
      }
      if (
        populated.some((r) => Object.keys(tableRowIssues(r, options)).length)
      ) {
        setError("Fix the highlighted fields. No rows have been saved.");
        return;
      }
      if ((duplicates.size || existingDuplicates) && !confirmedDuplicates) {
        setError("Review the possible duplicate rows before saving.");
        return;
      }
      pending.current = JSON.stringify({
        id: id.current,
        workspaceId,
        rows: populated,
        duplicatesAcknowledged: confirmedDuplicates,
      });
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/transactions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: pending.current,
      });
      const data = await response.json();
      if (!response.ok) {
        if (
          response.status === 409 &&
          String(data.error).startsWith("Possible duplicates")
        ) {
          setExistingDuplicates(true);
          setConfirmedDuplicates(false);
        }
        if (response.status >= 500) setUncertain(true);
        else setUncertain(false);
        throw new Error(data.error || "Unable to save this batch.");
      }
      setSaved(populated.length);
      setExistingDuplicates(false);
      setConfirmedDuplicates(false);
      setUncertain(false);
      setRows([emptyTableRow(crypto.randomUUID())]);
      setPast([]);
      setFuture([]);
      setSelected([]);
      setEditing(null);
      id.current = crypto.randomUUID();
      pending.current = null;
      clearAccountsWorkspaceCache(workspaceId);
      onSaved();
    } catch (e) {
      if (e instanceof TypeError || e instanceof SyntaxError)
        setUncertain(true);
      setError(
        e instanceof Error
          ? e.message
          : "Could not confirm the save. Retry the same draft.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const control = (
    r: TableRow,
    field: keyof TableRow,
    ri: number,
    ci: number,
  ) => {
    const issue =
      validate && populatedRow(r)
        ? tableRowIssues(r, options)[field]
        : undefined;
    const props = {
      value: r[field],
      disabled: locked,
      "aria-label": `${tableLabels[field]}, row ${ri + 1}`,
      "aria-invalid": Boolean(issue),
      title: issue || tableLabels[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        patch(r.key, field, e.target.value),
      onPaste: (e: React.ClipboardEvent) => paste(e, ri, ci),
      "data-cell": `${ri}:${ci}`,
    };
    let element;
    if (field === "type")
      element = (
        <select {...props}>
          {["expense", "income", "transfer"].map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      );
    else if (field === "accountId" || field === "destinationAccountId")
      element = (
        <select {...props}>
          <option value="">Choose account</option>
          {accounts
            .filter((a) => a.type !== "investment")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
        </select>
      );
    else if (field === "categoryId")
      element = (
        <select {...props} disabled={locked || r.type === "transfer"}>
          <option value="">
            {r.type === "transfer" ? "Transfers" : "Choose category"}
          </option>
          {categories
            .filter((c) => c.type === r.type)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      );
    else
      element = (
        <input
          {...props}
          type={field === "date" ? "date" : "text"}
          inputMode={field === "amount" ? "decimal" : undefined}
          maxLength={field === "amount" ? 24 : 500}
          placeholder={field === "amount" ? "0.00" : undefined}
        />
      );
    return (
      <>
        {element}
        {issue ? <small className="table-entry__issue">{issue}</small> : null}
      </>
    );
  };
  const editingIndex = rows.findIndex((r) => r.key === editing);
  return (
    <div
      className="table-entry"
      ref={root}
      onKeyDown={(e) => {
        const target = e.target;
        if (
          !(
            target instanceof HTMLInputElement ||
            target instanceof HTMLSelectElement
          ) ||
          !target.dataset.cell ||
          locked
        )
          return;
        const [ri, ci] = target.dataset.cell.split(":").map(Number);
        const endTab =
          e.key === "Tab" &&
          !e.shiftKey &&
          ri === rows.length - 1 &&
          ci === fields.length - 1;
        if (
          (e.key === "Enter" && target instanceof HTMLInputElement) ||
          endTab
        ) {
          e.preventDefault();
          if (
            ri === rows.length - 1 &&
            rows.length < 50 &&
            populatedRow(rows[ri])
          )
            change([...rows, emptyTableRow(crypto.randomUUID())]);
          const nextColumn = endTab ? 0 : ci;
          requestAnimationFrame(() =>
            root.current
              ?.querySelector<HTMLElement>(
                `.table-entry__desktop [data-cell="${ri + 1}:${nextColumn}"]`,
              )
              ?.focus(),
          );
        }
      }}
    >
      <div className="table-entry__toolbar">
        <div>
          <h4>Add multiple transactions</h4>
          <p>Paste from Excel or Sheets. Required fields are marked *.</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => setColumnsOpen(!columnsOpen)}
          aria-expanded={columnsOpen}
        >
          Columns ⋮
        </button>
      </div>
      {columnsOpen ? (
        <fieldset className="table-entry__columns">
          <legend>Optional columns</legend>
          {(["currency", "tags", "notes"] as const).map((field) => (
            <label key={field}>
              <input
                type="checkbox"
                checked={optional.includes(field)}
                onChange={() =>
                  setOptional((current) =>
                    current.includes(field)
                      ? current.filter((f) => f !== field)
                      : [...current, field],
                  )
                }
              />
              {tableLabels[field]}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="table-entry__toolbar">
        <button
          type="button"
          className="button button-secondary"
          disabled={locked || !past.length}
          onClick={() => {
            setFuture((f) => [rows, ...f]);
            setRows(past.at(-1)!);
            setPast((p) => p.slice(0, -1));
          }}
        >
          Undo
        </button>
        <button
          type="button"
          className="button button-secondary"
          disabled={locked || !future.length}
          onClick={() => {
            setPast((p) => [...p, rows]);
            setRows(future[0]);
            setFuture((f) => f.slice(1));
          }}
        >
          Redo
        </button>
        {selected.length ? (
          <>
            <span>{selected.length} selected</span>
            <button
              type="button"
              className="button button-secondary"
              disabled={locked}
              onClick={() => {
                if (rows.length + selected.length > 50) {
                  setError("A batch can contain up to 50 rows.");
                  return;
                }
                change([
                  ...rows,
                  ...rows
                    .filter((r) => selected.includes(r.key))
                    .map((r) => ({ ...r, key: crypto.randomUUID() })),
                ]);
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={locked}
              onClick={() => {
                const first = rows.find((r) => selected.includes(r.key));
                if (first)
                  change(
                    rows.map((r) =>
                      selected.includes(r.key)
                        ? {
                            ...r,
                            accountId: first.accountId,
                            currency: first.currency,
                            categoryId: first.categoryId,
                            type: first.type,
                          }
                        : r,
                    ),
                  );
              }}
            >
              Fill type, account & category
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={locked}
              onClick={() => {
                change(rows.filter((r) => !selected.includes(r.key)));
                setSelected([]);
              }}
            >
              Delete rows
            </button>
          </>
        ) : null}
      </div>
      <div className="table-entry__desktop">
        <table>
          <thead>
            <tr>
              <th aria-label="Selection" />
              <th>#</th>
              {fields.map((f) => (
                <th
                  key={f}
                  className={
                    tableFields.includes(f as (typeof tableFields)[number])
                      ? "is-required"
                      : ""
                  }
                >
                  {tableLabels[f]}
                  {tableFields.includes(f as (typeof tableFields)[number])
                    ? " *"
                    : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={r.key}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select row ${ri + 1}`}
                    checked={selected.includes(r.key)}
                    onChange={() =>
                      setSelected((s) =>
                        s.includes(r.key)
                          ? s.filter((k) => k !== r.key)
                          : [...s, r.key],
                      )
                    }
                  />
                </td>
                <td>
                  {ri + 1}
                  {duplicates.has(r.key) ? (
                    <span title="Possible duplicate"> ⚠</span>
                  ) : null}
                </td>
                {fields.map((f, ci) => (
                  <td key={f}>{control(r, f, ri, ci)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-entry__mobile">
        {editingIndex < 0 ? (
          rows.map((r, i) => (
            <button
              type="button"
              className="table-entry__row"
              key={r.key}
              onClick={() => setEditing(r.key)}
            >
              <strong>
                {i + 1}. {r.merchant || "New transaction"}
              </strong>
              <span>
                {r.amount ? `${r.currency} ${r.amount}` : "Add details"} ›
              </span>
              {validate &&
              populatedRow(r) &&
              Object.keys(tableRowIssues(r, options)).length ? (
                <small>Check this row</small>
              ) : null}
            </button>
          ))
        ) : (
          <>
            <div className="table-entry__toolbar">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setEditing(null)}
              >
                Back to rows
              </button>
              <span>
                Row {editingIndex + 1} of {rows.length}
              </span>
            </div>
            {fields.map((f, ci) => (
              <label key={f}>
                {tableLabels[f]}
                {control(rows[editingIndex], f, editingIndex, ci)}
              </label>
            ))}
            <div className="table-entry__toolbar">
              <button
                type="button"
                className="button button-secondary"
                disabled={editingIndex === 0}
                onClick={() => setEditing(rows[editingIndex - 1].key)}
              >
                Previous
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={editingIndex === rows.length - 1}
                onClick={() => setEditing(rows[editingIndex + 1].key)}
              >
                Next
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={locked}
                onClick={() => {
                  change(rows.filter((r) => r.key !== editing));
                  setEditing(null);
                }}
              >
                Delete row
              </button>
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        className="button button-secondary"
        disabled={locked || rows.length >= 50}
        onClick={append}
      >
        + Add row
      </button>
      {duplicates.size || existingDuplicates ? (
        <label>
          <input
            type="checkbox"
            disabled={locked}
            checked={confirmedDuplicates}
            onChange={(e) => setConfirmedDuplicates(e.target.checked)}
          />{" "}
          I reviewed the possible duplicates and want to save these
          transactions.
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="table-entry__issue">
          {error}
        </p>
      ) : null}
      {uncertain ? (
        <p role="status">
          The save result is uncertain. Keep this draft unchanged and retry
          safely.
        </p>
      ) : null}
      {saved ? <p role="status">{saved} transactions saved.</p> : null}
      <footer className="table-entry__toolbar">
        <span>{populated.length} transactions · blank rows are ignored</span>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy
            ? "Saving…"
            : uncertain
              ? "Retry safely"
              : `Save ${populated.length || "all"} transactions`}
        </button>
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import { CollectionBack, useCollectionSelection } from "@/components/collection-navigation";
import { CollectionCard } from "@/components/collection-card";
import { getBudgetAppearance, budgetIcons } from "@/lib/budget-appearance";
import { formatCurrencyAmount } from "@/lib/currency-format";
import { formatAccountOptionLabel } from "@/lib/account-option-label";
import { ContextualAskClover } from "@/components/contextual-ask-clover";
import type { BudgetProgress, BudgetOverview, BudgetSuggestion, BudgetHistory } from "@/lib/budgeting";

type BudgetingData = {
  editorOptionsLoaded?: boolean;
  budgets: BudgetProgress[];
  overview: BudgetOverview;
  categories: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string; currency: string; type: string }>;
  suggestions: BudgetSuggestion[];
};
type BudgetForm = {
  name: string; emoji: string | null;
  kind: BudgetProgress["kind"]; scope: BudgetProgress["scope"]; cadence: BudgetProgress["cadence"];
  currency: string; targetAmount: string; accountId: string | null; categoryId: string | null;
};
const cadenceLabels = { daily: "Daily", weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", quarterly: "Quarterly", annual: "Yearly" };
const money = (value: number, currency: string) => formatCurrencyAmount(value, currency);
const percent = (value: number) => `${Math.max(0, Math.round(value))}%`;
const barWidth = (value: number) => `${Math.min(100, Math.max(0, value))}%`;

export function BudgetingWorkspace({ initialData }: { initialData: BudgetingData }) {
  const [data, setData] = useState(initialData);
  const [selectedId, selectBudget] = useCollectionSelection("budget");
  const [editorId, selectEditor] = useCollectionSelection("edit");
  const [mobile, setMobile] = useState(false);
  const [history, setHistory] = useState<BudgetHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const budgets = [...data.budgets, ...data.overview.inactiveBudgets];
  const selectedBudget = budgets.find((budget) => budget.id === selectedId) ?? null;
  const editingBudget = budgets.find((budget) => budget.id === editorId) ?? null;
  const editorOpen = editorId === "new" || Boolean(editingBudget);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelector(".content--budgeting")?.scrollTo({ top: 0, behavior: "instant" });
  }, [selectedId, editorId]);
  useEffect(() => {
    setHistory(null); setHistoryError(null);
    if (!selectedId) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/budgets/${encodeURIComponent(selectedId)}`, { signal: controller.signal });
        const result = await response.json() as { history?: BudgetHistory; error?: unknown };
        if (!response.ok || !result.history) throw new Error(typeof result.error === "string" ? result.error : "Unable to load budget history.");
        if (!controller.signal.aborted) setHistory(result.history);
      } catch (error) {
        if (!controller.signal.aborted) setHistoryError(error instanceof Error ? error.message : "Unable to load budget history.");
      }
    })();
    return () => controller.abort();
  }, [selectedId, historyVersion]);

  const updateAppearance = async (budget: BudgetProgress, name: string, emoji: string | null) => {
    const response = await fetch(`/api/budgets/${budget.id}/appearance`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, emoji }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error || "Unable to update this budget.");
    const replace = (item: BudgetProgress) => item.id === budget.id ? { ...item, name, emoji } : item;
    setData((current) => ({ ...current, budgets: current.budgets.map(replace), overview: { ...current.overview, budgets: current.overview.budgets.map(replace), inactiveBudgets: current.overview.inactiveBudgets.map(replace) } }));
  };
  const back = () => editorOpen ? selectEditor(null) : selectBudget(null);
  const mobileEditor = editorOpen && mobile;
  const title = mobileEditor ? (editingBudget ? "Edit Budget" : "Create Budget") : selectedBudget ? "Budget Details" : "Budgeting";
  return <CloverShell active="budgeting" title={title}
    mobileLeadingAction={selectedBudget || editorOpen ? <CollectionBack label="Budgeting" onClick={back} /> : undefined}
    desktopTitleAction={selectedBudget ? <CollectionBack label="All budgets" onClick={() => selectBudget(null)} /> : undefined}
    actions={!mobileEditor ? <div className="collection-toolbar-actions"><ContextualAskClover context="budgeting" /><button className="button button-primary button-small accounts-toolbar-button accounts-toolbar-button--upload collection-toolbar-action" type="button" aria-label="Create Budget" onClick={() => selectEditor("new")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>Create Budget</span></button></div> : undefined}
  >
    <section className={`budgeting-page${editorOpen ? " budgeting-page--editing" : ""}`}>
      <div className="budget-directory-content" hidden={mobileEditor}>
        {!selectedBudget ? <>
          <div className="collection-directory-heading"><p>Set spending limits, build savings, and track your progress by category or account over time.</p></div>
          <div className="collection-card-grid" aria-label="Budgets">
            {budgets.map((budget) => {
              const appearance = getBudgetAppearance(budget);
              return <CollectionCard key={budget.id} kind="budget" name={budget.name} subtitle={`${cadenceLabels[budget.cadence]}${budget.isActive ? "" : " · Paused"}`} icon={<span aria-hidden="true">{appearance.emoji}</span>} emoji={budget.emoji} color={appearance.color} onOpen={() => selectBudget(budget.id)} onSave={(name, emoji) => updateAppearance(budget, name, emoji)}>
                <div className="collection-card__value"><small>{budget.kind === "savings_target" ? "Saved" : "Spent"} · {budget.periodLabel}</small><strong>{money(budget.actualAmount, budget.currency)}</strong><small>of {money(budget.targetAmount, budget.currency)}</small></div>
                <div className="collection-card__progress" role="meter" aria-label={`${budget.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, budget.progressPercent))} aria-valuetext={percent(budget.progressPercent)}><span style={{ width: barWidth(budget.progressPercent) }} /></div>
              </CollectionCard>;
            })}
            <button className="collection-create-card" type="button" onClick={() => selectEditor("new")}><span aria-hidden="true">＋</span><strong>Create Budget</strong><small>Plan for what matters to you</small></button>
          </div>
        </> : <>
          <section className="budgeting-section glass budget-single-view" aria-label="Budget overview">
            <div className="budget-single-view__head"><span className="budget-detail-emoji" aria-hidden="true">{getBudgetAppearance(selectedBudget).emoji}</span><div><h2>{selectedBudget.name}</h2><p>{cadenceLabels[selectedBudget.cadence]} · {selectedBudget.scopeLabel} · {selectedBudget.periodLabel}{!selectedBudget.isActive ? " · Paused" : ""}</p></div><button className="button button-secondary button-small" onClick={() => selectEditor(selectedBudget.id)} type="button">Edit budget</button></div>
            <div className="budget-single-view__amount"><strong>{money(selectedBudget.actualAmount, selectedBudget.currency)}</strong><span>of {money(selectedBudget.targetAmount, selectedBudget.currency)} {selectedBudget.kind === "savings_target" ? "savings target" : "spending limit"}</span></div>
            <div className="budget-card__bar" role="meter" aria-label="Budget progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, selectedBudget.progressPercent))} aria-valuetext={percent(selectedBudget.progressPercent)}><span className={`budget-card__bar-fill budget-card__bar-fill--${selectedBudget.kind === "savings_target" ? "safe" : selectedBudget.stage}`} style={{ width: barWidth(selectedBudget.progressPercent) }} /></div>
            <p>{percent(selectedBudget.progressPercent)} · {selectedBudget.statusLabel}. {selectedBudget.statusDetail}</p>
            {selectedBudget.plannedCount > 0 ? <p>{money(selectedBudget.plannedAmount, selectedBudget.currency)} in planned payments · Projected {money(selectedBudget.projectedAmount, selectedBudget.currency)}</p> : null}
            {selectedBudget.scope === "category" && data.overview.uncategorizedTransactionCount > 0 ? <p className="budgeting-section__note">Uncategorized transactions are not included in this category budget.</p> : null}
          </section>
          <section className="budgeting-section glass" aria-label="Budget reports"><h3>Reports</h3><p className="budgeting-section__note">Compare recent periods against the current {selectedBudget.kind === "savings_target" ? "target" : "limit"}.</p>
            {historyError ? <p role="alert">{historyError} <button type="button" className="button button-secondary button-small" onClick={() => setHistoryVersion((value) => value + 1)}>Try again</button></p> : !history ? <p role="status">Loading reports…</p> : <div className="budget-history__chart">{history.points.map((point) => <div className="budget-history__point" key={point.periodStart}>
              <div className="budget-history__point-head"><span>{point.label}</span><strong>{percent(point.progressPercent)}</strong></div>
              <div className="budget-history__bar" aria-hidden="true"><span className={`budget-history__bar-fill budget-history__bar-fill--${selectedBudget.kind === "savings_target" ? "safe" : point.stage}`} style={{ width: barWidth(point.progressPercent) }} /></div>
              <div className="budget-history__point-meta"><span>{money(point.actualAmount, selectedBudget.currency)} of {money(point.targetAmount, selectedBudget.currency)}</span></div>
            </div>)}</div>}
          </section>
          <section className="budgeting-section glass" aria-label="Budget transaction history"><h3>History</h3><p className="budgeting-section__note">Recent transactions included in this budget.</p>
            {history ? <div className="budget-history__activity-list">{history.recentTransactions.length ? history.recentTransactions.map((transaction) => <div className="budget-history__activity-item" key={transaction.id}><div><strong>{transaction.merchantName}</strong><span>{transaction.categoryName ?? "Uncategorized"} · {new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(transaction.date))}</span></div><div className="budget-history__activity-meta"><strong>{money(transaction.amount, selectedBudget.currency)}</strong><span>{transaction.type === "income" ? "Income" : "Expense"}</span></div></div>) : <p>No recent transactions for this budget yet.</p>}</div> : <p>{historyError ? "History is temporarily unavailable." : "Loading history…"}</p>}
          </section>
        </>}
      </div>
      {editorOpen ? <BudgetEditor key={editorId} budget={editingBudget} data={data} mobile={mobile} onClose={() => selectEditor(null)} onSaved={(result, deleted) => {
        setData((current) => ({ ...current, budgets: result.budgets, overview: result.overview }));
        selectEditor(null);
        if (deleted) selectBudget(null);
        else if (result.budget?.id) selectBudget(result.budget.id);
        setHistoryVersion((value) => value + 1);
      }} /> : null}
    </section>
  </CloverShell>;
}

type SaveResult = Pick<BudgetingData, "budgets" | "overview"> & { budget?: { id: string } };
function BudgetEditor({ budget, data: initialData, mobile, onClose, onSaved }: { budget: BudgetProgress | null; data: BudgetingData; mobile: boolean; onClose: () => void; onSaved: (result: SaveResult, deleted?: boolean) => void }) {
  const [data, setData] = useState(initialData);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const optionsReady = data.editorOptionsLoaded !== false;
  const [form, setForm] = useState<BudgetForm>(() => ({ name: budget?.name ?? "", emoji: budget?.emoji ?? null, kind: budget?.kind ?? "spend_limit", scope: budget?.scope ?? "global", cadence: budget?.cadence ?? "monthly", currency: budget?.currency ?? data.budgets[0]?.currency ?? data.accounts[0]?.currency ?? "PHP", targetAmount: budget ? String(budget.targetAmount) : "", accountId: budget?.accountId ?? null, categoryId: budget?.categoryId ?? null }));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (optionsReady) return;
    const controller = new AbortController();
    setOptionsError(null);
    void (async () => {
      try {
        const response = await fetch("/api/budgets/options", { cache: "no-store", signal: controller.signal });
        const result = await response.json() as Pick<BudgetingData, "accounts" | "categories"> & { error?: string };
        if (!response.ok || !Array.isArray(result.accounts) || !Array.isArray(result.categories)) throw new Error(result.error || "Unable to load budget options.");
        if (controller.signal.aborted) return;
        setData((current) => ({ ...current, ...result, editorOptionsLoaded: true }));
        if (!budget) setForm((current) => ({ ...current, currency: initialData.budgets[0]?.currency ?? result.accounts[0]?.currency ?? "PHP" }));
        window.requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>("input")?.focus());
      } catch (error) {
        if (!controller.signal.aborted) setOptionsError(error instanceof Error ? error.message : "Unable to load budget options.");
      }
    })();
    return () => controller.abort();
  }, [optionsReady, optionsRetry, budget, initialData.budgets]);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.dataset.budgetEditorOpen = "true";
    dialog.current?.querySelector<HTMLInputElement>("input")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !inFlight.current) { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab" && !mobile) {
        const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])') ?? []);
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const originalOverflow = document.body.style.overflow;
    if (!mobile) document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKey);
    return () => { document.body.dataset.budgetEditorOpen = "false"; document.body.style.overflow = originalOverflow; window.removeEventListener("keydown", handleKey); previousFocus?.focus(); };
  }, [mobile]);
  const field = <K extends keyof BudgetForm>(key: K, value: BudgetForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const request = async (action: "save" | "toggle" | "delete") => {
    if (inFlight.current || !optionsReady) return;
    inFlight.current = true; setSaving(true); setError(null);
    try {
      const response = await fetch(budget ? `/api/budgets/${budget.id}` : "/api/budgets", {
        method: action === "delete" ? "DELETE" : budget ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: action === "delete" ? undefined : JSON.stringify({ ...form, name: form.name.trim() || data.categories.find((category) => category.id === form.categoryId)?.name || data.accounts.find((account) => account.id === form.accountId)?.name || (form.kind === "savings_target" ? "Savings target" : "All spending"), targetAmount: Number(form.targetAmount), ...(action === "toggle" ? { isActive: !budget?.isActive } : {}) }),
      });
      const result = await response.json() as SaveResult & { error?: unknown };
      if (!response.ok || !result.budgets || !result.overview) throw new Error(typeof result.error === "string" ? result.error : "Check the budget name, amount, currency and scope, then try again.");
      onSaved(result, action === "delete");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save this budget."); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <div className={mobile ? "budget-editor-page" : "budget-editor__backdrop"} onClick={mobile ? undefined : () => { if (!saving) onClose(); }}>
    <div ref={dialog} className={`budget-editor glass${mobile ? " budget-editor--page" : ""}`} role={mobile ? undefined : "dialog"} aria-modal={mobile ? undefined : true} aria-label={budget ? "Edit budget" : "Create Budget"} onClick={(event) => event.stopPropagation()}>
      <div className="budget-editor__head"><h2>{budget ? "Edit budget" : "Create Budget"}</h2>{!mobile ? <button className="icon-button" type="button" aria-label="Close budget editor" disabled={saving} onClick={onClose}>×</button> : null}</div>
      <form onSubmit={(event) => { event.preventDefault(); void request("save"); }}>
        {!optionsReady ? <p role={optionsError ? "alert" : "status"}>{optionsError || "Loading accounts and categories…"}{optionsError ? <button type="button" className="button button-secondary button-small" onClick={() => setOptionsRetry((value) => value + 1)}>Try again</button> : null}</p> : null}
        <fieldset disabled={saving || !optionsReady} className="budget-editor-fields">
          <div className="budget-editor__inline-controls">
            <label className="budget-editor__field"><span>Budget name</span><input value={form.name} maxLength={80} minLength={2} placeholder="e.g. Groceries" onChange={(event) => field("name", event.target.value)} /></label>
            <label className="budget-editor__field"><span>Icon</span><select value={form.emoji ?? ""} onChange={(event) => field("emoji", event.target.value || null)}><option value="">Automatic — {getBudgetAppearance({ name: form.name, categoryName: data.categories.find((category) => category.id === form.categoryId)?.name, kind: form.kind }).emoji}</option>{budgetIcons.map((icon) => <option key={icon.emoji} value={icon.emoji}>{icon.emoji} {icon.label}</option>)}</select></label>
          </div>
          <div className="budget-editor__inline-controls">
            <label className="budget-editor__field"><span>Type</span><select value={form.kind} onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as BudgetForm["kind"], scope: "global", accountId: null, categoryId: null }))}><option value="spend_limit">Spending limit</option><option value="savings_target">Savings target</option></select></label>
            <label className="budget-editor__field"><span>Applies to</span><select disabled={form.kind === "savings_target"} value={form.accountId ? `account:${form.accountId}` : form.categoryId ?? "__all__"} onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith("account:")) { const account = data.accounts.find((item) => item.id === value.slice(8)); setForm((current) => ({ ...current, scope: "account", accountId: value.slice(8), categoryId: null, currency: account?.currency ?? current.currency })); }
              else setForm((current) => ({ ...current, scope: value === "__all__" ? "global" : "category", accountId: null, categoryId: value === "__all__" ? null : value }));
            }}><option value="__all__">All spending</option><optgroup label="Categories">{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup><optgroup label="Accounts">{data.accounts.map((item) => <option key={item.id} value={`account:${item.id}`}>{formatAccountOptionLabel(item)}</option>)}</optgroup></select></label>
          </div>
          <p className="budget-editor__scope-hint">{form.kind === "savings_target" ? "Savings are measured across this profile's income and spending." : form.scope === "account" ? "Only transactions from this account are counted." : form.scope === "category" ? "Only transactions in this category are counted." : "All spending in this Clover profile is counted."}</p>
          <div className="budget-editor__inline-controls">
            <label className="budget-editor__field"><span>Currency</span><input required minLength={3} maxLength={8} value={form.currency} onChange={(event) => field("currency", event.target.value.toUpperCase())} /></label>
            <label className="budget-editor__field"><span>Amount</span><input required type="number" min="0.01" max="1000000000" step="0.01" inputMode="decimal" value={form.targetAmount} onChange={(event) => field("targetAmount", event.target.value)} /></label>
          </div>
          <div className="budget-editor__inline-controls budget-editor__inline-controls--single">
            <label className="budget-editor__field"><span>Cadence</span><select value={form.cadence} onChange={(event) => field("cadence", event.target.value as BudgetForm["cadence"])}>{Object.entries(cadenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          </div>
        </fieldset>
        {error ? <p className="budget-editor__error" role="alert">{error}</p> : null}
        {confirmDelete ? <div role="alert"><p>Delete this budget? Your transactions will stay unchanged.</p><button className="button button-secondary button-small" type="button" disabled={saving} onClick={() => setConfirmDelete(false)}>Keep budget</button><button className="button button-secondary button-small" type="button" disabled={saving} onClick={() => void request("delete")}>Confirm delete</button></div> : null}
        <div className="budget-editor__actions">{budget ? <><button className="button button-secondary button-pill" type="button" disabled={saving || !optionsReady} onClick={() => void request("toggle")}>{budget.isActive ? "Pause" : "Resume"}</button><button className="button button-secondary button-pill" type="button" disabled={saving || !optionsReady} onClick={() => setConfirmDelete(true)}>Delete</button></> : null}<div className="budget-editor__spacer" /><button className="button button-secondary button-pill" type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="button button-primary button-pill" type="submit" disabled={saving || !optionsReady}>{saving ? "Saving…" : budget ? "Save changes" : "Create Budget"}</button></div>
      </form>
    </div>
  </div>;
}

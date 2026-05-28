"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";

type BudgetKind = "spend_limit" | "savings_target";
type BudgetScope = "global" | "account" | "category";
type BudgetCadence = "daily" | "weekly" | "monthly";
type BudgetStage = "safe" | "watch" | "warning" | "critical" | "exceeded";

type BudgetItem = {
  id: string;
  name: string;
  kind: BudgetKind;
  scope: BudgetScope;
  cadence: BudgetCadence;
  currency: string;
  targetAmount: number;
  actualAmount: number;
  progressPercent: number;
  remainingAmount: number;
  stage: BudgetStage;
  scopeLabel: string;
  periodLabel: string;
  nextThreshold: number | null;
  accountId: string | null;
  accountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  kindLabel: string;
  statusLabel: string;
  statusDetail: string;
};

type BudgetAlert = BudgetItem & {
  tone: "positive" | "warning" | "danger";
  actionLabel: string;
  href: string;
};

type BudgetOverview = {
  budgets: BudgetItem[];
  alerts: BudgetAlert[];
  activeBudgetCount: number;
  totalTargetAmount: number;
  totalActualAmount: number;
  totalProgressPercent: number;
  highestAlert: BudgetItem | null;
};

type BudgetSuggestion = {
  id: string;
  title: string;
  detail: string;
  amount: number;
  currency: string;
  kind: BudgetKind;
  scope: BudgetScope;
  cadence: BudgetCadence;
  accountId: string | null;
  categoryId: string | null;
  actionLabel: string;
  tone: "positive" | "warning" | "neutral";
};

type BudgetOption = {
  id: string;
  name: string;
  currency: string | null;
  type?: string;
};

type BudgetCategoryOption = {
  id: string;
  name: string;
};

type BudgetingData = {
  budgets: BudgetItem[];
  overview: BudgetOverview;
  accounts: BudgetOption[];
  categories: BudgetCategoryOption[];
  suggestions: BudgetSuggestion[];
};

type BudgetFormState = {
  name: string;
  kind: BudgetKind;
  scope: BudgetScope;
  cadence: BudgetCadence;
  targetAmount: string;
  currency: string;
  accountId: string;
  categoryId: string;
};

type BudgetingWorkspaceProps = {
  initialData: BudgetingData;
};

const cadenceLabels: Record<BudgetCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const scopeLabels: Record<BudgetScope, string> = {
  global: "Global",
  account: "Per account",
  category: "Category",
};

const kindLabels: Record<BudgetKind, string> = {
  spend_limit: "Spend limit",
  savings_target: "Savings target",
};

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");

const defaultFormState = (currency = "PHP"): BudgetFormState => ({
  name: "",
  kind: "spend_limit",
  scope: "global",
  cadence: "monthly",
  targetAmount: "",
  currency,
  accountId: "",
  categoryId: "",
});

const toPercentage = (value: number) => `${Math.max(0, Math.round(value))}%`;

const getBudgetDraftName = (form: BudgetFormState, accounts: BudgetOption[], categories: BudgetCategoryOption[]) => {
  const customName = form.name.trim();
  if (customName) {
    return customName;
  }

  if (form.kind === "savings_target") {
    return "Savings target";
  }

  if (form.scope === "account") {
    const accountName = accounts.find((account) => account.id === form.accountId)?.name;
    return `${accountName ?? "Account"} budget`;
  }

  if (form.scope === "category") {
    const categoryName = categories.find((category) => category.id === form.categoryId)?.name;
    return `${categoryName ?? "Category"} budget`;
  }

  return `${cadenceLabels[form.cadence]} spending limit`;
};

export function BudgetingWorkspace({ initialData }: BudgetingWorkspaceProps) {
  const [data, setData] = useState<BudgetingData>(initialData);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editorPreset, setEditorPreset] = useState<BudgetFormState | null>(null);
  const [form, setForm] = useState<BudgetFormState>(() => defaultFormState(initialData.budgets[0]?.currency ?? "PHP"));
  const [saving, setSaving] = useState(false);
  const [savingSuggestionId, setSavingSuggestionId] = useState<string | null>(null);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editingBudget = useMemo(
    () => data.budgets.find((budget) => budget.id === editingBudgetId) ?? null,
    [data.budgets, editingBudgetId]
  );

  useEffect(() => {
    document.body.dataset.budgetEditorOpen = isEditorOpen ? "true" : "false";
    return () => {
      if (document.body.dataset.budgetEditorOpen === "true") {
        document.body.dataset.budgetEditorOpen = "false";
      }
    };
  }, [isEditorOpen]);

  useEffect(() => {
    if (!isEditorOpen) {
      return;
    }

    const nextCurrency = editingBudget?.currency ?? data.accounts.find((account) => account.currency)?.currency ?? "PHP";
    setForm(
      editingBudget
        ? {
            name: editingBudget.name,
            kind: editingBudget.kind,
            scope: editingBudget.kind === "savings_target" ? "global" : editingBudget.scope,
            cadence: editingBudget.cadence,
            targetAmount: String(editingBudget.targetAmount),
            currency: editingBudget.currency,
            accountId: editingBudget.accountId ?? "",
            categoryId: editingBudget.categoryId ?? "",
          }
        : editorPreset ?? defaultFormState(nextCurrency)
    );
  }, [data.accounts, data.categories, editingBudget, editorPreset, isEditorOpen]);

  const totalProgress = data.overview.totalProgressPercent;
  const totalBudgeted = data.overview.totalTargetAmount;
  const totalUsed = data.overview.totalActualAmount;
  const activeAlerts = data.overview.alerts;
  const openBudgetCount = data.overview.activeBudgetCount;
  const visibleBudgets = data.budgets;
  const suggestions = data.suggestions;
  const isScopeSelectionComplete =
    form.kind === "savings_target"
      ? true
      : form.scope === "account"
        ? Boolean(form.accountId)
        : form.scope === "category"
          ? Boolean(form.categoryId)
          : true;

  const resetEditor = () => {
    setEditingBudgetId(null);
    setEditorPreset(null);
    setShowAdvancedOptions(false);
    setError(null);
    setIsEditorOpen(false);
  };

  const openCreateEditor = () => {
    setEditingBudgetId(null);
    setEditorPreset(null);
    setShowAdvancedOptions(false);
    setError(null);
    setIsEditorOpen(true);
  };

  const openCreateEditorWithSuggestion = (suggestion: BudgetSuggestion) => {
    setEditingBudgetId(null);
    setError(null);
    setShowAdvancedOptions(false);
    setEditorPreset({
      name: suggestion.title,
      kind: suggestion.kind,
      scope: suggestion.scope,
      cadence: suggestion.cadence,
      targetAmount: String(suggestion.amount),
      currency: suggestion.currency,
      accountId: suggestion.accountId ?? "",
      categoryId: suggestion.categoryId ?? "",
    });
    setIsEditorOpen(true);
  };

  const openEditEditor = (budgetId: string) => {
    setEditingBudgetId(budgetId);
    setEditorPreset(null);
    setShowAdvancedOptions(true);
    setError(null);
    setIsEditorOpen(true);
  };

  const updateFormField = <Key extends keyof BudgetFormState>(field: Key, value: BudgetFormState[Key]) => {
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (field === "kind" && value === "savings_target") {
        next.scope = "global";
        next.accountId = "";
        next.categoryId = "";
      }
      if (field === "scope" && value === "global") {
        next.accountId = "";
        next.categoryId = "";
      }
      return next;
    });
  };

  const runBudgetRequest = async (payload: Record<string, unknown>, mode: "create" | "update", budgetId?: string) => {
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(mode === "update" ? `/api/budgets/${budgetId}` : "/api/budgets", {
        method: mode === "update" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as Partial<BudgetingData> & { error?: unknown };
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Unable to save budget");
      }

      if (result.budgets && result.overview) {
        setData((current) => ({
          ...current,
          budgets: result.budgets ?? current.budgets,
          overview: result.overview ?? current.overview,
          suggestions: result.suggestions ?? current.suggestions,
        }));
      }

      resetEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save budget");
    } finally {
      setSaving(false);
    }
  };

  const saveBudget = async () => {
    const draftName = getBudgetDraftName(form, data.accounts, data.categories);
    const payload = {
      name: draftName,
      kind: form.kind,
      scope: form.kind === "savings_target" ? "global" : form.scope,
      cadence: form.cadence,
      targetAmount: Number(form.targetAmount),
      currency: form.currency.trim() || "PHP",
      accountId: form.scope === "account" ? form.accountId || null : null,
      categoryId: form.scope === "category" ? form.categoryId || null : null,
    };

    await runBudgetRequest(payload, editingBudgetId ? "update" : "create", editingBudgetId ?? undefined);
  };

  const saveSuggestionBudget = async (suggestion: BudgetSuggestion) => {
    if (saving || savingSuggestionId) {
      return;
    }

    setSavingSuggestionId(suggestion.id);
    setError(null);

    try {
      await runBudgetRequest(
        {
          name: suggestion.title,
          kind: suggestion.kind,
          scope: suggestion.scope,
          cadence: suggestion.cadence,
          targetAmount: suggestion.amount,
          currency: suggestion.currency,
          accountId: suggestion.accountId,
          categoryId: suggestion.categoryId,
        },
        "create"
      );
    } finally {
      setSavingSuggestionId(null);
    }
  };

  const deleteBudget = async () => {
    if (!editingBudgetId || saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/budgets/${editingBudgetId}`, {
        method: "DELETE",
      });

      const result = (await response.json()) as Partial<BudgetingData> & { error?: unknown };
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Unable to delete budget");
      }

      if (result.budgets && result.overview) {
        setData((current) => ({
          ...current,
          budgets: result.budgets ?? current.budgets,
          overview: result.overview ?? current.overview,
          suggestions: result.suggestions ?? current.suggestions,
        }));
      }

      resetEditor();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete budget");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="budgeting-page">
      <section className="budgeting-hero glass">
        <div className="budgeting-hero__copy">
          <p className="eyebrow">Budgeting</p>
          <h3>Simple limits that stay visible everywhere you need them.</h3>
          <p>Set a cap for an account, a category, or your whole workspace, then let Clover watch it for you.</p>
          <div className="budgeting-hero__actions">
            <button className="button button-primary button-pill" type="button" onClick={openCreateEditor}>
              Set budget
            </button>
          </div>
          <div className="budgeting-hero__note-row">
            <span className="pill pill-subtle">{openBudgetCount} active</span>
            <span className="pill pill-subtle">{activeAlerts.length} alerts</span>
            <span className="pill pill-subtle">{toPercentage(totalProgress)} usage</span>
          </div>
          {activeAlerts[0] ? (
            <p className="budgeting-hero__note">
              {activeAlerts[0].name} is currently at {toPercentage(activeAlerts[0].progressPercent)} of its limit.
            </p>
          ) : (
            <p className="budgeting-hero__note">Clover will surface budget pressure in Home, Notifications, and Adviser.</p>
          )}
        </div>

        <div className="budgeting-hero__summary glass">
          <div className="budgeting-hero__summary-head">
            <span className="eyebrow">At a glance</span>
            <strong>{toPercentage(totalProgress)}</strong>
          </div>
          <div className="budgeting-hero__summary-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(totalProgress, 100)}%` }} />
          </div>
          <div className="budgeting-hero__stats">
            <div>
              <span>Tracked</span>
              <strong>{formatCurrency(totalUsed, data.budgets[0]?.currency ?? "PHP")}</strong>
            </div>
            <div>
              <span>Budgeted</span>
              <strong>{formatCurrency(totalBudgeted, data.budgets[0]?.currency ?? "PHP")}</strong>
            </div>
            <div>
              <span>Left</span>
              <strong>{formatCurrency(Math.max(totalBudgeted - totalUsed, 0), data.budgets[0]?.currency ?? "PHP")}</strong>
            </div>
            <div>
              <span>Alerts</span>
              <strong>{activeAlerts.length}</strong>
            </div>
          </div>
        </div>
      </section>

      {suggestions.length > 0 ? (
        <section className="budgeting-section budgeting-section--suggestions glass">
          <div className="budgeting-section__head">
            <div>
              <p className="eyebrow">Useful next steps</p>
              <h4>Suggested budgets from your recent activity</h4>
            </div>
          </div>
          <div className="budgeting-suggestion-grid">
            {suggestions.map((suggestion) => (
              <article key={suggestion.id} className={`budget-suggestion budget-suggestion--${suggestion.tone}`}>
                <div className="budget-suggestion__head">
                  <span className="pill pill-subtle">{kindLabels[suggestion.kind]}</span>
                  <span className="pill pill-subtle">{scopeLabels[suggestion.scope]}</span>
                </div>
                <strong>{suggestion.title}</strong>
                <p>{suggestion.detail}</p>
                <div className="budget-suggestion__foot">
                  <span>{formatCurrency(suggestion.amount, suggestion.currency)}</span>
                  <span>{suggestion.actionLabel}</span>
                </div>
                <div className="budget-suggestion__actions">
                  <button
                    className="button button-primary button-small button-pill"
                    type="button"
                    onClick={() => void saveSuggestionBudget(suggestion)}
                    disabled={saving || savingSuggestionId === suggestion.id}
                  >
                    {savingSuggestionId === suggestion.id ? "Saving..." : "Use suggestion"}
                  </button>
                  <button
                    className="button button-secondary button-small button-pill"
                    type="button"
                    onClick={() => openCreateEditorWithSuggestion(suggestion)}
                    disabled={saving}
                  >
                    Customize
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="budgeting-section glass">
        <div className="budgeting-section__head">
          <div>
            <p className="eyebrow">Budgets</p>
            <h4>{visibleBudgets.length === 0 ? "Create your first budget" : "Current budgets"}</h4>
          </div>
          <button className="button button-secondary button-pill" type="button" onClick={openCreateEditor}>
            Add budget
          </button>
        </div>

        {visibleBudgets.length > 0 ? (
          <div className="budgeting-grid">
            {visibleBudgets.map((budget) => {
              const isOver = budget.stage === "critical" || budget.stage === "exceeded";
              return (
                <article key={budget.id} className="budget-card glass">
                  <div className="report-card__head report-card__head--compact">
                    <div>
                      <h4>{budget.name}</h4>
                      <p className="budget-card__subhead">
                        {budget.kindLabel} · {budget.scopeLabel} · {cadenceLabels[budget.cadence]}
                      </p>
                    </div>
                    <div className={`pill ${isOver ? "pill-danger" : "pill-subtle"}`}>{toPercentage(budget.progressPercent)}</div>
                  </div>

                  <div className="budget-card__progress">
                    <div className="budget-card__amounts">
                      <strong>{formatCurrency(budget.actualAmount, budget.currency)}</strong>
                      <span>of {formatCurrency(budget.targetAmount, budget.currency)}</span>
                    </div>
                    <span>{budget.periodLabel}</span>
                  </div>
                  <div className="budget-card__bar" aria-hidden="true">
                    <span className={`budget-card__bar-fill budget-card__bar-fill--${budget.stage}`} style={{ width: `${Math.min(budget.progressPercent, 100)}%` }} />
                  </div>
                  <div className="budget-card__meta">
                    <span>{budget.statusLabel}</span>
                    <span>
                      {budget.stage === "exceeded"
                        ? `${formatCurrency(Math.abs(budget.remainingAmount), budget.currency)} over`
                        : `${formatCurrency(Math.max(budget.remainingAmount, 0), budget.currency)} left`}
                    </span>
                  </div>
                  <div className="budget-card__actions">
                    <button className="pill-link pill-link--inline" type="button" onClick={() => openEditEditor(budget.id)}>
                      Edit
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <article className="budget-empty">
            <p className="eyebrow">Nothing yet</p>
            <h4>Set one budget and Clover will handle the reminders.</h4>
            <p>Start with a simple global cap or let one of the suggestions above fill in the details.</p>
            <button className="button button-primary button-pill" type="button" onClick={openCreateEditor}>
              Create budget
            </button>
          </article>
        )}
      </section>

      {isEditorOpen ? (
        <div className="budget-editor__backdrop" role="presentation" onClick={() => !saving && resetEditor()}>
          <div className="budget-editor glass" role="dialog" aria-modal="true" aria-label={editingBudget ? "Edit budget" : "Set budget"} onClick={(event) => event.stopPropagation()}>
        <div className="budget-editor__head">
          <div>
            <p className="eyebrow">{editingBudget ? "Change budget" : "Set budget"}</p>
            <h4>{editingBudget ? "Refine the limit" : "Create a guardrail"}</h4>
          </div>
              <button className="icon-button" type="button" onClick={resetEditor} aria-label="Close budget editor">
                ×
              </button>
            </div>

            <div className="budget-editor__form">
              <div className="budget-editor__preview glass">
                <span className="budget-editor__preview-label">Saved as</span>
                <strong>{getBudgetDraftName(form, data.accounts, data.categories)}</strong>
                <p>This name updates automatically unless you choose to edit it below.</p>
              </div>

              <label className="budget-editor__field">
                <span>Amount</span>
                <input
                  inputMode="decimal"
                  value={form.targetAmount}
                  onChange={(event) => updateFormField("targetAmount", event.target.value)}
                  placeholder="5000"
                />
              </label>

              <div className="budget-editor__inline-controls">
                <label className="budget-editor__field">
                  <span>Type</span>
                  <select value={form.kind} onChange={(event) => updateFormField("kind", event.target.value as BudgetKind)}>
                    <option value="spend_limit">Spend limit</option>
                    <option value="savings_target">Savings target</option>
                  </select>
                </label>

                <label className="budget-editor__field">
                  <span>Cadence</span>
                  <select value={form.cadence} onChange={(event) => updateFormField("cadence", event.target.value as BudgetCadence)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
              </div>

              <div className="budget-editor__toggle-row">
                <button
                  className="pill-link pill-link--inline"
                  type="button"
                  onClick={() => setShowAdvancedOptions((current) => !current)}
                >
                  {showAdvancedOptions || form.kind === "savings_target" || form.scope !== "global" ? "Hide more options" : "More options"}
                </button>
                <span className="budget-editor__hint">
                  {form.kind === "savings_target"
                    ? "Savings targets stay global."
                    : "Choose an account or category only when you need a scoped budget."}
                </span>
              </div>

              {showAdvancedOptions || form.kind === "savings_target" || form.scope !== "global" ? (
                <div className="budget-editor__advanced">
                  <label className="budget-editor__field budget-editor__field--full">
                    <span>Name</span>
                    <input value={form.name} onChange={(event) => updateFormField("name", event.target.value)} placeholder="Optional custom name" />
                  </label>

                  <label className="budget-editor__field">
                    <span>Scope</span>
                    <select
                      value={form.scope}
                      onChange={(event) => updateFormField("scope", event.target.value as BudgetScope)}
                      disabled={form.kind === "savings_target"}
                    >
                      <option value="global">Global</option>
                      <option value="account">Per account</option>
                      <option value="category">Category</option>
                    </select>
                  </label>

                  <label className="budget-editor__field">
                    <span>Currency</span>
                    <input value={form.currency} onChange={(event) => updateFormField("currency", event.target.value)} placeholder="PHP" />
                  </label>

                  {form.scope === "account" ? (
                    <label className="budget-editor__field budget-editor__field--full">
                      <span>Account</span>
                      <select value={form.accountId} onChange={(event) => updateFormField("accountId", event.target.value)}>
                        <option value="">Choose an account</option>
                        {data.accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {form.scope === "category" ? (
                    <label className="budget-editor__field budget-editor__field--full">
                      <span>Category</span>
                      <select value={form.categoryId} onChange={(event) => updateFormField("categoryId", event.target.value)}>
                        <option value="">Choose a category</option>
                        {data.categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>

            {error ? <p className="budget-editor__error">{error}</p> : null}

            <div className="budget-editor__actions">
              {editingBudget ? (
                <button className="button button-secondary button-pill" type="button" onClick={deleteBudget} disabled={saving}>
                  Delete
                </button>
              ) : null}
              <div className="budget-editor__spacer" />
              <button className="button button-secondary button-pill" type="button" onClick={resetEditor} disabled={saving}>
                Cancel
              </button>
              <button
                className="button button-primary button-pill"
                type="button"
                onClick={saveBudget}
                disabled={saving || !form.name.trim() || !form.targetAmount.trim() || !isScopeSelectionComplete}
              >
                {saving ? "Saving..." : editingBudget ? "Save changes" : "Save budget"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

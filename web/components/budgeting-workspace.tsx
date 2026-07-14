"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";

type BudgetKind = "spend_limit" | "savings_target";
type BudgetScope = "global" | "account" | "category";
type BudgetCadence = "daily" | "weekly" | "monthly" | "annual";
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

type BudgetHistoryPoint = {
  label: string;
  periodStart: string;
  periodEnd: string;
  actualAmount: number;
  targetAmount: number;
  progressPercent: number;
  stage: BudgetStage;
};

type BudgetHistoryTransaction = {
  id: string;
  date: string;
  amount: number;
  type: "income" | "expense";
  merchantName: string;
  categoryName: string | null;
};

type BudgetHistoryResponse = {
  budget: Pick<
    BudgetItem,
    "id" | "name" | "kind" | "scope" | "cadence" | "currency" | "targetAmount" | "accountId" | "accountName" | "categoryId" | "categoryName"
  >;
  history: {
    points: BudgetHistoryPoint[];
    recentTransactions: BudgetHistoryTransaction[];
  };
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

type BudgetCategoryOption = {
  id: string;
  name: string;
};

type BudgetAccountOption = {
  id: string;
  name: string;
  currency: string;
  type: string;
};

type BudgetingData = {
  budgets: BudgetItem[];
  overview: BudgetOverview;
  categories: BudgetCategoryOption[];
  accounts: BudgetAccountOption[];
};

type BudgetFormState = {
  kind: BudgetKind;
  name: string;
  categoryId: string;
  accountId: string;
  cadence: BudgetCadence;
  targetAmount: string;
  currency: string;
};

type BudgetingWorkspaceProps = {
  initialData: BudgetingData;
};

const cadenceLabels: Record<BudgetCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  annual: "Yearly",
};

const formatCurrency = (value: number, currency?: string | null) => formatCurrencyAmount(value, currency ?? "PHP");
const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));

const defaultFormState = (currency = "PHP"): BudgetFormState => ({
  kind: "spend_limit",
  name: "",
  categoryId: "__all__",
  accountId: "__none__",
  cadence: "monthly",
  targetAmount: "",
  currency,
});

const toPercentage = (value: number) => `${Math.max(0, Math.round(value))}%`;

const getBudgetDraftName = (form: BudgetFormState, categories: BudgetCategoryOption[], accounts: BudgetAccountOption[]) => {
  const customName = form.name.trim();
  if (customName) {
    return customName;
  }

  if (form.kind === "savings_target") {
    return "Savings target";
  }

  if (form.accountId !== "__none__") {
    return accounts.find((account) => account.id === form.accountId)?.name ?? "Account budget";
  }

  if (form.categoryId === "__all__") {
    return "All spending";
  }

  return categories.find((category) => category.id === form.categoryId)?.name ?? "Category";
};

export function BudgetingWorkspace({ initialData }: BudgetingWorkspaceProps) {
  const [data, setData] = useState<BudgetingData>(initialData);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editorPreset, setEditorPreset] = useState<BudgetFormState | null>(null);
  const [form, setForm] = useState<BudgetFormState>(() => defaultFormState(initialData.budgets[0]?.currency ?? "PHP"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyBudgetId, setHistoryBudgetId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<BudgetHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
    if (!historyBudgetId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryBudgetId(null);
        setHistoryData(null);
        setHistoryError(null);
        setHistoryLoading(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [historyBudgetId]);

  useEffect(() => {
    if (!isEditorOpen) {
      return;
    }

    const nextCurrency = editingBudget?.currency ?? data.budgets[0]?.currency ?? "PHP";
    setForm(
      editingBudget
        ? {
            name: editingBudget.name,
            categoryId: editingBudget.categoryId ?? "__all__",
            accountId: editingBudget.accountId ?? "__none__",
            kind: editingBudget.kind,
            cadence: editingBudget.cadence,
            targetAmount: String(editingBudget.targetAmount),
            currency: editingBudget.currency,
          }
        : editorPreset ?? defaultFormState(nextCurrency)
    );
  }, [data.budgets, editingBudget, editorPreset, isEditorOpen]);

  const totalProgress = data.overview.totalProgressPercent;
  const totalBudgeted = data.overview.totalTargetAmount;
  const totalUsed = data.overview.totalActualAmount;
  const activeAlerts = data.overview.alerts;
  const openBudgetCount = data.overview.activeBudgetCount;
  const visibleBudgets = data.budgets;
  const onTrackBudgets = visibleBudgets.filter((budget) => budget.stage === "safe" || budget.stage === "watch");
  const atRiskBudgets = visibleBudgets.filter((budget) => budget.stage === "warning" || budget.stage === "critical" || budget.stage === "exceeded");
  const selectedHistoryBudget = historyBudgetId ? data.budgets.find((budget) => budget.id === historyBudgetId) ?? null : null;

  const budgetGroups = useMemo(() => {
    const grouped = new Map<string, BudgetItem[]>();
    for (const budget of visibleBudgets) {
      const group = grouped.get(budget.name) ?? [];
      group.push(budget);
      grouped.set(budget.name, group);
    }

    return [...grouped.entries()]
      .map(([name, budgets]) => ({
        name,
        budgets: [...budgets].sort((left, right) => {
          const cadenceOrder: Record<BudgetCadence, number> = { daily: 0, weekly: 1, monthly: 2, annual: 3 };
          return cadenceOrder[left.cadence] - cadenceOrder[right.cadence] || right.progressPercent - left.progressPercent;
        }),
        maxProgress: Math.max(...budgets.map((budget) => budget.progressPercent)),
      }))
      .sort((left, right) => right.maxProgress - left.maxProgress || left.name.localeCompare(right.name));
  }, [visibleBudgets]);

  const resetEditor = () => {
    setEditingBudgetId(null);
    setEditorPreset(null);
    setError(null);
    setIsEditorOpen(false);
  };

  const openCreateEditor = () => {
    setEditingBudgetId(null);
    setEditorPreset(null);
    setError(null);
    setIsEditorOpen(true);
  };

  const openEditEditor = (budgetId: string) => {
    setEditingBudgetId(budgetId);
    setEditorPreset(null);
    setError(null);
    setIsEditorOpen(true);
  };

  const closeHistoryModal = () => {
    setHistoryBudgetId(null);
    setHistoryData(null);
    setHistoryError(null);
    setHistoryLoading(false);
  };

  const openHistoryModal = async (budget: BudgetItem) => {
    setIsEditorOpen(false);
    setEditingBudgetId(null);
    setEditorPreset(null);
    setError(null);
    setHistoryBudgetId(budget.id);
    setHistoryData(null);
    setHistoryError(null);
    setHistoryLoading(true);

    try {
      const response = await fetch(`/api/budgets/${budget.id}`);
      const result = (await response.json()) as Partial<BudgetHistoryResponse> & { error?: unknown };
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Unable to load budget history");
      }

      if (!result.history || !result.budget) {
        throw new Error("Unable to load budget history");
      }

      setHistoryData(result as BudgetHistoryResponse);
    } catch (historyLoadError) {
      setHistoryError(historyLoadError instanceof Error ? historyLoadError.message : "Unable to load budget history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const updateFormField = <Key extends keyof BudgetFormState>(field: Key, value: BudgetFormState[Key]) => {
    setForm((current) => ({ ...current, [field]: value }));
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
    const draftName = getBudgetDraftName(form, data.categories, data.accounts);
    const isAccountBudget = form.accountId !== "__none__" && form.kind === "spend_limit";
    const isAllCategories = form.categoryId === "__all__";
    const payload = {
      name: draftName,
      kind: form.kind,
      scope: form.kind === "savings_target" ? ("global" as const) : isAccountBudget ? ("account" as const) : isAllCategories ? ("global" as const) : ("category" as const),
      cadence: form.cadence,
      targetAmount: Number(form.targetAmount),
      currency: form.currency.trim() || "PHP",
      accountId: isAccountBudget ? form.accountId : null,
      categoryId: form.kind === "savings_target" || isAccountBudget || isAllCategories ? null : form.categoryId,
    };

    await runBudgetRequest(payload, editingBudgetId ? "update" : "create", editingBudgetId ?? undefined);
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
      <section className="budget-summary-grid">
        <article className="budget-summary-card glass budget-summary-card--positive">
          <div className="budget-summary-card__head">
            <div>
              <p className="eyebrow">On Track</p>
              <h4>{onTrackBudgets.length} budgets</h4>
            </div>
            <strong>{toPercentage(totalProgress)}</strong>
          </div>
          <div className="budget-summary-card__items">
            {onTrackBudgets.slice(0, 3).map((budget) => (
              <div key={budget.id} className="budget-summary-card__item">
                <span>{budget.name}</span>
                <strong>
                  {cadenceLabels[budget.cadence]} · {toPercentage(budget.progressPercent)}
                </strong>
              </div>
            ))}
            {onTrackBudgets.length === 0 ? <p className="budget-summary-card__empty">Nothing is comfortably on track yet.</p> : null}
          </div>
        </article>

        <article className="budget-summary-card glass budget-summary-card--warning">
          <div className="budget-summary-card__head">
            <div>
              <p className="eyebrow">At Risk</p>
              <h4>{atRiskBudgets.length} budgets</h4>
            </div>
            <strong>{activeAlerts.length}</strong>
          </div>
          <div className="budget-summary-card__items">
            {atRiskBudgets.slice(0, 3).map((budget) => (
              <div key={budget.id} className="budget-summary-card__item">
                <span>{budget.name}</span>
                <strong>
                  {cadenceLabels[budget.cadence]} · {toPercentage(budget.progressPercent)}
                </strong>
              </div>
            ))}
            {atRiskBudgets.length === 0 ? <p className="budget-summary-card__empty">No budgets are close to a threshold.</p> : null}
          </div>
        </article>
      </section>

      <section className="budgeting-section glass">
        <div className="budgeting-section__head">
          <div>
            <p className="eyebrow">Budgets</p>
            <h4>Current budgets</h4>
          </div>
          <button className="button button-secondary button-pill" type="button" onClick={openCreateEditor}>
            Add budget
          </button>
        </div>

        {budgetGroups.length > 0 ? (
          <div className="budgeting-grid">
            {budgetGroups.map((group) => (
              <article key={group.name} className="budget-card glass">
                <div className="report-card__head report-card__head--compact">
                  <div>
                    <h4>{group.name}</h4>
                    <p className="budget-card__subhead">{group.budgets.length} cadence{group.budgets.length === 1 ? "" : "s"}</p>
                  </div>
                </div>

                <div className="budget-card__cadences">
                  {group.budgets.map((budget) => (
                    <div key={budget.id} className={`budget-card__cadence-row budget-card__cadence-row--${budget.stage}`}>
                      <div className="budget-card__cadence-head">
                        <span>{cadenceLabels[budget.cadence]}</span>
                        <strong>{toPercentage(budget.progressPercent)}</strong>
                      </div>
                      <div className="budget-card__bar" aria-hidden="true">
                        <span
                          className={`budget-card__bar-fill budget-card__bar-fill--${budget.stage}`}
                          style={{ width: `${Math.min(budget.progressPercent, 100)}%` }}
                        />
                      </div>
                      <div className="budget-card__meta budget-card__meta--compact">
                        <span>
                          {formatCurrency(budget.actualAmount, budget.currency)} of {formatCurrency(budget.targetAmount, budget.currency)}
                        </span>
                        <span>{budget.stage === "exceeded" ? "Over limit" : budget.statusLabel}</span>
                      </div>
                      <div className="budget-card__actions">
                        <button className="pill-link pill-link--inline" type="button" onClick={() => openEditEditor(budget.id)}>
                          Edit
                        </button>
                        <button
                          className="budget-card__chevron-button"
                          type="button"
                          onClick={() => void openHistoryModal(budget)}
                          aria-label={`Open history for ${budget.name} ${cadenceLabels[budget.cadence]}`}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <article className="budget-empty">
            <button className="button button-primary button-pill" type="button" onClick={openCreateEditor}>
              Create budget
            </button>
          </article>
        )}
      </section>

      {isEditorOpen ? (
        <div className="budget-editor__backdrop" role="presentation" onClick={() => !saving && resetEditor()}>
          <div
            className="budget-editor glass"
            role="dialog"
            aria-modal="true"
            aria-label={editingBudget ? "Edit budget" : "Set budget"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="budget-editor__head">
              <div>
                <p className="eyebrow">{editingBudget ? "Edit budget" : "Set budget"}</p>
                <h4>{editingBudget ? "Update the limit" : "Create a budget"}</h4>
              </div>
              <button className="icon-button" type="button" onClick={resetEditor} aria-label="Close budget editor">
                ×
              </button>
            </div>

            <div className="budget-editor__form">
              <div className="budget-editor__inline-controls">
                <label className="budget-editor__field">
                  <span>Type</span>
                  <select
                    value={form.kind}
                    onChange={(event) => {
                      const kind = event.target.value as BudgetKind;
                      setForm((current) => ({
                        ...current,
                        kind,
                        accountId: kind === "savings_target" ? "__none__" : current.accountId,
                        categoryId: kind === "savings_target" ? "__all__" : current.categoryId,
                      }));
                    }}
                  >
                    <option value="spend_limit">Spending limit</option>
                    <option value="savings_target">Savings target</option>
                  </select>
                </label>

                <label className="budget-editor__field">
                  <span>Applies to</span>
                  <select
                    value={form.accountId !== "__none__" ? `account:${form.accountId}` : form.categoryId}
                    disabled={form.kind === "savings_target"}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value.startsWith("account:")) {
                        setForm((current) => ({ ...current, accountId: value.slice("account:".length), categoryId: "__all__" }));
                      } else {
                        setForm((current) => ({ ...current, accountId: "__none__", categoryId: value }));
                      }
                    }}
                  >
                    <option value="__all__">All spending</option>
                    <optgroup label="Categories">
                      {data.categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Accounts">
                      {data.accounts.map((account) => (
                        <option key={account.id} value={`account:${account.id}`}>
                          {account.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <label className="budget-editor__field">
                  <span>Cadence</span>
                  <select value={form.cadence} onChange={(event) => updateFormField("cadence", event.target.value as BudgetCadence)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Yearly</option>
                  </select>
                </label>
              </div>

              <div className="budget-editor__inline-controls">
                <label className="budget-editor__field">
                  <span>Currency</span>
                  <input value={form.currency} onChange={(event) => updateFormField("currency", event.target.value)} placeholder="PHP" />
                </label>

                <label className="budget-editor__field">
                  <span>Amount</span>
                  <input
                    inputMode="decimal"
                    value={form.targetAmount}
                    onChange={(event) => updateFormField("targetAmount", event.target.value)}
                    placeholder="5000"
                  />
                </label>
              </div>
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
              <button className="button button-primary button-pill" type="button" onClick={saveBudget} disabled={saving || !form.targetAmount.trim()}>
                {saving ? "Saving..." : editingBudget ? "Save changes" : "Save budget"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyBudgetId ? (
        <div className="budget-history__backdrop" role="presentation" onClick={closeHistoryModal}>
          <div
            className="budget-history glass"
            role="dialog"
            aria-modal="true"
            aria-label="Budget history"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="budget-history__head">
              <div>
                <p className="eyebrow">Budget history</p>
                <h4>{historyData?.budget.name ?? selectedHistoryBudget?.name ?? "Budget"}</h4>
                <p className="budget-history__subhead">
                  {historyData?.budget.categoryName ?? selectedHistoryBudget?.categoryName ?? "All Categories"} ·{" "}
                  {cadenceLabels[historyData?.budget.cadence ?? selectedHistoryBudget?.cadence ?? "monthly"]} ·{" "}
                  {historyData?.budget.scope ?? selectedHistoryBudget?.scope ?? "global"}
                </p>
              </div>
              <button className="icon-button" type="button" onClick={closeHistoryModal} aria-label="Close budget history">
                ×
              </button>
            </div>

            {historyLoading ? (
              <div className="budget-history__loading">
                <div className="budget-history__skeleton" />
                <div className="budget-history__skeleton" />
                <div className="budget-history__skeleton" />
              </div>
            ) : historyError ? (
              <p className="budget-history__error">{historyError}</p>
            ) : historyData ? (
              <div className="budget-history__body">
                <div className="budget-history__chart">
                  {historyData.history.points.map((point) => (
                    <div key={point.periodStart} className={`budget-history__point budget-history__point--${point.stage}`}>
                      <div className="budget-history__point-head">
                        <span>{point.label}</span>
                        <strong>{toPercentage(point.progressPercent)}</strong>
                      </div>
                      <div className="budget-history__bar" aria-hidden="true">
                        <span
                          className={`budget-history__bar-fill budget-history__bar-fill--${point.stage}`}
                          style={{ width: `${Math.min(point.progressPercent, 100)}%` }}
                        />
                      </div>
                      <div className="budget-history__point-meta">
                        <span>
                          {formatCurrency(point.actualAmount, historyData.budget.currency)} of{" "}
                          {formatCurrency(point.targetAmount, historyData.budget.currency)}
                        </span>
                        <span>{point.stage === "exceeded" ? "Over limit" : point.stage === "critical" ? "At risk" : "Tracked"}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="budget-history__activity">
                  <div className="budget-history__activity-head">
                    <h5>Recent activity</h5>
                    <span>{historyData.history.recentTransactions.length} items</span>
                  </div>
                  <div className="budget-history__activity-list">
                    {historyData.history.recentTransactions.length > 0 ? (
                      historyData.history.recentTransactions.map((transaction) => (
                        <div key={transaction.id} className="budget-history__activity-item">
                          <div>
                            <strong>{transaction.merchantName}</strong>
                            <span>
                              {transaction.categoryName ?? "Uncategorized"} · {formatShortDate(transaction.date)}
                            </span>
                          </div>
                          <div className="budget-history__activity-meta">
                            <strong>{formatCurrency(transaction.amount, historyData.budget.currency)}</strong>
                            <span>{transaction.type === "income" ? "Income" : "Expense"}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="budget-history__empty">No recent activity found for this budget.</p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

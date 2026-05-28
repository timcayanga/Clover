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

const stageCopy: Record<BudgetStage, { label: string; hint: string; tone: "positive" | "warning" | "danger" }> = {
  safe: { label: "Room left", hint: "Healthy breathing room remains.", tone: "positive" },
  watch: { label: "Halfway there", hint: "The budget is moving faster.", tone: "warning" },
  warning: { label: "Getting tight", hint: "This one needs a closer eye.", tone: "warning" },
  critical: { label: "Near the edge", hint: "A slowdown would help.", tone: "danger" },
  exceeded: { label: "Over limit", hint: "The cap has already been crossed.", tone: "danger" },
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

export function BudgetingWorkspace({ initialData }: BudgetingWorkspaceProps) {
  const [data, setData] = useState<BudgetingData>(initialData);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [form, setForm] = useState<BudgetFormState>(() => defaultFormState(initialData.budgets[0]?.currency ?? "PHP"));
  const [saving, setSaving] = useState(false);
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
        : defaultFormState(nextCurrency)
    );
  }, [data.accounts, data.categories, editingBudget, isEditorOpen]);

  const totalProgress = data.overview.totalProgressPercent;
  const totalBudgeted = data.overview.totalTargetAmount;
  const totalUsed = data.overview.totalActualAmount;
  const activeAlerts = data.overview.alerts;
  const openBudgetCount = data.overview.activeBudgetCount;
  const visibleBudgets = data.budgets;
  const gaugeSize = 124;
  const gaugeStroke = 12;
  const gaugeRadius = (gaugeSize - gaugeStroke) / 2;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeDash = (Math.min(Math.max(totalProgress, 0), 100) / 100) * gaugeCircumference;
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
    setError(null);
    setIsEditorOpen(false);
  };

  const openCreateEditor = () => {
    setEditingBudgetId(null);
    setError(null);
    setIsEditorOpen(true);
  };

  const openEditEditor = (budgetId: string) => {
    setEditingBudgetId(budgetId);
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

  const saveBudget = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      scope: form.kind === "savings_target" ? "global" : form.scope,
      cadence: form.cadence,
      targetAmount: Number(form.targetAmount),
      currency: form.currency.trim() || "PHP",
      accountId: form.scope === "account" ? form.accountId || null : null,
      categoryId: form.scope === "category" ? form.categoryId || null : null,
    };

    try {
      const response = await fetch(editingBudgetId ? `/api/budgets/${editingBudgetId}` : "/api/budgets", {
        method: editingBudgetId ? "PATCH" : "POST",
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
      <section className="budgeting-hero glass">
        <div className="budgeting-hero__copy">
          <p className="eyebrow">Budgeting</p>
          <h3>Set guardrails that your whole Clover workspace can respect.</h3>
          <p>
            Build budgets for whole accounts, specific categories, or your entire spending picture. When a budget reaches 50%, 70%, 90%,
            or 100%, Clover will surface the warning in Budgeting, Notifications, Home, and Adviser.
          </p>
          <div className="budgeting-hero__actions">
            <button className="button button-primary button-pill" type="button" onClick={openCreateEditor}>
              Set budget
            </button>
            <span className="budgeting-hero__note">Separate from Goals, but still goal-aware.</span>
          </div>
        </div>

        <div className="budgeting-hero__ring glass">
          <div className="budgeting-ring" role="img" aria-label="Overall budget progress">
            <svg viewBox={`0 0 ${gaugeSize} ${gaugeSize}`}>
              <circle cx={gaugeSize / 2} cy={gaugeSize / 2} r={gaugeRadius} className="budgeting-ring__track" />
              <circle
                cx={gaugeSize / 2}
                cy={gaugeSize / 2}
                r={gaugeRadius}
                className="budgeting-ring__progress"
                style={{
                  strokeDasharray: `${gaugeDash} ${gaugeCircumference}`,
                }}
              />
            </svg>
            <div className="budgeting-ring__center">
              <strong>{toPercentage(totalProgress)}</strong>
              <span>overall usage</span>
            </div>
          </div>

          <div className="budgeting-hero__stats">
            <div>
              <span>Active budgets</span>
              <strong>{openBudgetCount}</strong>
            </div>
            <div>
              <span>Alerts</span>
              <strong>{activeAlerts.length}</strong>
            </div>
            <div>
              <span>Tracked</span>
              <strong>{formatCurrency(totalUsed, data.budgets[0]?.currency ?? "PHP")}</strong>
            </div>
            <div>
              <span>Budgeted</span>
              <strong>{formatCurrency(totalBudgeted, data.budgets[0]?.currency ?? "PHP")}</strong>
            </div>
          </div>
        </div>
      </section>

      {activeAlerts.length > 0 ? (
        <section className="budgeting-alert-strip">
          {activeAlerts.slice(0, 3).map((alert) => {
            const copy = stageCopy[alert.stage];
            return (
              <article key={alert.id} className={`budgeting-alert budgeting-alert--${copy.tone} glass`}>
                <div className="budgeting-alert__head">
                  <span className="pill pill-subtle">{alert.kindLabel}</span>
                  <span className="pill pill-subtle">{alert.periodLabel}</span>
                </div>
                <h4>{alert.name}</h4>
                <p>{copy.hint}</p>
                <div className="budgeting-alert__meta">
                  <strong>{formatCurrency(alert.actualAmount, alert.currency)} of {formatCurrency(alert.targetAmount, alert.currency)}</strong>
                  <span>{toPercentage(alert.progressPercent)}</span>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}

      <section className="budgeting-body">
        <div className="budgeting-body__main">
          <div className="budgeting-toolbar">
            <div>
              <p className="eyebrow">Budgets</p>
              <h4>{visibleBudgets.length === 0 ? "Create your first budget" : "Active guardrails"}</h4>
            </div>
            <button className="button button-secondary button-pill" type="button" onClick={openCreateEditor}>
              Add budget
            </button>
          </div>

          {visibleBudgets.length > 0 ? (
            <div className="budgeting-grid">
              {visibleBudgets.map((budget) => {
                const copy = stageCopy[budget.stage];
                const nextThreshold = budget.nextThreshold === null ? "Limit reached" : `${budget.nextThreshold}% next`;
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
                      <div className={`pill ${isOver ? "pill-danger" : "pill-subtle"}`}>{copy.label}</div>
                    </div>

                    <div className="budget-card__progress">
                      <div className="budget-card__amounts">
                        <strong>{formatCurrency(budget.actualAmount, budget.currency)}</strong>
                        <span>of {formatCurrency(budget.targetAmount, budget.currency)}</span>
                      </div>
                      <span>{toPercentage(budget.progressPercent)}</span>
                    </div>
                    <div className="budget-card__bar" aria-hidden="true">
                      <span className={`budget-card__bar-fill budget-card__bar-fill--${budget.stage}`} style={{ width: `${Math.min(budget.progressPercent, 100)}%` }} />
                    </div>
                    <div className="budget-card__meta">
                      <span>{budget.periodLabel}</span>
                      <span>{nextThreshold}</span>
                    </div>
                    <p className="budget-card__detail">{budget.statusDetail}</p>
                    <div className="budget-card__actions">
                      <button className="pill-link pill-link--inline" type="button" onClick={() => openEditEditor(budget.id)}>
                        Edit
                      </button>
                      <span className="budget-card__remaining">
                        {budget.stage === "exceeded"
                          ? `${formatCurrency(Math.abs(budget.remainingAmount), budget.currency)} over`
                          : `${formatCurrency(Math.max(budget.remainingAmount, 0), budget.currency)} left`}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <article className="budget-empty glass">
              <p className="eyebrow">Nothing yet</p>
              <h4>Set a budget to start watching limits in real time.</h4>
              <p>Use a global cap, a per-account limit, or a category limit. Clover will keep the thresholds visible wherever you work.</p>
              <button className="button button-primary button-pill" type="button" onClick={openCreateEditor}>
                Create budget
              </button>
            </article>
          )}
        </div>

        <aside className="budgeting-body__rail">
          <article className="budget-rail glass">
            <div className="report-card__head report-card__head--compact">
              <div>
                <h4>Notification thresholds</h4>
              </div>
            </div>
            <div className="budget-thresholds">
              {[
                { label: "50%", detail: "Early heads-up" },
                { label: "70%", detail: "Time to slow down" },
                { label: "90%", detail: "Strong warning" },
                { label: "100%", detail: "Limit reached" },
              ].map((threshold) => (
                <div key={threshold.label} className="budget-threshold">
                  <strong>{threshold.label}</strong>
                  <span>{threshold.detail}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="budget-rail glass">
            <div className="report-card__head report-card__head--compact">
              <div>
                <h4>Budget by scope</h4>
              </div>
            </div>
            <div className="budget-scope-list">
              {[
                { label: "Global", count: data.budgets.filter((budget) => budget.scope === "global").length },
                { label: "Accounts", count: data.budgets.filter((budget) => budget.scope === "account").length },
                { label: "Categories", count: data.budgets.filter((budget) => budget.scope === "category").length },
              ].map((entry) => (
                <div key={entry.label} className="budget-scope-item">
                  <strong>{entry.label}</strong>
                  <span>{entry.count}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="budget-rail glass">
            <div className="report-card__head report-card__head--compact">
              <div>
                <h4>Goal tie-in</h4>
              </div>
            </div>
            <p className="budget-rail__copy">
              Budgeting helps saving goals breathe and spending goals stay honest. Adviser can read this same pressure data to keep advice
              more structured.
            </p>
          </article>
        </aside>
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
              <label className="budget-editor__field">
                <span>Name</span>
                <input value={form.name} onChange={(event) => updateFormField("name", event.target.value)} placeholder="Groceries cap" />
              </label>

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
                {form.kind === "savings_target" ? <small>Savings targets are global by design.</small> : null}
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

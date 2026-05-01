"use client";

import { useEffect, useMemo, useState } from "react";
import type { TransactionType } from "@/lib/domain-types";

type CategoryRecord = {
  id: string;
  name: string;
  type: TransactionType;
  isSystem: boolean;
  isArchived: boolean;
};

type CategoryDraft = {
  name: string;
  type: TransactionType;
};

const CATEGORY_TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
];

const normalizeName = (value: string) => value.trim().toLowerCase();

function categoryTypeLabel(type: TransactionType) {
  return CATEGORY_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function CategoryBadge({ label, muted = false }: { label: string; muted?: boolean }) {
  return <span className={`settings-pill${muted ? " settings-pill--muted" : ""}`}>{label}</span>;
}

export function SettingsCategoriesPanel({ workspaceId }: { workspaceId: string }) {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CategoryDraft>>({});
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<TransactionType>("expense");
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyCategoryId, setBusyCategoryId] = useState<string | null>(null);
  const [isSavingNewCategory, setIsSavingNewCategory] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/categories?workspaceId=${encodeURIComponent(workspaceId)}&includeArchived=true`);
        const payload = (await response.json().catch(() => ({}))) as { categories?: CategoryRecord[]; error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load categories.");
        }

        if (cancelled) {
          return;
        }

        const nextCategories = Array.isArray(payload.categories) ? payload.categories : [];
        setCategories(nextCategories);
        setDrafts((current) => {
          const next: Record<string, CategoryDraft> = { ...current };
          for (const category of nextCategories) {
            if (!next[category.id]) {
              next[category.id] = { name: category.name, type: category.type };
            }
          }
          return next;
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load categories.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const activeBuiltInCategories = useMemo(
    () => categories.filter((category) => !category.isArchived && category.isSystem),
    [categories]
  );
  const activeCustomCategories = useMemo(
    () => categories.filter((category) => !category.isArchived && !category.isSystem),
    [categories]
  );
  const archivedCategories = useMemo(() => categories.filter((category) => category.isArchived), [categories]);

  const upsertCategory = (category: CategoryRecord) => {
    setCategories((current) => {
      const index = current.findIndex((entry) => entry.id === category.id);
      if (index >= 0) {
        return current.map((entry) => (entry.id === category.id ? category : entry));
      }

      return [category, ...current];
    });
    setDrafts((current) => ({
      ...current,
      [category.id]: {
        name: category.name,
        type: category.type,
      },
    }));
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      setStatusMessage("Enter a category name first.");
      return;
    }

    setIsSavingNewCategory(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          name,
          type: newCategoryType,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { category?: CategoryRecord; error?: string };
      if (!response.ok || !payload.category) {
        throw new Error(payload.error ?? "Unable to create category.");
      }

      upsertCategory(payload.category);
      setNewCategoryName("");
      setNewCategoryType("expense");
      setStatusMessage(`${payload.category.name} is now available in Transactions.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create category.");
    } finally {
      setIsSavingNewCategory(false);
    }
  };

  const saveCategory = async (categoryId: string) => {
    const draft = drafts[categoryId];
    if (!draft) {
      return;
    }

    const current = categories.find((category) => category.id === categoryId);
    if (!current) {
      return;
    }

    const nextName = draft.name.trim();
    if (!nextName) {
      setStatusMessage("Category names cannot be empty.");
      return;
    }

    if (current.isSystem) {
      setStatusMessage("Built-in categories are locked.");
      return;
    }

    setBusyCategoryId(categoryId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/categories", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: categoryId,
          name: nextName,
          type: draft.type,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { category?: CategoryRecord; error?: string };
      if (!response.ok || !payload.category) {
        throw new Error(payload.error ?? "Unable to update category.");
      }

      upsertCategory(payload.category);
      setStatusMessage(`${payload.category.name} was updated.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update category.");
    } finally {
      setBusyCategoryId(null);
    }
  };

  const archiveCategory = async (categoryId: string) => {
    const current = categories.find((category) => category.id === categoryId);
    if (!current) {
      return;
    }

    setBusyCategoryId(categoryId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/categories", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: categoryId }),
      });

      const payload = (await response.json().catch(() => ({}))) as { category?: CategoryRecord; error?: string };
      if (!response.ok || !payload.category) {
        throw new Error(payload.error ?? "Unable to archive category.");
      }

      upsertCategory(payload.category);
      setStatusMessage(`${current.name} was removed from pickers.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to archive category.");
    } finally {
      setBusyCategoryId(null);
    }
  };

  const restoreCategory = async (categoryId: string) => {
    const current = categories.find((category) => category.id === categoryId);
    if (!current) {
      return;
    }

    setBusyCategoryId(categoryId);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/categories", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: categoryId,
          isArchived: false,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { category?: CategoryRecord; error?: string };
      if (!response.ok || !payload.category) {
        throw new Error(payload.error ?? "Unable to restore category.");
      }

      upsertCategory(payload.category);
      setStatusMessage(`${payload.category.name} is available in Transactions again.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to restore category.");
    } finally {
      setBusyCategoryId(null);
    }
  };

  const summary = useMemo(
    () => ({
      activeBuiltIn: activeBuiltInCategories.length,
      activeCustom: activeCustomCategories.length,
      archived: archivedCategories.length,
    }),
    [activeBuiltInCategories.length, activeCustomCategories.length, archivedCategories.length]
  );

  return (
    <section className="settings-category-manager">
      <div className="settings-section__intro">
        <div>
          <p className="eyebrow">Categories</p>
          <h4>Workspace categories</h4>
          <p>
            Built-in categories stay protected. Custom categories are workspace-specific and appear in Transactions without
            changing Clover&apos;s trained statement mappings.
          </p>
        </div>
        <div className="settings-profile-summary">
          <span className="settings-profile-summary__label">Built-in</span>
          <strong>{summary.activeBuiltIn}</strong>
          <span className="settings-profile-summary__label">Custom</span>
          <strong>{summary.activeCustom}</strong>
          <span className="settings-profile-summary__label">Archived</span>
          <strong>{summary.archived}</strong>
        </div>
      </div>

      <article className="settings-action-card settings-category-creator">
        <div>
          <h5>Add custom category</h5>
          <p>Create workspace-specific categories for Transactions only. Use archive instead of hard delete so old rows stay traceable.</p>
        </div>
        <div className="settings-category-creator__fields">
          <label className="settings-inline-field">
            <span>Name</span>
            <input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="e.g. Side hustle"
            />
          </label>
          <label className="settings-inline-field">
            <span>Type</span>
            <select value={newCategoryType} onChange={(event) => setNewCategoryType(event.target.value as TransactionType)}>
              {CATEGORY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="button button-primary button-small" onClick={() => void createCategory()} disabled={isSavingNewCategory}>
            {isSavingNewCategory ? "Adding..." : "Add category"}
          </button>
        </div>
      </article>

      <div className="settings-category-columns">
        <section className="settings-category-list">
          <div className="settings-category-list__head">
            <h5>Built-in categories</h5>
            <CategoryBadge label="Locked" />
          </div>
          <div className="settings-category-grid">
            {isLoading ? (
              <p className="settings-helper">Loading categories...</p>
            ) : activeBuiltInCategories.length > 0 ? (
              activeBuiltInCategories.map((category) => (
                <article key={category.id} className="settings-category-card settings-category-card--locked">
                  <div className="settings-category-card__main">
                    <div className="settings-category-card__title">
                      <strong>{category.name}</strong>
                      <CategoryBadge label={categoryTypeLabel(category.type)} muted />
                    </div>
                    <p className="settings-helper">Built-in Clover category.</p>
                  </div>
                </article>
              ))
            ) : (
              <p className="settings-helper">No built-in categories found.</p>
            )}
          </div>
        </section>

        <section className="settings-category-list">
          <div className="settings-category-list__head">
            <h5>Custom categories</h5>
            <CategoryBadge label="Workspace" muted />
          </div>
          <div className="settings-category-grid">
            {activeCustomCategories.length > 0 ? (
              activeCustomCategories.map((category) => {
                const draft = drafts[category.id] ?? { name: category.name, type: category.type };
                const hasChanges = normalizeName(draft.name) !== normalizeName(category.name) || draft.type !== category.type;
                const busy = busyCategoryId === category.id;

                return (
                  <article key={category.id} className="settings-category-card">
                    <div className="settings-category-card__main">
                      <div className="settings-category-card__title">
                        <CategoryBadge label="Custom" muted />
                        <span className="settings-category-card__subtitle">Appears in Transactions</span>
                      </div>
                      <div className="settings-category-card__fields">
                        <label className="settings-inline-field">
                          <span>Name</span>
                          <input
                            value={draft.name}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [category.id]: {
                                  ...draft,
                                  name: event.target.value,
                                },
                              }))
                            }
                            disabled={busy}
                          />
                        </label>
                        <label className="settings-inline-field">
                          <span>Type</span>
                          <select
                            value={draft.type}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [category.id]: {
                                  ...draft,
                                  type: event.target.value as TransactionType,
                                },
                              }))
                            }
                            disabled={busy}
                          >
                            {CATEGORY_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                    <div className="settings-category-card__actions">
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => void saveCategory(category.id)}
                        disabled={busy || !hasChanges}
                      >
                        {busy ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        className="button button-danger button-small"
                        onClick={() => void archiveCategory(category.id)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="settings-helper">No custom categories yet.</p>
            )}
          </div>
        </section>

        {archivedCategories.length > 0 ? (
          <section className="settings-category-list settings-category-list--archived">
            <div className="settings-category-list__head">
              <h5>Archived categories</h5>
              <CategoryBadge label="Hidden" muted />
            </div>
            <div className="settings-category-grid">
              {archivedCategories.map((category) => {
                const busy = busyCategoryId === category.id;

                return (
                  <article key={category.id} className="settings-category-card settings-category-card--archived">
                    <div className="settings-category-card__main">
                      <div className="settings-category-card__title">
                        <strong>{category.name}</strong>
                        <CategoryBadge label={category.isSystem ? "Built-in" : "Custom"} muted />
                        <CategoryBadge label={categoryTypeLabel(category.type)} muted />
                      </div>
                      <p className="settings-helper">Archived categories stay hidden from pickers until restored.</p>
                    </div>
                    <div className="settings-category-card__actions">
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={() => void restoreCategory(category.id)}
                        disabled={busy}
                      >
                        {busy ? "Restoring..." : "Restore"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      {errorMessage ? <p className="settings-status settings-status--error">{errorMessage}</p> : null}
      {statusMessage ? <p className="settings-status">{statusMessage}</p> : null}
    </section>
  );
}

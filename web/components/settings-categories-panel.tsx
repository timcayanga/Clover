"use client";

import { useEffect, useMemo, useState } from "react";
import type { TransactionType } from "@/lib/domain-types";
import { CategoryBrandMark } from "@/components/category-brand-mark";

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

function CategoryIcon({ category }: { category: CategoryRecord }) {
  return <CategoryBrandMark categoryName={category.name} size={34} radius={12} />;
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

  return (
    <section className="settings-category-manager">
      <div className="settings-section__intro">
        <div>
          <h4>Categories</h4>
        </div>
      </div>

      <section className="settings-category-section settings-category-section--panel glass" aria-label="Built-in categories">
        <div className="settings-category-section__head">
          <h5>Built-in categories</h5>
        </div>
        <div className="settings-category-table settings-category-table--compact">
          {isLoading ? (
            <div className="settings-category-table__empty">Loading categories...</div>
          ) : (
            activeBuiltInCategories.map((category) => (
              <div
                key={category.id}
                className="settings-category-table__row settings-category-table__row--compact settings-category-table__row--built-in"
              >
                <div className="settings-category-table__name">
                  <CategoryIcon category={category} />
                  <div className="settings-category-table__name-copy">
                    <strong>{category.name}</strong>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="settings-category-section settings-category-section--panel glass" aria-label="Custom categories">
        <div className="settings-category-section__head">
          <h5>Custom categories</h5>
        </div>

        <article className="settings-action-card settings-category-creator glass">
          <div className="settings-category-creator__fields">
            <label className="settings-inline-field">
              <span>Name</span>
              <input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="e.g. Side hustle" />
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

        <div className="settings-category-table settings-category-table--compact">
          {isLoading ? (
            <div className="settings-category-table__empty">Loading categories...</div>
          ) : activeCustomCategories.length > 0 ? (
            activeCustomCategories.map((category) => {
              const draft = drafts[category.id] ?? { name: category.name, type: category.type };
              const hasChanges = normalizeName(draft.name) !== normalizeName(category.name) || draft.type !== category.type;
              const busy = busyCategoryId === category.id;

              return (
                <div
                  key={category.id}
                  className="settings-category-table__row settings-category-table__row--compact settings-category-table__row--custom"
                >
                  <div className="settings-category-table__name">
                    <CategoryIcon category={category} />
                    <div className="settings-category-table__name-copy">
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
                    </div>
                  </div>

                  <div className="settings-category-table__actions">
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
                </div>
              );
            })
          ) : null}
        </div>
      </section>

      {errorMessage ? <p className="settings-status settings-status--error">{errorMessage}</p> : null}
      {statusMessage ? <p className="settings-status">{statusMessage}</p> : null}
    </section>
  );
}

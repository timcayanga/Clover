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
  parentCategoryId: string | null;
};

type CategoryDraft = {
  name: string;
  type: TransactionType;
  parentCategoryId: string;
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
  const [newCategoryParentId, setNewCategoryParentId] = useState("");
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
              next[category.id] = { name: category.name, type: category.type, parentCategoryId: category.parentCategoryId ?? "" };
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
        parentCategoryId: category.parentCategoryId ?? "",
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
          parentCategoryId: newCategoryParentId || null,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { category?: CategoryRecord; error?: string };
      if (!response.ok || !payload.category) {
        throw new Error(payload.error ?? "Unable to create category.");
      }

      upsertCategory(payload.category);
      setNewCategoryName("");
      setNewCategoryType("expense");
      setNewCategoryParentId("");
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
          parentCategoryId: draft.parentCategoryId || null,
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

  const renderCategoryRow = (category: CategoryRecord) => {
    const draft = drafts[category.id] ?? { name: category.name, type: category.type, parentCategoryId: category.parentCategoryId ?? "" };
    const hasChanges =
      normalizeName(draft.name) !== normalizeName(category.name) ||
      draft.type !== category.type ||
      draft.parentCategoryId !== (category.parentCategoryId ?? "");
    const busy = busyCategoryId === category.id;
    const inputId = `settings-category-name-${category.id}`;

    return (
      <div
        key={category.id}
        className={`settings-category-table__row settings-category-table__row--compact ${
          category.isSystem ? "settings-category-table__row--built-in" : "settings-category-table__row--custom"
        }`}
      >
        <div className="settings-category-table__name">
          <button
            type="button"
            className="settings-category-icon-button"
            aria-label={`Edit ${category.name}`}
            onClick={() => document.getElementById(inputId)?.focus()}
          >
            <CategoryIcon category={{ ...category, name: draft.name || category.name }} />
          </button>
          <div className="settings-category-table__name-copy">
            <input
              id={inputId}
              aria-label={`${category.name} category name`}
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

        {!category.isSystem ? (
          <label className="settings-category-table__group">
            <span className="sr-only">Group for {category.name}</span>
            <select
              value={draft.parentCategoryId}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [category.id]: { ...draft, parentCategoryId: event.target.value },
                }))
              }
              disabled={busy}
              aria-label={`Group for ${category.name}`}
            >
              <option value="">Top level</option>
              {categories
                .filter((entry) => !entry.isArchived && !entry.parentCategoryId && entry.id !== category.id)
                .map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            </select>
          </label>
        ) : null}

        <div className="settings-category-table__actions">
          <button
            type="button"
            className="settings-category-icon-action settings-category-icon-action--save"
            aria-label={`Save ${category.name}`}
            title="Save"
            onClick={() => void saveCategory(category.id)}
            disabled={busy || !hasChanges}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 12 4 4L19 6" />
            </svg>
          </button>
          <button
            type="button"
            className="settings-category-icon-action settings-category-icon-action--delete"
            aria-label={`Delete ${category.name}`}
            title="Delete"
            onClick={() => void archiveCategory(category.id)}
            disabled={busy}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="settings-category-manager">
      <div className="settings-section__intro">
        <div>
          <h4>Categories</h4>
        </div>
      </div>

      <section className="settings-category-section" aria-label="Categories">
        <div className="settings-category-table settings-category-table--compact settings-category-table--plain">
          {isLoading ? <div className="settings-category-table__empty">Loading categories...</div> : activeBuiltInCategories.map(renderCategoryRow)}
        </div>
      </section>

      <section className="settings-category-section settings-category-section--custom" aria-label="Custom categories">
        <div className="settings-category-section__head">
          <h5>Custom categories</h5>
        </div>

        <div className="settings-category-creator">
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
            <label className="settings-inline-field">
              <span>Group</span>
              <select value={newCategoryParentId} onChange={(event) => setNewCategoryParentId(event.target.value)}>
                <option value="">Top level</option>
                {categories
                  .filter((category) => !category.isArchived && !category.parentCategoryId)
                  .map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <button type="button" className="button button-primary button-small" onClick={() => void createCategory()} disabled={isSavingNewCategory}>
              {isSavingNewCategory ? "Adding..." : "Add category"}
            </button>
          </div>
        </div>

        <div className="settings-category-table settings-category-table--compact settings-category-table--plain">
          {isLoading ? (
            <div className="settings-category-table__empty">Loading categories...</div>
          ) : activeCustomCategories.length > 0 ? (
            activeCustomCategories.map(renderCategoryRow)
          ) : null}
        </div>
      </section>

      {errorMessage ? <p className="settings-status settings-status--error">{errorMessage}</p> : null}
      {statusMessage ? <p className="settings-status">{statusMessage}</p> : null}
    </section>
  );
}

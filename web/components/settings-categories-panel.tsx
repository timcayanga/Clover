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

type CategoryIconVariant =
  | "income"
  | "food"
  | "transport"
  | "housing"
  | "bills"
  | "travel"
  | "entertainment"
  | "shopping"
  | "health"
  | "education"
  | "financial"
  | "gifts"
  | "business"
  | "cash"
  | "transfer"
  | "other"
  | "spark"
  | "star"
  | "tag"
  | "leaf";

const CUSTOM_CATEGORY_ICON_VARIANTS: CategoryIconVariant[] = ["spark", "star", "tag", "leaf", "business", "shopping", "health", "travel"];

const CATEGORY_ICON_STYLE_TONES = [
  { background: "rgba(3, 168, 192, 0.12)", color: "var(--accent)" },
  { background: "rgba(110, 231, 183, 0.18)", color: "rgb(5, 150, 105)" },
  { background: "rgba(15, 23, 42, 0.08)", color: "rgb(71, 85, 105)" },
  { background: "rgba(56, 189, 248, 0.14)", color: "rgb(2, 132, 199)" },
  { background: "rgba(167, 139, 250, 0.16)", color: "rgb(109, 40, 217)" },
  { background: "rgba(251, 191, 36, 0.16)", color: "rgb(180, 83, 9)" },
] as const;

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function getCategoryIconVariant(category: CategoryRecord): CategoryIconVariant {
  const normalized = normalizeName(category.name);

  if (!category.isSystem) {
    return CUSTOM_CATEGORY_ICON_VARIANTS[hashString(normalized) % CUSTOM_CATEGORY_ICON_VARIANTS.length];
  }

  if (normalized === "income") return "income";
  if (normalized === "food & dining") return "food";
  if (normalized === "transport") return "transport";
  if (normalized === "housing") return "housing";
  if (normalized === "bills & utilities") return "bills";
  if (normalized === "travel & lifestyle") return "travel";
  if (normalized === "entertainment") return "entertainment";
  if (normalized === "shopping") return "shopping";
  if (normalized === "health & wellness") return "health";
  if (normalized === "education") return "education";
  if (normalized === "financial") return "financial";
  if (normalized === "gifts & donations") return "gifts";
  if (normalized === "business") return "business";
  if (normalized === "cash & atm") return "cash";
  if (normalized === "transfers") return "transfer";
  return "other";
}

function getCategoryIconTone(category: CategoryRecord) {
  const base = CATEGORY_ICON_STYLE_TONES[hashString(category.name) % CATEGORY_ICON_STYLE_TONES.length];
  if (category.isSystem) {
    return category.type === "income"
      ? { background: "rgba(34, 197, 94, 0.14)", color: "rgb(22, 101, 52)" }
      : category.type === "transfer"
        ? { background: "rgba(99, 102, 241, 0.14)", color: "rgb(67, 56, 202)" }
        : { background: "rgba(3, 168, 192, 0.12)", color: "var(--accent)" };
  }

  return base;
}

function CategoryIconPath({ variant }: { variant: CategoryIconVariant }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };

  switch (variant) {
    case "income":
      return (
        <>
          <path d="M7 14.5 12 9.5l5 5" {...common} />
          <path d="M12 9.5V18" {...common} />
        </>
      );
    case "food":
      return (
        <>
          <path d="M8 4v16" {...common} />
          <path d="M12 4v16" {...common} />
          <path d="M16 4v16" {...common} />
          <path d="M7 8h6" {...common} />
          <path d="M12 8h5" {...common} />
        </>
      );
    case "transport":
      return (
        <>
          <path d="M5 14h14" {...common} />
          <path d="M7 14V9.8c0-.8.6-1.5 1.4-1.6l7-.9c1-.1 1.9.5 2.2 1.4l1.4 4.3" {...common} />
          <circle cx="8.5" cy="15.5" r="1.25" {...common} />
          <circle cx="15.5" cy="15.5" r="1.25" {...common} />
        </>
      );
    case "housing":
      return (
        <>
          <path d="M4.5 11.5 12 5l7.5 6.5" {...common} />
          <path d="M6.5 10.8V19h11v-8.2" {...common} />
          <path d="M10 19v-4h4v4" {...common} />
        </>
      );
    case "bills":
      return (
        <>
          <path d="M13.5 3.5 7 13h4l-1 7 7-10h-4l1.5-6.5Z" {...common} />
        </>
      );
    case "travel":
      return (
        <>
          <path d="M4.5 14.5 19.5 7l-6.5 15-2.2-6.2-6.3-1.3Z" {...common} />
          <path d="m11.2 15.8 4.8-4.8" {...common} />
        </>
      );
    case "entertainment":
      return (
        <>
          <path d="m12 5 1.4 4.1L17.5 10l-4.1 1.4L12 15.5l-1.4-4.1L6.5 10l4.1-1.4L12 5Z" {...common} />
        </>
      );
    case "shopping":
      return (
        <>
          <path d="M6.5 8h11l-1 11h-9l-1-11Z" {...common} />
          <path d="M9 8a3 3 0 0 1 6 0" {...common} />
        </>
      );
    case "health":
      return (
        <>
          <path d="M12 18 5.5 11.8A3.8 3.8 0 0 1 12 7.5a3.8 3.8 0 0 1 6.5 4.3L12 18Z" {...common} />
        </>
      );
    case "education":
      return (
        <>
          <path d="M5 8.5 12 5l7 3.5-7 3.5-7-3.5Z" {...common} />
          <path d="M7.5 10v4.5c0 1.5 2 2.8 4.5 2.8s4.5-1.3 4.5-2.8V10" {...common} />
        </>
      );
    case "financial":
      return (
        <>
          <path d="M5 17h14" {...common} />
          <path d="M7 15V9" {...common} />
          <path d="M11 15V7.5" {...common} />
          <path d="M15 15V11" {...common} />
        </>
      );
    case "gifts":
      return (
        <>
          <path d="M5 9h14v4H5z" {...common} />
          <path d="M6.5 13v6h11v-6" {...common} />
          <path d="M12 9v10" {...common} />
          <path d="M12 9c-1.8 0-3-1-3-2.2 0-1 .8-1.8 1.8-1.8 1.7 0 3.2 2.3 3.2 4Z" {...common} />
          <path d="M12 9c1.8 0 3-1 3-2.2 0-1-.8-1.8-1.8-1.8-1.7 0-3.2 2.3-3.2 4Z" {...common} />
        </>
      );
    case "business":
      return (
        <>
          <rect x="5" y="7" width="14" height="12" rx="2" {...common} />
          <path d="M9 7V5.5h6V7" {...common} />
          <path d="M5 12h14" {...common} />
        </>
      );
    case "cash":
      return (
        <>
          <rect x="4.5" y="7" width="15" height="10" rx="2" {...common} />
          <path d="M8 12h8" {...common} />
          <circle cx="12" cy="12" r="2" {...common} />
        </>
      );
    case "transfer":
      return (
        <>
          <path d="M7 7h10" {...common} />
          <path d="M10 4 7 7l3 3" {...common} />
          <path d="M17 17H7" {...common} />
          <path d="M14 14 17 17l-3 3" {...common} />
        </>
      );
    case "spark":
      return (
        <>
          <path d="m12 4 1.3 4.1L17.5 9.5l-4.2 1.4L12 15l-1.3-4.1-4.2-1.4 4.2-1.4L12 4Z" {...common} />
        </>
      );
    case "star":
      return (
        <>
          <path d="m12 4 1.9 4 4.4.6-3.2 3.1.8 4.4-3.9-2.1-3.9 2.1.8-4.4-3.2-3.1 4.4-.6L12 4Z" {...common} />
        </>
      );
    case "tag":
      return (
        <>
          <path d="M5.5 9.5 11 4h7.5v7.5L13 17l-7.5-7.5Z" {...common} />
          <circle cx="15.2" cy="8.2" r="1.1" {...common} />
        </>
      );
    case "leaf":
      return (
        <>
          <path d="M19 5c-5.5 0-10 4.5-10 10 0 2.8 1.2 4.5 1.2 4.5s1.7-.2 4.5-1.2C19.5 17 19 5 19 5Z" {...common} />
          <path d="M9 15c1.2-1.8 3.1-3.6 6-5.2" {...common} />
        </>
      );
    case "other":
    default:
      return (
        <>
          <circle cx="12" cy="12" r="4.5" {...common} />
          <path d="M12 4.5v2" {...common} />
          <path d="M19.5 12h-2" {...common} />
          <path d="M12 17.5v2" {...common} />
          <path d="M6.5 12h-2" {...common} />
        </>
      );
  }
}

function CategoryIcon({ category }: { category: CategoryRecord }) {
  const variant = getCategoryIconVariant(category);
  const tone = getCategoryIconTone(category);

  return (
    <span className="settings-category-table__icon" aria-hidden="true" style={tone}>
      <svg viewBox="0 0 24 24" className="settings-category-table__icon-mark">
        <CategoryIconPath variant={variant} />
      </svg>
    </span>
  );
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

      <section className="settings-category-section" aria-label="Built-in categories">
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

      <section className="settings-category-section" aria-label="Custom categories">
        <div className="settings-category-section__head">
          <h5>Custom categories</h5>
        </div>

        <article className="settings-action-card settings-category-creator">
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

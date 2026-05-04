"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatCurrencySymbol } from "@/lib/currency-format";
import { SplitBillManualModal } from "@/components/split-bill-manual-modal";
import { SplitBillImportModal } from "@/components/split-bill-import-modal";
import { normalizeCurrencyCode } from "@/lib/split-bill";

type SplitBillPageActionsProps = {
  currencies: string[];
  selectedCurrency: string;
  initialAddMode?: "manual" | "import" | null;
  initialGroupMode?: "new" | null;
};

const buildSplitBillHref = (params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();
  return query ? `/split-bill?${query}` : "/split-bill";
};

export function SplitBillPageActions({ currencies, selectedCurrency, initialAddMode, initialGroupMode }: SplitBillPageActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCurrencyMenuOpen, setIsCurrencyMenuOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [openAddMode, setOpenAddMode] = useState<"manual" | "import" | null>(initialAddMode ?? null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(initialGroupMode === "new");
  const shouldSyncAddModeToUrl = useRef(Boolean(initialAddMode));
  const shouldSyncGroupModeToUrl = useRef(Boolean(initialGroupMode));

  useEffect(() => {
    setOpenAddMode(initialAddMode ?? null);
  }, [initialAddMode]);

  useEffect(() => {
    setIsGroupModalOpen(initialGroupMode === "new");
  }, [initialGroupMode]);

  const closeHref = useMemo(() => {
    const base = new URLSearchParams();
    const normalizedCurrency = normalizeCurrencyCode(selectedCurrency);
    if (normalizedCurrency && normalizedCurrency !== "ALL") {
      base.set("currency", normalizedCurrency);
    }
    const query = base.toString();
    return query ? `/split-bill?${query}` : "/split-bill";
  }, [selectedCurrency]);

  const openManual = () => {
    setIsAddMenuOpen(false);
    setIsCurrencyMenuOpen(false);
    shouldSyncAddModeToUrl.current = false;
    setOpenAddMode("manual");
  };

  const openImport = () => {
    setIsAddMenuOpen(false);
    setIsCurrencyMenuOpen(false);
    shouldSyncAddModeToUrl.current = false;
    setOpenAddMode("import");
  };

  const closeAddModal = () => {
    setOpenAddMode(null);
    if (shouldSyncAddModeToUrl.current && pathname?.startsWith("/split-bill")) {
      router.replace(closeHref);
    }
  };

  const closeGroupModal = () => {
    setIsGroupModalOpen(false);
    if (shouldSyncGroupModeToUrl.current && pathname?.startsWith("/split-bill")) {
      router.replace(closeHref);
    }
  };

  return (
    <>
      <div className="split-bill-page-actions">
        <div className="split-bill-currency-menu">
          <button className="button button-secondary button-small" type="button" onClick={() => setIsCurrencyMenuOpen((current) => !current)}>
            {selectedCurrency === "ALL" ? "All currencies" : formatCurrencySymbol(selectedCurrency)}
          </button>
          {isCurrencyMenuOpen ? (
            <div className="split-bill-add-menu__panel">
              {["ALL", ...currencies].map((currency) => (
                <Link
                  key={currency}
                  className="split-bill-add-menu__item"
                  href={buildSplitBillHref({ currency, add: null, group: null })}
                  prefetch={false}
                  onClick={() => setIsCurrencyMenuOpen(false)}
                >
                  {currency === "ALL" ? "All currencies" : formatCurrencySymbol(currency)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <div className="split-bill-add-menu">
          <button className="button button-primary button-small" type="button" onClick={() => setIsAddMenuOpen((current) => !current)}>
            Add Bill
          </button>
          {isAddMenuOpen ? (
            <div className="split-bill-add-menu__panel">
              <button className="split-bill-add-menu__item" type="button" onClick={openManual}>
                Add manually
              </button>
              <button className="split-bill-add-menu__item" type="button" onClick={openImport}>
                Import files
              </button>
            </div>
          ) : null}
        </div>

        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => {
            shouldSyncGroupModeToUrl.current = false;
            setIsGroupModalOpen(true);
          }}
        >
          Add Group
        </button>
      </div>

      <SplitBillManualModal open={openAddMode === "manual"} onClose={closeAddModal} />
      <SplitBillImportModal open={openAddMode === "import"} onClose={closeAddModal} />

      {isGroupModalOpen ? <GroupModal onClose={closeGroupModal} /> : null}
    </>
  );
}

function GroupModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [memberText, setMemberText] = useState("");
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const readJsonResponse = async <T,>(response: Response): Promise<T> => {
    const payload = (await response.json()) as T & { error?: string };
    if (!response.ok) {
      throw new Error(payload?.error ?? "Request failed");
    }
    return payload;
  };

  const saveGroup = async () => {
    setIsSavingGroup(true);
    setGroupError(null);

    try {
      const members = memberText
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((name, index) => ({ name, sortOrder: index }));

      const response = await fetch("/api/split-bill-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          members,
        }),
      });

      await readJsonResponse<{ group: { id: string } }>(response);
      onClose();
      router.refresh();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "Unable to save group");
    } finally {
      setIsSavingGroup(false);
    }
  };

  return (
    <div className="split-bill-modal" role="presentation" onClick={onClose}>
      <section className="split-bill-modal__card glass split-bill-group-modal" role="dialog" aria-modal="true" aria-label="Add group" onClick={(event) => event.stopPropagation()}>
        <div className="split-bill-manual-modal__head">
          <div>
            <p className="eyebrow">Add group</p>
            <h3>Save a new group</h3>
          </div>
          <button className="split-bill-icon-button" type="button" onClick={onClose} aria-label="Close group window">
            ×
          </button>
        </div>

        <label className="settings-field">
          <span>Group name</span>
          <input className="settings-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Weekend trip crew" />
        </label>

        <label className="settings-field">
          <span>People</span>
          <textarea
            className="settings-input split-bill-group-form__textarea"
            value={memberText}
            onChange={(event) => setMemberText(event.target.value)}
            placeholder="One name per line or comma-separated"
          />
        </label>

        {groupError ? <p className="split-bill-group-form__error">{groupError}</p> : null}

        <div className="split-bill-manual-modal__actions">
          <button className="button button-primary" type="button" onClick={() => void saveGroup()} disabled={isSavingGroup || !groupName.trim()}>
            {isSavingGroup ? "Saving..." : "Create group"}
          </button>
        </div>
      </section>
    </div>
  );
}

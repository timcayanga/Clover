"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatCurrencySymbol } from "@/lib/currency-format";
import { SplitBillImportModal } from "@/components/split-bill-import-modal";
import { SplitBillManualModal } from "@/components/split-bill-manual-modal";

type SplitBillPageActionsProps = {
  currencies: string[];
  selectedCurrency: string;
};

export function SplitBillPageActions({ currencies, selectedCurrency }: SplitBillPageActionsProps) {
  const [isCurrencyMenuOpen, setIsCurrencyMenuOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [openAddMode, setOpenAddMode] = useState<"manual" | "import" | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPeople, setGroupPeople] = useState<string[]>([]);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const isModalOpen = Boolean(openAddMode || isGroupModalOpen);

  const closeAddModal = () => {
    setOpenAddMode(null);
    setIsAddMenuOpen(false);
  };

  const closeGroupModal = () => {
    setIsGroupModalOpen(false);
    setIsAddMenuOpen(false);
    setIsCurrencyMenuOpen(false);
    setGroupName("");
    setGroupPeople([]);
    setGroupError(null);
  };

  useEffect(() => {
    if (openAddMode || isGroupModalOpen) {
      setIsAddMenuOpen(false);
      setIsCurrencyMenuOpen(false);
    }
  }, [isGroupModalOpen, openAddMode]);

  useEffect(() => {
    document.body.dataset.splitBillModalOpen = isModalOpen ? "true" : "false";
    return () => {
      if (document.body.dataset.splitBillModalOpen === "true") {
        document.body.dataset.splitBillModalOpen = "false";
      }
    };
  }, [isModalOpen]);

  const saveGroup = async () => {
    setIsSavingGroup(true);
    setGroupError(null);

    try {
      const members = groupPeople.map((name, index) => ({ name, sortOrder: index }));

      const response = await fetch("/api/split-bill-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          members,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to save group");
      }

      setGroupName("");
      setGroupPeople([]);
      closeGroupModal();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "Unable to save group");
    } finally {
      setIsSavingGroup(false);
    }
  };

  return (
    <>
      {!isModalOpen ? (
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
                    href={currency === "ALL" ? "/split-bill" : `/split-bill?currency=${encodeURIComponent(currency)}`}
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
                <button
                  className="split-bill-add-menu__item"
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    setOpenAddMode("manual");
                  }}
                >
                  Add Expense
                </button>
                <button
                  className="split-bill-add-menu__item"
                  type="button"
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    setOpenAddMode("import");
                  }}
                >
                  Upload Receipts
                </button>
              </div>
            ) : null}
          </div>

          <button className="button button-secondary button-small" type="button" onClick={() => setIsGroupModalOpen(true)}>
            Add Group
          </button>
        </div>
      ) : null}

      <SplitBillManualModal open={openAddMode === "manual"} onClose={closeAddModal} />
      <SplitBillImportModal open={openAddMode === "import"} onClose={closeAddModal} />

      {isGroupModalOpen ? (
        <div className="split-bill-modal" role="presentation" onClick={closeGroupModal}>
          <section className="split-bill-modal__card glass split-bill-group-modal" role="dialog" aria-modal="true" aria-label="Add group" onClick={(event) => event.stopPropagation()}>
            <div className="split-bill-manual-modal__head">
              <div>
                <p className="eyebrow">Add group</p>
              </div>
              <button className="split-bill-icon-button" type="button" onClick={closeGroupModal} aria-label="Close group window">
                ×
              </button>
            </div>

            <label className="settings-field">
              <span>Group name</span>
              <input className="settings-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Weekend trip crew" />
            </label>

            <label className="settings-field">
              <span>People</span>
              <SplitBillPeoplePicker people={groupPeople} onPeopleChange={setGroupPeople} />
            </label>

            {groupError ? <p className="split-bill-group-form__error">{groupError}</p> : null}

            <div className="split-bill-manual-modal__actions">
              <button className="button button-primary" type="button" onClick={() => void saveGroup()} disabled={isSavingGroup || !groupName.trim()}>
                {isSavingGroup ? "Saving..." : "Create group"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function SplitBillPeoplePicker({
  people,
  onPeopleChange,
}: {
  people: string[];
  onPeopleChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    }
  }, [isAdding]);

  return (
    <div className="split-bill-people-picker">
      <div className="split-bill-people-picker__chips">
        {people.map((person) => (
          <span key={person} className="split-bill-table__chip">
            {person}
          </span>
        ))}
      </div>
      <div className="split-bill-manual-modal__people-row">
        <button className="button button-secondary" type="button" onClick={() => setIsAdding(true)}>
          +
        </button>
        {isAdding ? (
          <>
            <input
              ref={inputRef}
              className="settings-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type a name"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const next = draft.trim();
                  if (!next) {
                    return;
                  }
                  onPeopleChange(Array.from(new Set([...people, next])));
                  setDraft("");
                }
              }}
            />
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                const next = draft.trim();
                if (!next) {
                  return;
                }
                onPeopleChange(Array.from(new Set([...people, next])));
                setDraft("");
              }}
            >
              Add
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

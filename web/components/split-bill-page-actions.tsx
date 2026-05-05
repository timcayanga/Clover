"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SplitBillImportModal } from "@/components/split-bill-import-modal";
import { SplitBillManualModal } from "@/components/split-bill-manual-modal";
import { SplitBillPersonModal } from "@/components/split-bill-person-modal";

export function SplitBillPageActions() {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [openAddMode, setOpenAddMode] = useState<"manual" | "import" | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPeople, setGroupPeople] = useState<string[]>([]);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const isModalOpen = Boolean(openAddMode || isGroupModalOpen || isPersonModalOpen);
  const router = useRouter();

  const closeAddModal = () => {
    setOpenAddMode(null);
    setIsAddMenuOpen(false);
  };

  const closeGroupModal = () => {
    setIsGroupModalOpen(false);
    setIsAddMenuOpen(false);
    setGroupName("");
    setGroupPeople([]);
    setGroupError(null);
  };

  const closePersonModal = () => {
    setIsPersonModalOpen(false);
    setIsAddMenuOpen(false);
  };

  useLayoutEffect(() => {
    if (openAddMode || isGroupModalOpen || isPersonModalOpen) {
      setIsAddMenuOpen(false);
    }
    document.body.dataset.splitBillModalOpen = isModalOpen ? "true" : "false";
    return () => {
      if (document.body.dataset.splitBillModalOpen === "true") {
        document.body.dataset.splitBillModalOpen = "false";
      }
    };
  }, [isGroupModalOpen, isModalOpen, openAddMode]);

  useEffect(() => {
    const handleOpenAdd = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as { mode?: "manual" | "import" } | undefined) : undefined;
      setOpenAddMode(detail?.mode === "import" ? "import" : "manual");
    };

    const handleOpenGroup = () => {
      setIsGroupModalOpen(true);
    };

    const handleOpenPeople = () => {
      setIsPersonModalOpen(true);
    };

    window.addEventListener("clover:open-split-bill-add", handleOpenAdd);
    window.addEventListener("clover:open-split-bill-group", handleOpenGroup);
    window.addEventListener("clover:open-split-bill-people", handleOpenPeople);
    return () => {
      window.removeEventListener("clover:open-split-bill-add", handleOpenAdd);
      window.removeEventListener("clover:open-split-bill-group", handleOpenGroup);
      window.removeEventListener("clover:open-split-bill-people", handleOpenPeople);
    };
  }, []);

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

        </div>
      ) : null}

      <SplitBillManualModal open={openAddMode === "manual"} onClose={closeAddModal} />
      <SplitBillImportModal open={openAddMode === "import"} onClose={closeAddModal} />
      <SplitBillPersonModal
        open={isPersonModalOpen}
        onClose={closePersonModal}
        onSaved={() => router.refresh()}
      />

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

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SplitBillImportModal } from "@/components/split-bill-import-modal";
import { SplitBillManualModal } from "@/components/split-bill-manual-modal";
import { SplitBillPersonModal } from "@/components/split-bill-person-modal";
import type { SplitBillSerializedBill } from "@/lib/split-bill";

type SplitBillPersonSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type SplitBillGroupSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  members: Array<{ id: string; name: string; sortOrder: number }>;
};

type SplitBillPageActionsProps = {
  people: SplitBillPersonSummary[];
  groups: SplitBillGroupSummary[];
  onBillSaved?: (bill: SplitBillSerializedBill) => void;
  onGroupSaved?: (group: SplitBillGroupSummary) => void;
  onPersonSaved?: (person: SplitBillPersonSummary) => void;
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });

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

  useLayoutEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    }
  }, [isAdding]);

  const addPerson = () => {
    const next = draft.trim();
    if (!next) {
      return;
    }

    onPeopleChange(Array.from(new Set([...people, next])));
    setDraft("");
    setIsAdding(true);
  };

  const removePerson = (name: string) => {
    onPeopleChange(people.filter((person) => person !== name));
  };

  return (
    <div className="split-bill-people-picker">
      <div className="split-bill-people-picker__chips">
        {people.map((person) => (
          <span key={person} className="split-bill-table__chip split-bill-table__chip--editable">
            <span>{person}</span>
            <button className="split-bill-table__chip-remove" type="button" aria-label={`Remove ${person}`} onClick={() => removePerson(person)}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="split-bill-manual-modal__people-row">
        <button className="button button-secondary" type="button" onClick={() => setIsAdding(true)}>
          +
        </button>
        {isAdding ? (
          <input
            ref={inputRef}
            className="settings-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Type a name"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addPerson();
              }
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function SplitBillPageActions({ people, groups, onBillSaved, onGroupSaved, onPersonSaved }: SplitBillPageActionsProps) {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [openAddMode, setOpenAddMode] = useState<"manual" | "import" | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPeople, setGroupPeople] = useState<string[]>([]);
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [isUploadingGroupAvatar, setIsUploadingGroupAvatar] = useState(false);
  const [personAvatarUrl, setPersonAvatarUrl] = useState<string | null>(null);
  const isModalOpen = Boolean(openAddMode || isGroupModalOpen || isPersonModalOpen);

  const closeAddModal = () => {
    setOpenAddMode(null);
    setIsAddMenuOpen(false);
  };

  const closeGroupModal = () => {
    setIsGroupModalOpen(false);
    setIsAddMenuOpen(false);
    setGroupName("");
    setGroupPeople([]);
    setGroupAvatarUrl(null);
    setGroupError(null);
    setIsUploadingGroupAvatar(false);
  };

  const closePersonModal = () => {
    setIsPersonModalOpen(false);
    setIsAddMenuOpen(false);
    setPersonAvatarUrl(null);
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
  }, [isGroupModalOpen, isModalOpen, openAddMode, isPersonModalOpen]);

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
          avatarUrl: groupAvatarUrl,
          members,
        }),
      });

      const payload = (await response.json()) as { group?: SplitBillGroupSummary; error?: string };
      if (!response.ok || !payload.group) {
        throw new Error(payload?.error ?? "Unable to save group");
      }

      onGroupSaved?.(payload.group);
      closeGroupModal();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "Unable to save group");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleGroupAvatarUpload = async (file: File | null) => {
    if (!file) {
      return;
    }

    setIsUploadingGroupAvatar(true);
    try {
      setGroupAvatarUrl(await readFileAsDataUrl(file));
    } finally {
      setIsUploadingGroupAvatar(false);
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

      <SplitBillManualModal open={openAddMode === "manual"} people={people} groups={groups} onClose={closeAddModal} onSaved={onBillSaved} />
      <SplitBillImportModal open={openAddMode === "import"} onClose={closeAddModal} />
      <SplitBillPersonModal
        open={isPersonModalOpen}
        onClose={closePersonModal}
        avatarUrl={personAvatarUrl}
        onAvatarUrlChange={setPersonAvatarUrl}
        onSaved={onPersonSaved}
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
              <input className="settings-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Weekend trip crew" autoFocus />
            </label>

            <label className="settings-field">
              <span>Photo</span>
              <div className="split-bill-person-modal__photo-row">
                <button className="button button-secondary button-small" type="button" onClick={() => document.getElementById("split-bill-group-avatar-input")?.click()} disabled={isUploadingGroupAvatar}>
                  {groupAvatarUrl ? "Change photo" : "Add photo"}
                </button>
                {groupAvatarUrl ? (
                  <button className="button button-secondary button-small" type="button" onClick={() => setGroupAvatarUrl(null)}>
                    Remove photo
                  </button>
                ) : null}
                <input
                  id="split-bill-group-avatar-input"
                  type="file"
                  accept="image/*"
                  className="split-bill-manual-modal__file-input"
                  onChange={(event) => {
                    void handleGroupAvatarUpload(event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
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

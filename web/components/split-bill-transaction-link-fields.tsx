"use client";

import { useEffect, useMemo, useState } from "react";

type SplitBillTransactionLinkDraft = {
  groupId: string;
  participantNames: string[];
};

type SplitBillGroupOption = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string; sortOrder: number }>;
};

type SplitBillPersonOption = { id: string; name: string };

type SplitBillTransactionLinkFieldsProps = {
  workspaceId: string;
  draft: SplitBillTransactionLinkDraft;
  onChange: (draft: SplitBillTransactionLinkDraft) => void;
  open: boolean;
  title: string;
  helperText?: string;
  actionLabel?: string;
  onAction?: () => Promise<void> | void;
  actionDisabled?: boolean;
  actionBusy?: boolean;
};

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ");

export function SplitBillTransactionLinkFields({
  workspaceId,
  draft,
  onChange,
  open,
  title,
  helperText,
  actionLabel,
  onAction,
  actionDisabled = false,
  actionBusy = false,
}: SplitBillTransactionLinkFieldsProps) {
  const [groups, setGroups] = useState<SplitBillGroupOption[]>([]);
  const [people, setPeople] = useState<SplitBillPersonOption[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [participantInput, setParticipantInput] = useState("");
  const [participantBusy, setParticipantBusy] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    const loadGroups = async () => {
      try {
        const [groupsResponse, peopleResponse] = await Promise.all([
          fetch("/api/split-bill-groups"),
          fetch("/api/split-bill-people"),
        ]);
        const payload = (await groupsResponse.json().catch(() => ({}))) as {
          groups?: SplitBillGroupOption[];
          error?: string;
        };
        const peoplePayload = (await peopleResponse.json().catch(() => ({}))) as {
          people?: SplitBillPersonOption[];
          error?: string;
        };

        if (!groupsResponse.ok) {
          throw new Error(payload.error ?? "Unable to load split bill groups.");
        }
        if (!peopleResponse.ok) throw new Error(peoplePayload.error ?? "Unable to load saved people.");

        if (active) {
          setGroups(Array.isArray(payload.groups) ? payload.groups : []);
          setPeople(Array.isArray(peoplePayload.people) ? peoplePayload.people : []);
          setGroupError(null);
        }
      } catch (error) {
        if (active) {
          setGroups([]);
          setGroupError(error instanceof Error ? error.message : "Unable to load split bill groups.");
        }
      }
    };

    void loadGroups();

    return () => {
      active = false;
    };
  }, [open, workspaceId]);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === draft.groupId) ?? null,
    [draft.groupId, groups]
  );

  const suggestedPeople = useMemo(() => {
    const query = participantInput.trim().toLowerCase();
    if (!query) return [];
    const selected = new Set(draft.participantNames.map((name) => name.trim().toLowerCase()));
    return people.filter((person) => !selected.has(person.name.trim().toLowerCase()) && person.name.toLowerCase().includes(query)).slice(0, 6);
  }, [draft.participantNames, participantInput, people]);

  if (!open) {
    return null;
  }

  const selectParticipant = (name: string) => {
    const normalized = normalizeName(name);
    if (!normalized) {
      return;
    }

    const currentNames = new Set(draft.participantNames.map((name) => name.trim().toLowerCase()));
    if (!currentNames.has(normalized.toLowerCase())) {
      onChange({
        ...draft,
        participantNames: [...draft.participantNames, normalized],
      });
    }
    setParticipantInput("");
  };

  const addParticipant = async () => {
    const normalized = normalizeName(participantInput);
    if (!normalized || participantBusy) return;
    setParticipantBusy(true);
    setGroupError(null);
    try {
      const response = await fetch("/api/split-bill-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalized }),
      });
      const payload = (await response.json().catch(() => ({}))) as { person?: SplitBillPersonOption; error?: string };
      if (!response.ok || !payload.person) throw new Error(payload.error ?? "Unable to save this person.");
      const savedPerson = payload.person;
      setPeople((current) => [savedPerson, ...current.filter((person) => person.id !== savedPerson.id)]);
      selectParticipant(savedPerson.name);
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "Unable to save this person.");
    } finally {
      setParticipantBusy(false);
    }
  };

  const createGroup = async () => {
    const name = normalizeName(newGroupName);
    if (!name || groupBusy) return;
    setGroupBusy(true);
    setGroupError(null);
    try {
      const response = await fetch("/api/split-bill-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, members: draft.participantNames.map((memberName, index) => ({ name: memberName, sortOrder: index })) }),
      });
      const payload = (await response.json().catch(() => ({}))) as { group?: SplitBillGroupOption; people?: SplitBillPersonOption[]; error?: string };
      if (!response.ok || !payload.group) throw new Error(payload.error ?? "Unable to create this group.");
      const savedGroup = payload.group;
      setGroups((current) => [savedGroup, ...current.filter((group) => group.id !== savedGroup.id)]);
      setPeople((current) => [...(payload.people ?? []), ...current.filter((person) => !(payload.people ?? []).some((saved) => saved.id === person.id))]);
      onChange({ ...draft, groupId: savedGroup.id });
      setNewGroupName("");
      setCreatingGroup(false);
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "Unable to create this group.");
    } finally {
      setGroupBusy(false);
    }
  };

  return (
    <div className="transactions-split-bill-link-panel">
      <div className="transactions-split-bill-link-panel__head">
        <div>
          <strong>{title}</strong>
          {helperText ? <p className="field-help field-help--compact">{helperText}</p> : null}
        </div>
      </div>

      <label className="transactions-manual-field transactions-manual-field--embedded-label">
        <span className="transactions-manual-field__label">Group</span>
        <select
          value={draft.groupId}
          onChange={(event) =>
            onChange({
              ...draft,
              groupId: event.target.value,
            })
          }
        >
          <option value="">No group</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.members.length})
            </option>
          ))}
        </select>
      </label>
      {creatingGroup ? (
        <div className="transactions-split-bill-link-panel__create-group">
          <input aria-label="New group name" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Group name" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void createGroup(); } }} />
          <button type="button" className="button button-primary button-small" onClick={() => void createGroup()} disabled={!newGroupName.trim() || groupBusy}>{groupBusy ? "Creating..." : "Create"}</button>
          <button type="button" className="button button-secondary button-small" onClick={() => { setCreatingGroup(false); setNewGroupName(""); }}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="button button-secondary button-small transactions-split-bill-link-panel__new-group" onClick={() => setCreatingGroup(true)}>Create new group</button>
      )}

      <div className="transactions-split-bill-link-panel__participants">
        <div className="transactions-split-bill-link-panel__participants-head">
          <span className="transactions-manual-field__label">People</span>
          <span className="field-help">Add names or use a saved group.</span>
        </div>

        {selectedGroup ? (
          <div className="transactions-split-bill-link-panel__group-chip">
            <span>{selectedGroup.name}</span>
            <span className="field-help">{selectedGroup.members.length} people</span>
          </div>
        ) : null}

        {draft.participantNames.length > 0 ? (
          <div className="transactions-split-bill-link-panel__chips">
            {draft.participantNames.map((name) => (
              <span key={name} className="transactions-split-bill-link-panel__chip">
                {name}
                <button
                  type="button"
                  className="transactions-split-bill-link-panel__chip-remove"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    onChange({
                      ...draft,
                      participantNames: draft.participantNames.filter((entry) => entry !== name),
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="transactions-split-bill-link-panel__adder">
          <input
            value={participantInput}
            onChange={(event) => setParticipantInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void addParticipant();
              }
            }}
            placeholder="Add a name"
          />
          <button type="button" className="button button-secondary button-small" onClick={() => void addParticipant()} disabled={!participantInput.trim() || participantBusy}>
            {participantBusy ? "Saving..." : "Add"}
          </button>
        </div>
        {suggestedPeople.length > 0 ? (
          <div className="transactions-split-bill-link-panel__suggestions" role="listbox" aria-label="Saved people suggestions">
            {suggestedPeople.map((person) => (
              <button key={person.id} type="button" role="option" onClick={() => selectParticipant(person.name)}>
                <span className="transactions-split-bill-link-panel__suggestion-initial" aria-hidden="true">{person.name.slice(0, 1).toUpperCase()}</span>
                <span>{person.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {groupError ? <p className="field-help field-help--compact">{groupError}</p> : null}

      {actionLabel && onAction ? (
        <div className="transactions-split-bill-link-panel__actions">
          <button className="button button-primary button-small" type="button" onClick={() => void onAction()} disabled={actionDisabled || actionBusy}>
            {actionBusy ? "Saving..." : actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

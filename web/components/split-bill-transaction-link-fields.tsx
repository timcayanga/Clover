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
  const [groupError, setGroupError] = useState<string | null>(null);
  const [participantInput, setParticipantInput] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    const loadGroups = async () => {
      try {
        const response = await fetch("/api/split-bill-groups");
        const payload = (await response.json().catch(() => ({}))) as {
          groups?: SplitBillGroupOption[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load split bill groups.");
        }

        if (active) {
          setGroups(Array.isArray(payload.groups) ? payload.groups : []);
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

  if (!open) {
    return null;
  }

  const addParticipant = () => {
    const normalized = normalizeName(participantInput);
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
                addParticipant();
              }
            }}
            placeholder="Add a name"
          />
          <button type="button" className="button button-secondary button-small" onClick={addParticipant}>
            Add
          </button>
        </div>
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

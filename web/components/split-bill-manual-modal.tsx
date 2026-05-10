"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CurrencySelector } from "@/components/currency-selector";
import { SplitBillEntityAvatar } from "@/components/split-bill-entity-avatar";
import { getCurrencyCatalogCodes } from "@/lib/currencies";
import type { SplitBillSerializedBill } from "@/lib/split-bill";
import type { SplitBillGroupSummary, SplitBillPersonSummary } from "@/lib/split-bill-entities";

type SplitBillManualModalProps = {
  open: boolean;
  currentUserName: string;
  people: SplitBillPersonSummary[];
  groups: SplitBillGroupSummary[];
  onClose: () => void;
  onSaved?: (bill: SplitBillSerializedBill) => void;
};

type SplitMode = "you-paid" | "you-owed" | "person-paid" | "person-owed";

const currencyOptions = getCurrencyCatalogCodes();

const splitModeOptions = (currentUserName: string): Array<{ value: SplitMode; label: string }> => [
  { value: "you-paid", label: `${currentUserName} paid, split equally` },
  { value: "you-owed", label: `${currentUserName} is owed the full amount` },
  { value: "person-paid", label: "Person paid, split equally" },
  { value: "person-owed", label: "Person is owed the full amount" },
];

const createId = () => globalThis.crypto?.randomUUID?.() ?? `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload;
}

export function SplitBillManualModal({ open, currentUserName, people, groups, onClose, onSaved }: SplitBillManualModalProps) {
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [splitMode, setSplitMode] = useState<SplitMode>("you-paid");
  const [selectedPayer, setSelectedPayer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedPeople([]);
    setSelectedGroupId(null);
    setQuery("");
    setDescription("");
    setAmount("");
    setCurrency("PHP");
    setSplitMode("you-paid");
    setSelectedPayer("");
    setError(null);
    setIsSaving(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    document.body.dataset.splitBillModalOpen = "true";

    return () => {
      if (document.body.dataset.splitBillModalOpen === "true") {
        document.body.dataset.splitBillModalOpen = "false";
      }
    };
  }, [open]);

  useEffect(() => {
    if (!selectedPayer && selectedPeople.length > 0 && splitMode.startsWith("person")) {
      setSelectedPayer(selectedPeople[0]);
    }
    if (selectedPayer && !selectedPeople.includes(selectedPayer) && splitMode.startsWith("person")) {
      setSelectedPayer(selectedPeople[0] ?? "");
    }
  }, [selectedPeople, selectedPayer, splitMode]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [open]);

  const splitOptions = useMemo(() => splitModeOptions(currentUserName), [currentUserName]);

  const selectedGroup = useMemo(() => groups.find((group) => group.id === selectedGroupId) ?? null, [groups, selectedGroupId]);

  const suggestions = useMemo(() => {
    const search = query.trim().toLowerCase();
    const matchedPeople = people.filter((person) => {
      if (!search) return true;
      return person.name.toLowerCase().includes(search);
    });
    const matchedGroups = groups.filter((group) => {
      if (!search) return true;
      return group.name.toLowerCase().includes(search) || group.members.some((member) => member.name.toLowerCase().includes(search));
    });

    return {
      people: matchedPeople.slice(0, 6),
      groups: matchedGroups.slice(0, 4),
    };
  }, [groups, people, query]);

  const payerOptions = useMemo(() => {
    return selectedPeople.map((person) => ({ label: person, value: person }));
  }, [selectedPeople]);

  const addPeopleFromGroup = (group: SplitBillGroupSummary) => {
    setSelectedGroupId(group.id);
    setSelectedPeople((current) => Array.from(new Set([...current, ...group.members.map((member) => member.name)])));
    setQuery("");
  };

  const addPerson = (name: string) => {
    const next = name.trim();
    if (!next) {
      return;
    }

    setSelectedPeople((current) => Array.from(new Set([...current, next])));
    setQuery("");
  };

  const removePerson = (name: string) => {
    setSelectedPeople((current) => current.filter((entry) => entry !== name));
    if (selectedPayer === name) {
      setSelectedPayer("");
    }
  };

  const removeGroup = () => {
    setSelectedGroupId(null);
  };

  const closeModal = () => onClose();

  const saveBill = async () => {
    const trimmedDescription = description.trim();
    const trimmedAmount = amount.trim();

    if (!trimmedDescription) {
      setError("Add a description.");
      return;
    }

    if (!trimmedAmount || Number.isNaN(Number(trimmedAmount))) {
      setError("Add a valid amount.");
      return;
    }

    if (selectedPeople.length === 0) {
      setError("Add at least one person.");
      return;
    }

    if (splitMode.startsWith("person") && !selectedPayer) {
      setError("Choose who paid or is owed.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const payerName = splitMode.startsWith("you") ? currentUserName : selectedPayer;
      const participantEntries = Array.from(new Set([...selectedPeople, payerName].filter(Boolean)))
        .filter(Boolean)
        .map((name) => ({
          id: createId(),
          name,
        }));
      const payerParticipant = participantEntries.find((participant) => participant.name === payerName) ?? null;
      const peopleParticipantIds = participantEntries.filter((participant) => participant.name !== payerName).map((participant) => participant.id);

      if (splitMode.startsWith("person") && !payerParticipant) {
        throw new Error("Choose who paid or is owed.");
      }

      const payload = {
        title: trimmedDescription,
        billDate: new Date().toISOString(),
        currency,
        sourceType: "manual" as const,
        groupId: selectedGroupId,
        participants: participantEntries,
        items: [
          {
            id: createId(),
            description: trimmedDescription,
            amount: trimmedAmount,
            participantIds: peopleParticipantIds,
          },
        ],
        payments:
          splitMode === "you-paid" || splitMode === "person-paid"
            ? [
                {
                  id: createId(),
                  participantId: payerParticipant?.id ?? "",
                  amount: trimmedAmount,
                  note: null,
                },
              ]
            : [],
        total: trimmedAmount,
        rawPayload: {
          splitMode,
          quickAdd: true,
        },
      };

      const response = await fetch("/api/split-bills", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse<{ bill: SplitBillSerializedBill }>(response);
      onSaved?.(result.bill);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save bill");
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="split-bill-modal" role="presentation" onClick={closeModal}>
      <section className="split-bill-modal__card glass split-bill-manual-modal" role="dialog" aria-modal="true" aria-label="Add manual split bill" onClick={(event) => event.stopPropagation()}>
        <div className="split-bill-manual-modal__head">
          <div>
            <p className="eyebrow">Add Expense</p>
            <h3>Split Bill</h3>
          </div>
          <button className="split-bill-icon-button" type="button" onClick={closeModal} aria-label="Close manual bill window">
            ×
          </button>
        </div>

        <label className="settings-field">
          <span>Add people or group</span>
          <input
            ref={inputRef}
            className="settings-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search saved people or groups"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const firstPerson = suggestions.people[0];
                const firstGroup = suggestions.groups[0];
                if (firstPerson) {
                  addPerson(firstPerson.name);
                } else if (firstGroup) {
                  addPeopleFromGroup(firstGroup);
                }
              }
            }}
          />
        </label>

        {(suggestions.people.length > 0 || suggestions.groups.length > 0) && query.trim() ? (
          <div className="split-bill-manual-modal__suggestions" role="listbox" aria-label="People and groups suggestions">
            {suggestions.people.length > 0 ? (
              <div className="split-bill-manual-modal__suggestion-section">
                <p>People</p>
                {suggestions.people.map((person) => (
                  <button key={person.id} type="button" className="split-bill-manual-modal__suggestion" onClick={() => addPerson(person.name)}>
                    <SplitBillEntityAvatar name={person.name} avatarUrl={null} />
                    <span>{person.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {suggestions.groups.length > 0 ? (
              <div className="split-bill-manual-modal__suggestion-section">
                <p>Groups</p>
                {suggestions.groups.map((group) => (
                  <button key={group.id} type="button" className="split-bill-manual-modal__suggestion" onClick={() => addPeopleFromGroup(group)}>
                    <SplitBillEntityAvatar name={group.name} avatarUrl={group.avatarUrl} />
                    <span>{group.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="split-bill-manual-modal__chips">
          {selectedGroup ? (
            <span className="split-bill-manual-modal__chip">
              <span>{selectedGroup.name}</span>
              <button type="button" className="split-bill-table__chip-remove" aria-label={`Remove ${selectedGroup.name}`} onClick={removeGroup}>
                ×
              </button>
            </span>
          ) : null}
          {selectedPeople.map((person) => (
            <span key={person} className="split-bill-manual-modal__chip">
              <span>{person}</span>
              <button type="button" className="split-bill-table__chip-remove" aria-label={`Remove ${person}`} onClick={() => removePerson(person)}>
                ×
              </button>
            </span>
          ))}
        </div>

        <label className="settings-field">
          <span>Description</span>
          <input
            className="settings-input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Dinner, drinks, ride, groceries"
          />
        </label>

        <div className="split-bill-manual-modal__amount-row">
          <label className="settings-field">
            <span>Amount</span>
            <div className="split-bill-manual-modal__amount-input">
              <CurrencySelector
                value={currency}
                onChange={setCurrency}
                options={currencyOptions}
                ariaLabel="Select bill currency"
                className="transactions-currency-filter split-bill-manual-modal__currency-selector"
                buttonClassName="transactions-currency-filter__button split-bill-manual-modal__currency-button"
                menuClassName="transactions-currency-filter__menu split-bill-manual-modal__currency-menu"
                optionClassName="transactions-currency-filter__option"
                menuAlignment="start"
                showGroupedSections
              />
              <input
                className="settings-input"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
              />
            </div>
          </label>
        </div>

        <label className="settings-field">
          <span>Split as</span>
          <select className="settings-input" value={splitMode} onChange={(event) => setSplitMode(event.target.value as SplitMode)}>
                {splitOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {splitMode.startsWith("person") ? (
          <label className="settings-field">
            <span>Payer</span>
            <select className="settings-input" value={selectedPayer} onChange={(event) => setSelectedPayer(event.target.value)}>
              <option value="">Choose a person</option>
              {payerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? <p className="split-bill-editor__error">{error}</p> : null}

        <div className="split-bill-manual-modal__actions">
          <button className="button button-primary" type="button" onClick={() => void saveBill()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save bill"}
          </button>
        </div>
      </section>
    </div>
  );
}

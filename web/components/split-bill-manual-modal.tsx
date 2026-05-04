"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SplitBillManualModalProps = {
  open: boolean;
  closeHref?: string;
};

type SplitMode = "you-paid" | "you-owed" | "person-paid" | "person-owed";

const currencyOptions = ["PHP", "USD", "EUR", "JPY"];

const splitModeOptions: Array<{ value: SplitMode; label: string }> = [
  { value: "you-paid", label: "You paid, split equally" },
  { value: "you-owed", label: "You are owed the full amount" },
  { value: "person-paid", label: "Person paid, split equally" },
  { value: "person-owed", label: "Person is owed the full amount" },
];

const parsePeople = (value: string) =>
  value
    .split(/,|\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const createId = () => globalThis.crypto?.randomUUID?.() ?? `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload;
}

export function SplitBillManualModal({ open, closeHref = "/split-bill" }: SplitBillManualModalProps) {
  const router = useRouter();
  const [peopleText, setPeopleText] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [splitMode, setSplitMode] = useState<SplitMode>("you-paid");
  const [selectedPerson, setSelectedPerson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPeopleText("");
    setPeople([]);
    setDescription("");
    setAmount("");
    setCurrency("PHP");
    setSplitMode("you-paid");
    setSelectedPerson("");
    setError(null);
    setIsSaving(false);
  }, [open]);

  useEffect(() => {
    if (!selectedPerson && people.length > 0 && splitMode.startsWith("person")) {
      setSelectedPerson(people[0]);
    }
    if (selectedPerson && !people.includes(selectedPerson) && splitMode.startsWith("person")) {
      setSelectedPerson(people[0] ?? "");
    }
  }, [people, selectedPerson, splitMode]);

  const payerName = useMemo(() => {
    if (splitMode === "you-paid" || splitMode === "you-owed") {
      return "You";
    }
    return selectedPerson.trim();
  }, [selectedPerson, splitMode]);

  const addPeopleFromText = () => {
    const nextPeople = parsePeople(peopleText);
    if (nextPeople.length === 0) {
      return;
    }

    setPeople((current) => Array.from(new Set([...current, ...nextPeople])));
    setPeopleText("");
  };

  const removePerson = (name: string) => {
    setPeople((current) => current.filter((entry) => entry !== name));
    if (selectedPerson === name) {
      setSelectedPerson("");
    }
  };

  const closeModal = () => {
    router.push(closeHref);
    router.refresh();
  };

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

    if (people.length === 0) {
      setError("Add at least one person.");
      return;
    }

    if ((splitMode.startsWith("person") && !payerName) || !payerName) {
      setError("Choose who paid or is owed.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const participantNames = new Set<string>(people);
      if (payerName) {
        participantNames.add(payerName);
      }

      const participantEntries = Array.from(participantNames).map((name) => ({
        id: createId(),
        name,
      }));
      const payerParticipant = participantEntries.find((participant) => participant.name === payerName);
      const peopleParticipantIds = participantEntries
        .filter((participant) => participant.name !== payerName)
        .map((participant) => participant.id);

      if (!payerParticipant) {
        throw new Error("Choose who paid or is owed.");
      }

      if (peopleParticipantIds.length === 0) {
        throw new Error("Add at least one person besides the payer.");
      }

      const payload = {
        title: trimmedDescription,
        billDate: new Date().toISOString(),
        currency,
        sourceType: "manual" as const,
        participants: participantEntries,
        items: [
          {
            id: createId(),
            description: trimmedDescription,
            amount: trimmedAmount,
            participantIds: peopleParticipantIds,
          },
        ],
        payments: [
          {
            id: createId(),
            participantId: payerParticipant.id,
            amount: trimmedAmount,
            note: null,
          },
        ],
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
      const result = await readJsonResponse<{ bill: { id: string } }>(response);
      router.push(`/split-bill/${result.bill.id}`);
      router.refresh();
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
    <div className="split-bill-modal" role="dialog" aria-modal="true" aria-label="Add manual split bill">
      <section className="split-bill-modal__card glass split-bill-manual-modal">
        <div className="split-bill-manual-modal__head">
          <div>
            <p className="eyebrow">Add manually</p>
            <h3>Split Bill</h3>
          </div>
          <button className="split-bill-icon-button" type="button" onClick={closeModal} aria-label="Close manual bill window">
            ×
          </button>
        </div>

        <div className="split-bill-manual-modal__people">
          <label className="settings-field">
            <span>People</span>
            <div className="split-bill-manual-modal__people-row">
              <button className="button button-secondary" type="button" onClick={addPeopleFromText}>
                +
              </button>
              <input
                className="settings-input"
                value={peopleText}
                onChange={(event) => setPeopleText(event.target.value)}
                placeholder="Type names, separated by commas"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPeopleFromText();
                  }
                }}
              />
              <div className="split-bill-manual-modal__chips">
                {people.map((person) => (
                  <button key={person} className="split-bill-manual-modal__chip" type="button" onClick={() => removePerson(person)}>
                    {person}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            </div>
          </label>
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
              <select className="split-bill-manual-modal__currency-chip" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                {currencyOptions.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <input
                className="settings-input"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </label>

          <label className="settings-field">
            <span>Split as</span>
            <select className="settings-input" value={splitMode} onChange={(event) => setSplitMode(event.target.value as SplitMode)}>
              {splitModeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {splitMode.startsWith("person") ? (
          <label className="settings-field">
            <span>Person</span>
            <select className="settings-input" value={selectedPerson} onChange={(event) => setSelectedPerson(event.target.value)}>
              <option value="">Choose a person</option>
              {people.map((person) => (
                <option key={person} value={person}>
                  {person}
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

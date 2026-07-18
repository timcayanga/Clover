"use client";

import { useEffect, useMemo, useState } from "react";
import { circleTemplates, type CircleTypeValue } from "@/lib/circles";

type CircleCreateDialogProps = {
  open: boolean;
  initialType?: CircleTypeValue | null;
  onClose: () => void;
  onCreated: (circleId: string) => void;
};

type DraftMember = { displayName: string; email: string };

export function CircleCreateDialog({
  open,
  initialType = null,
  onClose,
  onCreated,
}: CircleCreateDialogProps) {
  const [step, setStep] = useState(0);
  const [type, setType] = useState<CircleTypeValue>("household");
  const selectedTemplate = useMemo(
    () =>
      circleTemplates.find((entry) => entry.type === type) ??
      circleTemplates[0],
    [type],
  );
  const [name, setName] = useState(circleTemplates[0].suggestedName);
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [members, setMembers] = useState<DraftMember[]>([
    { displayName: "", email: "" },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !initialType) return;
    const template =
      circleTemplates.find((entry) => entry.type === initialType) ??
      circleTemplates[0];
    setType(template.type);
    setName(template.suggestedName);
    setStep(1);
    setMessage(null);
  }, [initialType, open]);

  if (!open) return null;

  const selectTemplate = (nextType: CircleTypeValue) => {
    const template =
      circleTemplates.find((entry) => entry.type === nextType) ??
      circleTemplates[0];
    setType(nextType);
    setName((current) =>
      circleTemplates.some((entry) => entry.suggestedName === current)
        ? template.suggestedName
        : current,
    );
  };

  const resetAndClose = () => {
    setStep(0);
    setType("household");
    setName(circleTemplates[0].suggestedName);
    setDescription("");
    setCurrency("PHP");
    setMembers([{ displayName: "", email: "" }]);
    setMessage(null);
    onClose();
  };

  const close = () => {
    if (isSaving) return;
    resetAndClose();
  };

  const createCircle = async () => {
    if (!name.trim()) {
      setMessage("Give your Circle a name before continuing.");
      return;
    }
    const enteredInvitees = members.filter(
      (member) => member.email.trim() || member.displayName.trim(),
    );
    if (enteredInvitees.some((member) => !member.email.trim())) {
      setMessage("Enter an email for each person you want to invite.");
      return;
    }
    if (
      enteredInvitees.some(
        (member) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim()),
      )
    ) {
      setMessage("Check that each invitation email is valid.");
      return;
    }
    setIsSaving(true);
    setMessage("Creating your Circle...");
    try {
      const response = await fetch("/api/circles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type,
          description: description || null,
          currency,
          members: members
            .filter((member) => member.email.trim())
            .map((member) => ({
              displayName:
                member.displayName.trim() || member.email.split("@")[0],
              email: member.email,
              role: "member",
            })),
        }),
      });
      const payload = (await response.json()) as {
        circleId?: string;
        error?: string;
      };
      if (!response.ok || !payload.circleId)
        throw new Error(payload.error || "Unable to create this Circle.");
      setIsSaving(false);
      const circleId = payload.circleId;
      resetAndClose();
      onCreated(circleId);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to create this Circle.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop circles-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        className="modal-card circles-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="circle-create-title"
      >
        <div className="circles-dialog__head">
          <div>
            <p className="eyebrow">Add a Circle · Step {step + 1} of 3</p>
            <h2 id="circle-create-title">
              {step === 0
                ? "What are you managing together?"
                : step === 1
                  ? "Make it yours"
                  : "Who should be included?"}
            </h2>
          </div>
          <button
            className="circles-icon-button"
            type="button"
            aria-label="Close Circle setup"
            onClick={close}
          >
            ×
          </button>
        </div>

        <div className="circles-stepper" aria-label="Circle setup progress">
          {[0, 1, 2].map((index) => (
            <span key={index} className={index <= step ? "is-active" : ""} />
          ))}
        </div>

        {step === 0 ? (
          <div className="circles-template-grid">
            {circleTemplates.map((template) => (
              <button
                key={template.type}
                className={`circles-template-card ${type === template.type ? "is-selected" : ""}`}
                type="button"
                onClick={() => selectTemplate(template.type)}
              >
                <strong>{template.title}</strong>
              </button>
            ))}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="circles-form-stack">
            <label>
              <span>Circle name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoFocus
              />
            </label>
            <label>
              <span>
                What is this Circle for? <small>Optional</small>
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={300}
                placeholder={selectedTemplate.description}
                rows={3}
              />
            </label>
            <label>
              <span>Currency</span>
              <select
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                <option value="PHP">PHP · Philippine peso</option>
                <option value="USD">USD · US dollar</option>
                <option value="EUR">EUR · Euro</option>
                <option value="SGD">SGD · Singapore dollar</option>
                <option value="JPY">JPY · Japanese yen</option>
              </select>
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="circles-form-stack">
            <div className="circles-privacy-note">
              <strong>Your finances stay private.</strong>
              <span>
                Creating a Circle does not share your accounts, balances,
                salary, or transaction history.
              </span>
            </div>
            {members.map((member, index) => (
              <div className="circles-member-draft" key={index}>
                <label>
                  <span>Email</span>
                  <input
                    value={member.email}
                    type="email"
                    onChange={(event) =>
                      setMembers((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, email: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    placeholder="ana@example.com"
                  />
                </label>
                <label>
                  <span>
                    Name <small>Optional</small>
                  </span>
                  <input
                    value={member.displayName}
                    onChange={(event) =>
                      setMembers((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, displayName: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    placeholder="e.g. Ana"
                  />
                </label>
                {members.length > 1 ? (
                  <button
                    className="circles-icon-button"
                    type="button"
                    aria-label={`Remove member ${index + 1}`}
                    onClick={() =>
                      setMembers((current) =>
                        current.filter((_, entryIndex) => entryIndex !== index),
                      )
                    }
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() =>
                setMembers((current) => [
                  ...current,
                  { displayName: "", email: "" },
                ])
              }
            >
              Add another person
            </button>
          </div>
        ) : null}

        {message ? (
          <p className="circles-form-message" role="status">
            {message}
          </p>
        ) : null}
        <div className="modal-actions circles-dialog__actions">
          {step > 0 ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setMessage(null);
                setStep((current) => current - 1);
              }}
              disabled={isSaving}
            >
              Back
            </button>
          ) : (
            <button
              className="button button-secondary"
              type="button"
              onClick={close}
            >
              Cancel
            </button>
          )}
          {step < 2 ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => {
                setMessage(null);
                setStep((current) => current + 1);
              }}
            >
              Continue
            </button>
          ) : (
            <button
              className="button button-primary"
              type="button"
              onClick={() => void createCircle()}
              disabled={isSaving}
            >
              {isSaving ? "Creating..." : "Create Circle"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

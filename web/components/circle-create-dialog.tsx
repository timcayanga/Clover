"use client";

import { useMemo, useState } from "react";
import { circleTemplates, type CircleTypeValue } from "@/lib/circles";

type CircleCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (circleId: string) => void | Promise<void>;
};

type DraftMember = { displayName: string; email: string };

export function CircleCreateDialog({
  open,
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
            .filter((member) => member.displayName.trim())
            .map((member) => ({
              displayName: member.displayName,
              email: member.email || null,
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
      await onCreated(payload.circleId);
      setIsSaving(false);
      resetAndClose();
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
            <p className="eyebrow">Create a Circle · Step {step + 1} of 4</p>
            <h2 id="circle-create-title">
              {step === 0
                ? "What are you managing together?"
                : step === 1
                  ? "Make it yours"
                  : step === 2
                    ? "Your privacy comes first"
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
          {[0, 1, 2, 3].map((index) => (
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
                <span>{template.description}</span>
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
          <div className="circles-privacy-card">
            <img
              src="/assets/3d%20icons/menu/profiles.png"
              alt=""
              width={96}
              height={96}
            />
            <h3>Your personal finances stay personal.</h3>
            <p>
              Creating a Circle does not share your accounts, balances, salary,
              or transaction history.
            </p>
            <ul>
              <li>
                You choose each expense, goal, contribution, or investment
                summary you share.
              </li>
              <li>
                Other members cannot edit your personal or confirmed financial
                records.
              </li>
              <li>
                Clover previews what a Circle will see before personal data is
                shared.
              </li>
            </ul>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="circles-form-stack">
            <p className="panel-muted">
              Add people now, or skip this and invite them later. They will not
              see anything until they join.
            </p>
            {members.map((member, index) => (
              <div className="circles-member-draft" key={index}>
                <label>
                  <span>Name</span>
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
                <label>
                  <span>
                    Email <small>Optional</small>
                  </span>
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

            <div className="circles-starter-preview">
              <strong>Good ways to start</strong>
              {selectedTemplate.starterActions.map((action) => (
                <span key={action}>{action}</span>
              ))}
            </div>
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
          {step < 3 ? (
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

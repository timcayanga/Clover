"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { persistSelectedWorkspaceId } from "@/lib/workspace-selection";
import { clearAllWorkspaceCaches } from "@/lib/workspace-cache";

type AccountActionsPanelProps = {
  isGuest?: boolean;
};

type DestructiveAction = "wipe" | "delete" | null;

const readJsonError = async (response: Response) => {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
};

const destructiveCopy = {
  wipe: {
    title: "Start fresh with your Clover data?",
    body: "If you’re sure you want a clean slate, type WIPE below to remove your imported transactions, accounts, and learned data while keeping your Clover account.",
    token: "WIPE",
    confirmLabel: "Wipe my data",
    confirmTone: "neutral",
    helper: "You’ll land back on the dashboard and can import files again whenever you’re ready.",
  },
  delete: {
    title: "Remove your Clover account?",
    body: "If Clover is no longer the right fit, type DELETE below to permanently remove your Clover account and all app data.",
    token: "DELETE",
    confirmLabel: "Delete my account",
    confirmTone: "danger",
    helper: "This signs you out and returns you to the landing page after the account is removed.",
  },
} as const;

export function AccountActionsPanel({ isGuest = false }: AccountActionsPanelProps) {
  const { signOut } = useClerk();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<DestructiveAction>(null);
  const [confirmationValue, setConfirmationValue] = useState("");
  const confirmationInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!activeAction) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      confirmationInputRef.current?.focus();
      confirmationInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeAction]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeAction) {
        setActiveAction(null);
        setConfirmationValue("");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeAction]);

  const clearWorkspaceSelection = () => {
    persistSelectedWorkspaceId("");
    clearAllWorkspaceCaches();
  };

  const handleSignOut = () => {
    if (isGuest) {
      return;
    }

    clearWorkspaceSelection();

    void signOut({
      redirectUrl: "/",
    }).catch(() => {
      window.location.assign("/");
    });
  };

  const closeDialog = () => {
    setActiveAction(null);
    setConfirmationValue("");
  };

  const handleDestructiveAction = () => {
    if (!activeAction || isGuest) {
      return;
    }

    const copy = destructiveCopy[activeAction];
    if (confirmationValue.trim().toUpperCase() !== copy.token) {
      setMessage(`Please type ${copy.token} to continue.`);
      return;
    }

    startTransition(async () => {
      setMessage(
        activeAction === "wipe"
          ? "Wiping your Clover data..."
          : "Removing your Clover account..."
      );

      const response = await fetch(activeAction === "wipe" ? "/api/account/wipe-data" : "/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        setMessage(await readJsonError(response));
        return;
      }

      clearWorkspaceSelection();
      closeDialog();

      if (activeAction === "wipe") {
        window.location.assign("/dashboard");
        return;
      }

      window.location.assign("/");
    });
  };

  const modalCopy = activeAction ? destructiveCopy[activeAction] : null;
  const isConfirmReady = modalCopy ? confirmationValue.trim().toUpperCase() === modalCopy.token : false;

  return (
    <>
      <section className="panel account-actions-panel">
        <div className="account-actions-panel__head">
          <div>
            <p className="eyebrow">Account actions</p>
            <h4>Manage your access and data</h4>
          </div>
          <p className="panel-muted">
            You can sign out anytime, clear your Clover data while keeping your account, or remove the account entirely.
          </p>
        </div>

        <div className="account-actions-panel__grid">
          {!isGuest ? (
            <button className="button button-secondary button-small" type="button" onClick={handleSignOut} disabled={isPending}>
              Sign out
            </button>
          ) : null}

          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => {
              setMessage(null);
              setActiveAction("wipe");
              setConfirmationValue("");
            }}
            disabled={isPending || isGuest}
          >
            Wipe app data
          </button>

          <button
            className="button button-danger button-small"
            type="button"
            onClick={() => {
              setMessage(null);
              setActiveAction("delete");
              setConfirmationValue("");
            }}
            disabled={isPending || isGuest}
          >
            Delete account
          </button>
        </div>

        <p className="account-actions-panel__note" aria-live="polite">
          {isGuest ? "Guest sessions on staging cannot be changed here." : message ?? "The wipe action keeps your Clover account but removes app data."}
        </p>
      </section>

      {modalCopy ? (
        <div
          className="account-actions-modal"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog();
            }
          }}
        >
          <section
            className="account-actions-modal__card panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-actions-modal-title"
            aria-describedby="account-actions-modal-copy"
          >
            <div className="account-actions-modal__head">
              <div>
                <p className="eyebrow">{activeAction === "wipe" ? "Fresh start" : "Account removal"}</p>
                <h4 id="account-actions-modal-title">{modalCopy.title}</h4>
              </div>
              <button className="button button-secondary button-small" type="button" onClick={closeDialog}>
                Cancel
              </button>
            </div>

            <p className="account-actions-modal__copy" id="account-actions-modal-copy">
              {modalCopy.body}
            </p>

            <label className="account-actions-modal__field">
              <span>Type {modalCopy.token} to continue</span>
              <input
                ref={confirmationInputRef}
                value={confirmationValue}
                onChange={(event) => setConfirmationValue(event.target.value)}
                placeholder={modalCopy.token}
                autoComplete="off"
                spellCheck={false}
              />
            </label>

            <p className="account-actions-modal__helper">{modalCopy.helper}</p>

            <div className="account-actions-modal__actions">
              <button className="button button-secondary button-small" type="button" onClick={closeDialog} disabled={isPending}>
                Back
              </button>
              <button
                className={`button ${modalCopy.confirmTone === "danger" ? "button-danger" : "button-primary"} button-small`}
                type="button"
                onClick={handleDestructiveAction}
                disabled={isPending || !isConfirmReady}
              >
                {isPending ? "Working..." : modalCopy.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

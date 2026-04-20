"use client";

import { useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { persistSelectedWorkspaceId } from "@/lib/workspace-selection";

type AccountActionsPanelProps = {
  isGuest?: boolean;
};

const readJsonError = async (response: Response) => {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
};

export function AccountActionsPanel({ isGuest = false }: AccountActionsPanelProps) {
  const { signOut } = useClerk();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const clearWorkspaceSelection = () => {
    persistSelectedWorkspaceId("");
  };

  const handleSignOut = () => {
    if (isGuest) {
      return;
    }

    clearWorkspaceSelection();

    void signOut({
      redirectUrl: "/sign-in",
    }).catch(() => {
      window.location.assign("/sign-in");
    });
  };

  const handleWipeData = () => {
    if (isGuest) {
      return;
    }

    const confirmed = window.prompt(
      "Type WIPE to remove all Clover data from this account while keeping the account itself."
    );

    if (confirmed?.trim().toUpperCase() !== "WIPE") {
      return;
    }

    startTransition(async () => {
      setMessage("Removing your Clover data...");

      const response = await fetch("/api/account/wipe-data", {
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
      setMessage("Your data has been removed. Sending you back to onboarding...");
      window.location.assign("/onboarding");
    });
  };

  const handleDeleteAccount = () => {
    if (isGuest) {
      return;
    }

    const confirmed = window.prompt(
      "Type DELETE to permanently delete your Clover account and all local Clover data."
    );

    if (confirmed?.trim().toUpperCase() !== "DELETE") {
      return;
    }

    startTransition(async () => {
      setMessage("Deleting your account...");

      const response = await fetch("/api/account/delete", {
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
      setMessage("Your account has been deleted. Signing you out...");
      await signOut({
        redirectUrl: "/sign-in",
      }).catch(() => {
        window.location.assign("/sign-in");
      });
    });
  };

  return (
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

        <button className="button button-secondary button-small" type="button" onClick={handleWipeData} disabled={isPending || isGuest}>
          Wipe app data
        </button>

        <button className="button button-danger button-small" type="button" onClick={handleDeleteAccount} disabled={isPending || isGuest}>
          Delete account
        </button>
      </div>

      <p className="account-actions-panel__note" aria-live="polite">
        {isGuest ? "Guest sessions on staging cannot be changed here." : message ?? "The wipe action keeps your Clover account but removes app data."}
      </p>
    </section>
  );
}

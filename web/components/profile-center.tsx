"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { persistSelectedWorkspaceId } from "@/lib/workspace-selection";
import { clearAllWorkspaceCaches } from "@/lib/workspace-cache";

type ProfileCenterProps = {
  canSignOut?: boolean;
};

export function ProfileCenter({ canSignOut = true }: ProfileCenterProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const currentDisplayName =
    user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "Profile";
  const email = user?.primaryEmailAddress?.emailAddress ?? "tim@example.com";
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const avatar = user?.imageUrl ?? null;

  useEffect(() => {
    setDisplayName(currentDisplayName);
  }, [currentDisplayName]);

  const initial = displayName.trim().slice(0, 1).toUpperCase();

  const handleSave = () => {
    if (!isLoaded || !isSignedIn || !user) {
      setSaveMessage("Sign in again to update your profile.");
      return;
    }

    const nextName = displayName.trim();
    if (!nextName) {
      setSaveMessage("Display name cannot be empty.");
      return;
    }

    startTransition(async () => {
      try {
        await user.update({ firstName: nextName });
        await user.reload();
        setSaveMessage("Display name updated.");
      } catch (error) {
        setSaveMessage(error instanceof Error ? error.message : "Unable to save your display name.");
      }
    });
  };

  const handleSignOut = () => {
    if (!canSignOut || !isSignedIn) {
      return;
    }

    persistSelectedWorkspaceId("");
    clearAllWorkspaceCaches();

    void signOut({
      redirectUrl: "/",
    }).catch(() => {
      window.location.assign("/");
    });
  };

  return (
    <section className="profile-layout">
      <article className="panel profile-hero">
        <div className="profile-hero__identity">
          <span className="profile-hero__avatar" aria-hidden="true">
            {avatar ? <img src={avatar} alt="" /> : <span>{initial}</span>}
          </span>
          <div>
            <p className="eyebrow">Account hub</p>
            <h3>{displayName}</h3>
            <p className="panel-muted">{email}</p>
          </div>
        </div>

        <div className="profile-hero__actions">
          <Link className="button button-primary button-small" href="/settings">
            Open settings
          </Link>
          <Link className="button button-secondary button-small" href="/dashboard">
            Back to dashboard
          </Link>
          {canSignOut && isSignedIn ? (
            <button className="button button-secondary button-small" type="button" onClick={handleSignOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </article>

      <div className="profile-grid">
        <article className="panel">
          <p className="eyebrow">Identity</p>
          <div className="profile-list">
            <label className="profile-edit-field">
              <span>Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Enter your display name"
              />
            </label>
            <div>
              <span>Primary email</span>
              <strong>{email}</strong>
            </div>
            {saveMessage ? <p className="profile-feedback">{saveMessage}</p> : null}
            <div className="profile-actions-row">
              <button className="button button-primary button-small" type="button" onClick={handleSave} disabled={isPending}>
                {isPending ? "Saving..." : "Save display name"}
              </button>
            </div>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Shortcuts</p>
          <div className="profile-shortcuts">
            <Link className="profile-shortcut" href="/dashboard">
              Open dashboard
            </Link>
            <Link className="profile-shortcut" href="/settings">
              Open settings
            </Link>
            <Link className="profile-shortcut" href="/transactions">
              Review transactions
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

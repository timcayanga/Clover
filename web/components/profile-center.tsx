"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";

export function ProfileCenter() {
  const { user } = useUser();
  const displayName = user?.fullName ?? user?.firstName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "Profile";
  const email = user?.primaryEmailAddress?.emailAddress ?? "tim@example.com";
  const initial = displayName.trim().slice(0, 1).toUpperCase();
  const avatar = user?.imageUrl ?? null;

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
        </div>
      </article>

      <div className="profile-grid">
        <article className="panel">
          <p className="eyebrow">Identity</p>
          <h4>What Clover knows about you</h4>
          <div className="profile-list">
            <div>
              <span>Display name</span>
              <strong>{displayName}</strong>
            </div>
            <div>
              <span>Primary email</span>
              <strong>{email}</strong>
            </div>
            <div>
              <span>Avatar</span>
              <strong>{avatar ? "Synced from Clerk" : "Initial fallback"}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">Shortcuts</p>
          <h4>Quick access</h4>
          <div className="profile-shortcuts">
            <Link className="profile-shortcut" href="/notifications">
              View notifications
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

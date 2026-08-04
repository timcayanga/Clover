"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { clearAllWorkspaceCaches } from "@/lib/workspace-cache";
import { persistSelectedWorkspaceId } from "@/lib/workspace-selection";
import { signOutToLanding } from "@/lib/sign-out";

export function MoreSignOutButton() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);

  const handleSignOut = () => {
    if (busy) {
      return;
    }

    setBusy(true);
    persistSelectedWorkspaceId("");
    clearAllWorkspaceCaches();
    void signOutToLanding(signOut).finally(() => setBusy(false));
  };

  return (
    <button className="more-page__link more-page__link--button more-page__link--danger" type="button" onClick={handleSignOut} disabled={busy}>
      <span className="more-page__link-icon" aria-hidden="true">
        <svg className="more-page__link-icon-image" viewBox="0 0 24 24" fill="none">
          <path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10M14.5 8.5 18 12l-3.5 3.5M18 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="more-page__link-label">{busy ? "Logging out..." : "Log Out"}</span>
    </button>
  );
}

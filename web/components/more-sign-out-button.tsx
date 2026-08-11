"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { clearAllWorkspaceCaches } from "@/lib/workspace-cache";
import { persistSelectedWorkspaceId } from "@/lib/workspace-selection";
import { signOutToLanding } from "@/lib/sign-out";
import { getNavigationIconSrc } from "@/lib/navigation-icons";

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
        <img
          className="more-page__link-icon-image"
          src={getNavigationIconSrc("signOut")}
          alt=""
          width={96}
          height={96}
          loading="eager"
          decoding="sync"
        />
      </span>
      <span className="more-page__link-label">{busy ? "Logging out..." : "Log Out"}</span>
    </button>
  );
}

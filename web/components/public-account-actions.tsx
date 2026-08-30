"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { getAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";
import type { PublicAccountState } from "@/lib/public-account-state";
import { signOutToLanding } from "@/lib/sign-out";
import { clearAllWorkspaceCaches } from "@/lib/workspace-cache";
import { persistSelectedWorkspaceId } from "@/lib/workspace-selection";

type PublicAccountActionsProps = {
  variant?: "desktop" | "mobile";
  accountState?: PublicAccountState | null;
};

export function PublicAccountActions({ variant = "desktop", accountState }: PublicAccountActionsProps) {
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn, user } = useUser();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const accountMenuId = useId();
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const resolvedSignedIn = isLoaded ? isSignedIn : accountState?.signedIn ?? false;

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAccountMenuOpen(false);
      accountMenuTriggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  const handleSignOut = () => {
    if (signOutBusy) return;

    setSignOutBusy(true);
    setAccountMenuOpen(false);
    persistSelectedWorkspaceId("");
    clearAllWorkspaceCaches();
    void signOutToLanding(signOut).finally(() => setSignOutBusy(false));
  };

  if (!isLoaded && !accountState?.signedIn) {
    return <span className={`landing-account-actions--loading landing-account-actions--loading-${variant}`} aria-hidden="true" />;
  }

  if (resolvedSignedIn) {
    const displayName = accountState?.displayName ?? user?.firstName ?? user?.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "Account";
    const avatar = accountState?.avatarUrl ?? user?.imageUrl ?? null;

    return (
      <div ref={accountMenuRef} className={`landing-account-menu landing-account-menu--${variant}`}>
        <button
          ref={accountMenuTriggerRef}
          className={`landing-account-link landing-account-link--${variant}`}
          type="button"
          aria-label="My Account"
          aria-haspopup="menu"
          aria-expanded={accountMenuOpen}
          aria-controls={accountMenuId}
          onClick={() => setAccountMenuOpen((current) => !current)}
        >
          <span className="landing-account-link__avatar" aria-hidden="true" style={avatar ? undefined : getAvatarBackgroundStyle(displayName)}>
            {avatar ? <img src={avatar} alt="" /> : <span>{getAvatarInitials(displayName)}</span>}
          </span>
          <span>My Account</span>
          <span className="landing-account-link__chevron" aria-hidden="true">▾</span>
        </button>

        {accountMenuOpen ? (
          <div id={accountMenuId} className="landing-account-menu__panel" role="menu" aria-label="My Account">
            <Link className="landing-account-menu__item" href="/home" role="menuitem" onClick={() => setAccountMenuOpen(false)}>
              Go to Home
            </Link>
            <button className="landing-account-menu__item landing-account-menu__item--danger" type="button" role="menuitem" onClick={handleSignOut} disabled={signOutBusy}>
              {signOutBusy ? "Logging out..." : "Log Out"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (isLoaded ? !isSignedIn : accountState && !accountState.signedIn) {
    return variant === "mobile" ? (
      <Link className="button button-primary landing-nav__mobile-signup" href="/sign-up" prefetch={false}>
        Sign up
      </Link>
    ) : (
      <div className="landing-nav__desktop-actions">
        <Link className="landing-nav__link" href="/sign-in" prefetch={false}>
          Log in
        </Link>
        <Link className="button button-primary landing-nav__button" href="/sign-up" prefetch={false}>
          Sign up
        </Link>
      </div>
    );
  }

  return variant === "mobile" ? (
    <Link className="button button-primary landing-nav__mobile-signup" href="/sign-up" prefetch={false}>
      Sign up
    </Link>
  ) : (
    <div className="landing-nav__desktop-actions">
      <Link className="landing-nav__link" href="/sign-in" prefetch={false}>
        Log in
      </Link>
      <Link className="button button-primary landing-nav__button" href="/sign-up" prefetch={false}>
        Sign up
      </Link>
    </div>
  );
}

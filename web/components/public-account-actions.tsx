"use client";

import Link from "next/link";
import { getAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";
import type { PublicAccountState } from "@/lib/public-account-state";

type PublicAccountActionsProps = {
  variant?: "desktop" | "mobile";
  accountState?: PublicAccountState | null;
};

export function PublicAccountActions({ variant = "desktop", accountState }: PublicAccountActionsProps) {
  if (accountState?.signedIn) {
    const displayName = accountState.displayName ?? "Account";
    const avatar = accountState.avatarUrl ?? null;

    return (
      <Link className={`landing-account-link landing-account-link--${variant}`} href="/home" prefetch={false} aria-label="My Account">
        <span className="landing-account-link__avatar" aria-hidden="true" style={avatar ? undefined : getAvatarBackgroundStyle(displayName)}>
          {avatar ? <img src={avatar} alt="" /> : <span>{getAvatarInitials(displayName)}</span>}
        </span>
        <span>My Account</span>
      </Link>
    );
  }

  if (accountState && !accountState.signedIn) {
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

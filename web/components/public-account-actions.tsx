"use client";

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { getAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";

type PublicAccountActionsProps = {
  variant?: "desktop" | "mobile";
};

export function PublicAccountActions({ variant = "desktop" }: PublicAccountActionsProps) {
  const { isLoaded, isSignedIn, user } = useUser();

  if (isLoaded && isSignedIn && user) {
    const displayName = user.firstName ?? user.username ?? user.primaryEmailAddress?.emailAddress?.split("@")[0] ?? "Account";
    const avatar = user.imageUrl ?? null;

    return (
      <Link className={`landing-account-link landing-account-link--${variant}`} href="/home" prefetch={false} aria-label="My Account">
        <span className="landing-account-link__avatar" aria-hidden="true" style={avatar ? undefined : getAvatarBackgroundStyle(displayName)}>
          {avatar ? <img src={avatar} alt="" /> : <span>{getAvatarInitials(displayName)}</span>}
        </span>
        <span>My Account</span>
      </Link>
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

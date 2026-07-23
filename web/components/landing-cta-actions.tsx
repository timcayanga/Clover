"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { getAvatarBackgroundStyle, getAvatarInitials } from "@/lib/avatar-utils";
import { LandingSignupModal } from "@/components/landing-signup-modal";
import type { PublicAccountState } from "@/lib/public-account-state";

type LandingCtaActionsProps = {
  accountState: PublicAccountState;
  authEnabled: boolean;
};

export function LandingCtaActions({ accountState, authEnabled }: LandingCtaActionsProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  const signedIn = isLoaded ? Boolean(isSignedIn) : accountState.signedIn;

  if (!signedIn) {
    return (
      <>
        <LandingSignupModal enabled={authEnabled}>Organize my finances for free</LandingSignupModal>
        <Link className="button button-secondary button-pill" href="/sign-in" prefetch={false}>
          Log in
        </Link>
      </>
    );
  }

  const displayName = accountState.displayName ?? user?.firstName ?? user?.emailAddresses[0]?.emailAddress?.split("@")[0] ?? "Account";
  const avatarUrl = accountState.avatarUrl ?? user?.imageUrl ?? null;

  return (
    <Link className="button button-primary button-pill landing-account-cta" href="/home" prefetch={false}>
      <span
        className="landing-account-cta__avatar"
        aria-hidden="true"
        style={avatarUrl ? undefined : getAvatarBackgroundStyle(displayName)}
      >
        {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{getAvatarInitials(displayName)}</span>}
      </span>
      <span>Open Clover</span>
    </Link>
  );
}

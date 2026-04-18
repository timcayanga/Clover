"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import type { Appearance } from "@clerk/types";

type ClerkAuthScreenProps = {
  enabled: boolean;
  mode: "sign-in" | "sign-up";
};

const cloverAuthAppearance: Appearance = {
  layout: {
    logoImageUrl: "/clover-name-teal.svg",
    logoLinkUrl: "/",
    logoPlacement: "outside",
    socialButtonsPlacement: "bottom",
    socialButtonsVariant: "blockButton",
    showOptionalFields: false,
  },
};

export function ClerkAuthScreen({ enabled, mode }: ClerkAuthScreenProps) {
  if (!enabled) {
    return (
      <section className="glass" style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
        <p className="eyebrow">Authentication setup</p>
        <h1>Clerk is not configured for this environment yet.</h1>
        <p>
          Add <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> to the staging
          environment, then redeploy to enable the auth form.
        </p>
      </section>
    );
  }

  if (mode === "sign-in") {
    return (
      <div className="clerk-auth-screen">
        <SignIn appearance={cloverAuthAppearance} afterSignInUrl="/dashboard" afterSignUpUrl="/onboarding" />
      </div>
    );
  }

  return (
    <div className="clerk-auth-screen">
      <SignUp appearance={cloverAuthAppearance} afterSignUpUrl="/onboarding" afterSignInUrl="/dashboard" />
    </div>
  );
}

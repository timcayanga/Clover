"use client";

import { SignIn, SignUp } from "@clerk/nextjs";
import type { Appearance } from "@clerk/types";

type ClerkAuthScreenProps = {
  enabled: boolean;
  mode: "sign-in" | "sign-up";
};

const cloverAuthAppearance: Appearance = {
  layout: {
    logoImageUrl: "/clover-mark.svg",
    logoLinkUrl: "/",
    logoPlacement: "inside",
    socialButtonsPlacement: "bottom",
    socialButtonsVariant: "blockButton",
    showOptionalFields: false,
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    colorPrimary: "#03a8c0",
    colorPrimaryForeground: "#ffffff",
  },
  elements: {
    footer: {
      backgroundColor: "#ffffff",
      boxShadow: "none",
      marginTop: "0",
      paddingTop: "0",
      paddingBottom: "0",
    },
    footerAction: {
      backgroundColor: "#ffffff",
    },
    footerActionText: {
      color: "#6b7280",
    },
    footerActionLink: {
      color: "#03a8c0",
      fontWeight: "600",
    },
    footerItem: {
      display: "none",
    },
    footerPages: {
      display: "none",
    },
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
    <div className="clerk-auth-screen clerk-auth-screen--signup">
      <SignUp appearance={cloverAuthAppearance} afterSignUpUrl="/onboarding" afterSignInUrl="/dashboard" />
    </div>
  );
}

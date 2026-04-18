"use client";

import { useEffect, useRef } from "react";
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
  const signupShellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "sign-up") {
      return;
    }

    const hideClerkBadge = () => {
      const root = signupShellRef.current;

      if (!root) {
        return;
      }

      const nodes = Array.from(root.querySelectorAll<HTMLElement>("*"));
      const badgeNode = nodes.find((node) => /secured by\s+clerk/i.test(node.textContent?.replace(/\s+/g, " ").trim() ?? ""));

      if (badgeNode) {
        const row = badgeNode.parentElement ?? badgeNode;
        row.style.setProperty("background-color", "#ffffff", "important");
        row.style.setProperty("box-shadow", "none", "important");
        row.style.setProperty("border-top", "0", "important");
        row.style.setProperty("display", "none", "important");
      }
    };

    hideClerkBadge();

    const observer = new MutationObserver(hideClerkBadge);
    const root = signupShellRef.current;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }, [mode]);

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
    <div ref={signupShellRef} className="clerk-auth-screen clerk-auth-screen--signup">
      <SignUp appearance={cloverAuthAppearance} afterSignUpUrl="/onboarding" afterSignInUrl="/dashboard" />
    </div>
  );
}

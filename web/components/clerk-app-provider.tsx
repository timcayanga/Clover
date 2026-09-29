"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { selectExistingClerkSession } from "@/lib/clerk-initial-session";
import type { SignedInSessionResource } from "@clerk/types";
import type { PropsWithChildren } from "react";
import { readRememberedSessionId, readStaySignedInPreference } from "@/lib/clerk-session-persistence";

type ClerkAppProviderProps = PropsWithChildren<{
  publishableKey: string;
  localization: Record<string, unknown>;
}>;

export function ClerkAppProvider({ publishableKey, localization, children }: ClerkAppProviderProps) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      supportEmail="hello@clover.ph"
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      localization={localization}
      touchSession
      experimental={{ persistClient: true }}
      afterSignOutUrl="/"
      afterMultiSessionSingleSignOutUrl="/"
      selectInitialSession={(client) => {
        // Opting out of a remembered login must not deselect this browser's
        // currently active Clerk session or stop its token refresh.
        const rememberedSessionId = readStaySignedInPreference() ? readRememberedSessionId() : "";
        return selectExistingClerkSession({sessions: client.sessions as SignedInSessionResource[], lastActiveSessionId:client.lastActiveSessionId}, rememberedSessionId);
      }}
    >
      {children}
    </ClerkProvider>
  );
}

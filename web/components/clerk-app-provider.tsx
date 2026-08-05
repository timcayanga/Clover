"use client";

import { ClerkProvider } from "@clerk/nextjs";
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
        if (!readStaySignedInPreference()) {
          return null;
        }

        const rememberedSessionId = readRememberedSessionId();
        if (rememberedSessionId) {
          const rememberedSession = client.sessions.find((session) => session.id === rememberedSessionId) as
            | SignedInSessionResource
            | undefined;

          if (rememberedSession) {
            return rememberedSession;
          }
        }

        return (
          (client.sessions.find((session) => session.id === client.lastActiveSessionId) as
            | SignedInSessionResource
            | undefined) ??
          (client.sessions[0] as SignedInSessionResource | undefined) ??
          null
        );
      }}
    >
      {children}
    </ClerkProvider>
  );
}

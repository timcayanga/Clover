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
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      localization={localization}
      touchSession
      experimental={{ persistClient: true }}
      selectInitialSession={(client) => {
        if (!readStaySignedInPreference()) {
          return null;
        }

        const rememberedSessionId = readRememberedSessionId();
        if (rememberedSessionId) {
          return (client.sessions.find((session) => session.id === rememberedSessionId) as SignedInSessionResource | undefined) ?? null;
        }

        return (client.sessions.find((session) => session.id === client.lastActiveSessionId) as
          | SignedInSessionResource
          | undefined) ?? null;
      }}
    >
      {children}
    </ClerkProvider>
  );
}

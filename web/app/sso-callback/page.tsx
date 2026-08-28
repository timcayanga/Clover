"use client";

import { useEffect } from "react";
import { AuthenticateWithRedirectCallback, useAuth } from "@clerk/nextjs";
import { CloverRouteLoadingScreen } from "@/components/clover-route-loading-screen";
import {
  persistRememberedSessionId,
  readStaySignedInPreference,
  persistStaySignedInPreference,
} from "@/lib/clerk-session-persistence";

export default function SsoCallbackPage() {
  const auth = useAuth();

  useEffect(() => {
    document.title = "Clover | SSO Callback";
  }, []);

  useEffect(() => {
    if (!auth.isLoaded || !auth.isSignedIn || !auth.sessionId) {
      return;
    }

    const staySignedIn = readStaySignedInPreference();
    persistStaySignedInPreference(staySignedIn);
    persistRememberedSessionId(staySignedIn ? auth.sessionId : null);
  }, [auth.isLoaded, auth.isSignedIn, auth.sessionId]);

  return (
    <main className="auth-page">
      <CloverRouteLoadingScreen label="secure sign-in" viewport />
      <AuthenticateWithRedirectCallback
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        signInFallbackRedirectUrl="/home"
        signUpFallbackRedirectUrl="/home"
      />
    </main>
  );
}

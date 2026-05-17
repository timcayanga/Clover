"use client";

import { useEffect } from "react";
import { AuthenticateWithRedirectCallback, useAuth } from "@clerk/nextjs";
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
      <section className="clover-auth-card glass">
        <div className="clover-auth-card__brand">
          <img className="clover-auth-card__logo" src="/clover-logo-full.svg" alt="Clover" />
        </div>
        <p className="clover-auth-card__loading">Completing your sign-in...</p>
        <AuthenticateWithRedirectCallback
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInForceRedirectUrl="/home"
          signUpForceRedirectUrl="/home"
          signInFallbackRedirectUrl="/home"
          signUpFallbackRedirectUrl="/home"
        />
      </section>
    </main>
  );
}

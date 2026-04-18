"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SsoCallbackPage() {
  return (
    <main className="auth-page">
      <section className="clover-auth-card glass">
        <div className="clover-auth-card__brand">
          <img className="clover-auth-card__logo" src="/clover-mark.svg" alt="Clover" />
        </div>
        <p className="clover-auth-card__loading">Completing your sign-in...</p>
        <AuthenticateWithRedirectCallback
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInForceRedirectUrl="/dashboard"
          signUpForceRedirectUrl="/dashboard"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
        />
      </section>
    </main>
  );
}
